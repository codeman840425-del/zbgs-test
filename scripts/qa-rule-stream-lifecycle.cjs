const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {productionRoot, projectOutput} = require('./project-output.cjs');
const {browserConfigArgs} = require('./qa-browser-config-args.cjs');
const {launchQABrowser} = require('./qa-browser-workspace.cjs');
const {observeNetwork} = require('./qa-cold-assets.cjs');
const {validateContentPin,observeContent}=require('./qa-cdp-content.cjs');

// Playwright serializes this function into the page before the game modules load.
function observePage({urls}) {
  const targets = new Set(urls);
  const operations = [];
  const responses = new WeakMap(), streams = new WeakMap(), readers = new WeakMap();
  const bySignal = new WeakMap();
  const at = () => performance.now();
  const mark = (row, event, fields) => row.events.push({event, pageMs:at(), ...fields});
  const begin = (url, method, signal) => {
    const row = {operationId:operations.length+1, url, method, events:[]};
    operations.push(row);
    mark(row, 'fetch-start', {stack:new Error().stack, signalPresent:!!signal, signalAlreadyAborted:signal?.aborted ?? false});
    if (signal) {
      if (!bySignal.has(signal)) bySignal.set(signal, []);
      bySignal.get(signal).push(row);
      signal.addEventListener('abort', () => mark(row, 'signal-abort-event', {reasonName:signal.reason?.name}), {once:true});
    }
    return row;
  };
  function observePromise(promise, row, onResolve, onReject) {
    // Return the same native promise. This observer does not read a second copy or change the native result.
    promise.then(onResolve, error => mark(row, onReject, {errorName:error?.name}));
    return promise;
  }
  function wrap(owner, name, observe) {
    const original = owner[name];
    owner[name] = function (...args) { return observe.call(this, original, args); };
  }

  wrap(globalThis, 'fetch', function (original, args) {
    const [input, init] = args;
    const request = input instanceof Request ? input : null;
    let url;
    try { url = new URL(request?.url ?? input, location.href).href; }
    catch { return Reflect.apply(original, this, args); }
    if (!targets.has(url)) return Reflect.apply(original, this, args);
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
    const signal = init?.signal === undefined ? request?.signal : init.signal;
    const row = begin(url, method, signal);
    return observePromise(Reflect.apply(original, this, args), row, response => {
      responses.set(response, row);
      mark(row, 'fetch-response', {url:response.url, status:response.status});
    }, 'fetch-rejected');
  });
  const body = Object.getOwnPropertyDescriptor(Response.prototype, 'body');
  Object.defineProperty(Response.prototype, 'body', {...body, get() {
    const stream = body.get.call(this), row = responses.get(this);
    if (stream && row) streams.set(stream, row);
    return stream;
  }});
  wrap(Response.prototype, 'arrayBuffer', function (original, args) {
    const result = Reflect.apply(original, this, args), row = responses.get(this);
    if (row) {
      mark(row, 'array-buffer-call');
      observePromise(result, row, bytes => mark(row, 'array-buffer-resolved', {bytes:bytes.byteLength}), 'array-buffer-rejected');
    }
    return result;
  });
  wrap(ReadableStream.prototype, 'getReader', function (original, args) {
    const reader = Reflect.apply(original, this, args), row = streams.get(this);
    if (row) {
      readers.set(reader, row);
      mark(row, 'get-reader', {mode:args[0]?.mode ?? 'default'});
    }
    return reader;
  });
  const readerProto = ReadableStreamDefaultReader.prototype;
  wrap(readerProto, 'read', function (original, args) {
    const result = Reflect.apply(original, this, args), row = readers.get(this);
    if (row) observePromise(result, row, ({done,value}) =>
      mark(row, 'reader-read', {done, bytes:value?.byteLength ?? 0}), 'reader-read-rejected');
    return result;
  });
  for (const [proto, method, owned, event] of [
    [readerProto,'cancel',readers,'reader-cancel-call'],
    [readerProto,'releaseLock',readers,'reader-release-lock-call'],
    [ReadableStream.prototype,'cancel',streams,'stream-cancel-call'],
  ]) {
    wrap(proto, method, function (original, args) {
      const row = owned.get(this);
      if (row) mark(row, event, {stack:new Error().stack});
      return Reflect.apply(original, this, args);
    });
  }
  wrap(AbortController.prototype, 'abort', function (original, args) {
    for (const row of bySignal.get(this.signal) ?? []) mark(row, 'controller-abort-call', {stack:new Error().stack});
    return Reflect.apply(original, this, args);
  });
  const snapshot = () => ({timeOriginMs:performance.timeOrigin, operations});
  Object.defineProperty(globalThis, '__qaStreamLifecycle', {value:snapshot});
  globalThis.addEventListener?.('pagehide', event => {
    const pageMs = at();
    queueMicrotask(() => {
      // The browser may tear down this document before the binding reaches the driver.
      globalThis.__qaStreamPagehide?.({...snapshot(), pageMs, persisted:event.persisted}).catch(() => {});
    });
  });
}

async function observeTransfer(context, page, urls, contentPin) {
  const cdp = await context.newCDPSession(page);
  const observer = await observeNetwork({newCDPSession:async () => cdp}, page);
  const wanted = new Set(urls), byId = new Map();
  cdp.on('Network.requestWillBeSent', ({requestId,request,timestamp,wallTime}) => {
    if (wanted.has(request.url) && !byId.has(requestId))
      byId.set(requestId, {clock:{timestamp,wallTime}, dataReceived:[]});
  });
  cdp.on('Network.dataReceived', ({requestId,timestamp,dataLength,encodedDataLength}) => {
    byId.get(requestId)?.dataReceived.push({timestamp,dataLength,encodedDataLength});
  });
  observer.stage('initial-registration-and-restore');
  const snapshot=() => observer.diagnostics(urls).requestLifecycle.filter(row => byId.has(row.requestId))
    .map(row => ({...row, ...byId.get(row.requestId)}));
  if(contentPin)snapshot.content=observeContent(cdp,contentPin);
  return snapshot;
}

function associateAttempts(network, {timeOriginMs, operations}) {
  // A start between the fetch call and its observed resolution is evidence of a candidate only.
  // CDP clock conversion and the renderer's reduced time precision have independent error.
  const clockToleranceMs = 5;
  const matches = network.map(({requestId,events,clock}) => {
    const requests = events.filter(e => e.event === 'request');
    if (requests.length !== 1 || !Number.isFinite(clock?.wallTime)) return {requestId, candidates:[]};
    const [{url,method}] = requests, started = clock.wallTime*1000-timeOriginMs;
    const candidates = operations.filter(row => {
      const begin = row.events.find(e => e.event==='fetch-start');
      const end = row.events.find(e => ['fetch-response','fetch-rejected'].includes(e.event));
      return row.url===url && row.method===method && begin && end &&
        started>=begin.pageMs-clockToleranceMs && started<=end.pageMs+clockToleranceMs;
    }).map(row => row.operationId);
    return {requestId, candidates};
  });
  return matches.map(({requestId,candidates}) => ({requestId, directPageRequestId:'unobserved',
    correlation:candidates.length===1 && matches.filter(row=>row.candidates.includes(candidates[0])).length===1
      ? 'unique-url-method-time-candidate' : candidates.length ? 'ambiguous' : 'unobserved',
    candidateOperationIds:candidates}));
}

function pageSnapshot() {
  const game = window.__recordConsumer;
  const actors = game ? [...game.actors.values()].map(actor => {
    const avatar = actor.avatar, outfit = avatar.getOutfitInfo();
    const visible = new Set(Object.values(outfit.equipment.items).filter(item => item.visible).map(item => item.id));
    return {id:actor.identity.id, recordSha256:actor.recordSha256, attached:avatar.root.parent===game.scene,
      body:{url:avatar.profile.url, bodyType:avatar.profile.bodyType, sha256:avatar.profile.sha256},
      selected:Object.values(avatar.getEquipmentRecipe(outfit.index)).map(item => ({
        id:item.id, url:new URL(item.url,new URL(avatar.config.manifestUrl,location.href)).pathname, sha256:item.sha256,
        slot:item.slot, visible:visible.has(item.id)}))};
  }) : [];
  return {...window.__qaStreamLifecycle(), selectedAtPageMs:performance.now(), game:{
    sourceDigest:game?.buildInfo.sourceDigest, ready:game?.ready, inputFailure:game?.inputFailure,
    selectedGroup:game?.selected, items:game?.snapshot()?.items.map(item=>({id:item.identityId,status:item.status})), actors}};
}

function checkSelection(game, pack, assets) {
  assert(game.ready && !game.inputFailure, game.inputFailure ?? 'Game did not become ready');
  assert.equal(game.sourceDigest, pack.runtime.sourceDigest);
  assert.deepEqual(game.items, pack.records.map(({id})=>({id,status:'completed'})));
  assert.deepEqual(game.actors.map(({id,recordSha256})=>({id,recordSha256})),
    pack.records.map(({id,recordSha256})=>({id,recordSha256})));
  for (const [index,actor] of game.actors.entries()) {
    const record = pack.records[index];
    assert(actor.attached);
    assert.equal(actor.body.bodyType,record.bodyType);
    assert.equal(actor.body.sha256,record.avatarSha256);
    assert.deepEqual(actor.selected.map(item=>item.id).sort(), [...record.equipmentIds].sort());
    assert.deepEqual(actor.selected.map(item=>item.slot).sort(), ['bottom','shoes','top']);
    for (const item of [actor.body,...actor.selected]) {
      assert.notEqual(item.visible,false,'Selected garment is not visible');
      assert.equal(assets.get(item.url)?.sha256,item.sha256,'Selected file does not match packaged file');
    }
  }
}

function contentSelection(recordId,pack,origin){
  const matches=pack.records.filter(r=>r.id===recordId);
  assert.equal(matches.length,1,'expected one packaged record');
  const {bodyType,avatarSha256}=matches[0];
  assert(/^rule-body-[a-f0-9]{20}$/.test(bodyType) && bodyType==='rule-body-'+avatarSha256.slice(0,20));
  const pathname='assets/'+bodyType+'/body.vrm';
  const files=pack.files.filter(f=>f.path===pathname);
  assert.equal(files.length,1,'expected one body file');
  const [{bytes,sha256}]=files;
  assert.equal(sha256,avatarSha256);
  assert(files[0].provenance?.some(p=>p.packPath===pathname && /^[a-f0-9]{64}$/.test(p.indexSha256)),
    'expected an externally published body');
  return validateContentPin({recordId,url:new URL(pathname,origin).href,bytes,sha256});
}

function identifyRegistration(sample,page,associations){
  const match=associations?.find(row=>row.requestId===sample.requestId);
  const op=page?.operations.find(row=>row.operationId===match?.candidateOperationIds[0]);
  const actor=page?.game?.actors.find(a=>a.id===sample.pin.recordId);
  const reads=op?.events.filter(e=>e.event==='reader-read')??[];
  if(match?.correlation==='unique-url-method-time-candidate' && op?.url===sample.pin.url && op.method==='GET' &&
    op.events.some(e=>e.event==='get-reader' && e.mode==='default') &&
    reads.at(-1)?.done && reads.reduce((total,e)=>total+e.bytes,0)===sample.pin.bytes &&
    actor?.attached && actor.body.sha256===sample.pin.sha256){
    sample.registration={correlation:match.correlation,pageOperationId:op.operationId,directPageRequestId:'unobserved'};
  }else{
    sample.registration={correlation:match?.correlation??'unobserved',directPageRequestId:'unobserved'};
    sample.status='rejected';
    sample.error??='selected request cannot be uniquely associated with the signed actor registration reader';
  }
}

async function run(base, manifestSha, ...args) {
  const {remaining,launchOptions}=browserConfigArgs(args);
  const [output,option,recordId]=remaining;
  assert((remaining.length===1 || (remaining.length===3 && option==='--cdp-content-record' && recordId)) &&
    /^[0-9a-f]{64}$/.test(manifestSha),
    'Usage via run-fixed-check: PACKAGE_MANIFEST_SHA NEW_EVIDENCE_DIR [--cdp-content-record RECORD_ID] [--browser-config PATH]');
  const root = await productionRoot(), out = await projectOutput(output,root);
  const destination = path.join(out,'report.json');
  const origin = new URL(base);
  assert(origin.protocol==='http:' && origin.hostname==='127.0.0.1');
  const response = await fetch(new URL('runtime-package.json',origin),{redirect:'error'});
  assert.equal(response.status,200);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'),manifestSha);
  const pack = JSON.parse(bytes), assets = new Map(pack.files.map(file=>['/'+file.path,file]));
  const contentPin=recordId?contentSelection(recordId,pack,origin):undefined;
  const urls = [...assets.keys()].filter(url=>url.startsWith('/assets/') && /\.(vrm|glb)$/.test(url))
    .map(url=>new URL(url,origin).href);
  const entry = new URL(pack.runtime.entryUrl,origin);
  assert(entry.origin===origin.origin && entry.pathname==='/record-consumer.html');
  assert(urls.length>0);
  assert.equal(await projectOutput(out,root),out);
  await fs.mkdir(out);
  const report = {schema:'rule-stream-lifecycle-v1', status:'incomplete', manifestSha, build:pack.runtime.sourceDigest,
    networkIntegrity:'not-evaluated', pageErrors:[], close:[], pagehide:{status:'unobserved'}};
  let session, page, transfers;
  try {
    session = await launchQABrowser(out,launchOptions);
    report.browser = {version:session.browser.version(), deployment:session.receipt};
    const context = await session.browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:800}});
    page = await context.newPage();
    page.on('pageerror', error=>report.pageErrors.push(error.message));
    page.on('close', ()=>report.close.push({event:'page-close-observed', nodeEpochMs:Date.now()}));
    transfers = await observeTransfer(context,page,urls,contentPin);
    await page.exposeBinding('__qaStreamPagehide', ({frame}, snapshot) => {
      if (frame===page.mainFrame()) report.pagehide={status:'observed',...snapshot};
    });
    await page.addInitScript(observePage,{urls});
    await page.goto(entry.href);
    await page.waitForFunction(()=>window.__recordConsumer?.ready,null,{timeout:120000});
    report.page = await page.evaluate(pageSnapshot);
    checkSelection(report.page.game,pack,assets);
    assert.deepEqual(report.pageErrors,[]);
    report.status='game-selection-observed';
  } catch(error) {
    report.failure=String(error.stack??error);
    report.status='game-observation-failed';
    process.exitCode=1;
    if (page && !page.isClosed() && !report.page) report.page=await page.evaluate(pageSnapshot).catch(()=>undefined);
  } finally {
    try {
      if(transfers?.content)report.cdpContent=await transfers.content();
      if (page && !page.isClosed()) {
        report.close.push({event:'diagnostic-page-close-call', nodeEpochMs:Date.now()});
        await page.close();
      }
    } finally {
      if (transfers) report.network=transfers();
      if (report.page && report.network) report.associations=associateAttempts(report.network,report.page);
      if(report.cdpContent){
        identifyRegistration(report.cdpContent,report.page,report.associations);
        if(report.cdpContent.status==='rejected')process.exitCode ||= 2;
      }
      try { await session?.close(); }
      finally { await fs.writeFile(await projectOutput(destination,out),JSON.stringify(report,null,2)+'\n',{flag:'wx'}); }
    }
  }
}

if (require.main===module) run(...process.argv.slice(2)).catch(error=>{console.error(error);process.exitCode=1;});
module.exports = {observePage, observeTransfer, associateAttempts, checkSelection,contentSelection,identifyRegistration};
