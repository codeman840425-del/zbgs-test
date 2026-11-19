const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');

const measuredHeaders = new Set(['accept-ranges','cache-control','content-encoding','content-length',
  'content-range','content-type','etag','last-modified','transfer-encoding']);
const headerPins = headers => Object.fromEntries(Object.entries(headers ?? {})
  .map(([key,value]) => [key.toLowerCase(),value]).filter(([key]) => measuredHeaders.has(key)));
const measurementUnavailable = message => Object.assign(Error(message), {kind:'measurement-unavailable'});

async function observeNetwork(context, page) {
  const session = await context.newCDPSession(page);
  await session.send('Network.enable', {maxTotalBufferSize: 96 * 1024 * 1024, maxResourceBufferSize: 32 * 1024 * 1024});
  await session.send('Network.setCacheDisabled', {cacheDisabled: true});
  await session.send('Network.setBypassServiceWorker', {bypass: true});
  const responses = [], finished = new Map(), cached = new Set(), failed = [], chains = new Map();
  let phase = 'before-navigation';
  function event(id, detail) {
    if (!chains.has(id)) chains.set(id, []);
    chains.get(id).push({phase, observedAt:Date.now(), ...detail});
  }
  session.on('Network.requestWillBeSent', ({requestId, request, timestamp, initiator, type, redirectResponse}) =>
    event(requestId, {event:'request', url:request.url, method:request.method, timestamp, type, initiator,
      ...(redirectResponse ? {redirectFrom:{url:redirectResponse.url,status:redirectResponse.status}} : {})}));
  session.on('Network.responseReceived', row => {
    responses.push(row);
    event(row.requestId, {event:'response', url:row.response.url, status:row.response.status, timestamp:row.timestamp,
      type:row.type, protocol:row.response.protocol, fromDiskCache:row.response.fromDiskCache,
      fromServiceWorker:row.response.fromServiceWorker, fromPrefetchCache:row.response.fromPrefetchCache,
      headers:headerPins(row.response.headers)});
  });
  session.on('Network.responseReceivedExtraInfo', row =>
    event(row.requestId, {event:'response-extra', status:row.statusCode, headers:headerPins(row.headers)}));
  session.on('Network.loadingFinished', row => {
    finished.set(row.requestId, row);
    event(row.requestId, {event:'finish', timestamp:row.timestamp, encodedDataLength:row.encodedDataLength});
  });
  session.on('Network.requestServedFromCache', row => {
    cached.add(row.requestId);
    event(row.requestId, {event:'cache'});
  });
  session.on('Network.loadingFailed', row => {
    failed.push(row);
    event(row.requestId, {event:'fail', ...row});
  });

  async function read(url) {
    const matches = responses.filter(row => row.response.url === url);
    try {
      assert.equal(matches.length, 1, `Expected one cold response for ${url}, got ${matches.length}`);
      return await readResponse(matches[0]);
    } catch (error) {
      const requestId=matches.length===1?matches[0].requestId:undefined;
      throw Object.assign(error,{url,requestId,lifecycle:chains.get(requestId)?.slice()});
    }
  }
  async function readResponse({requestId, response}) {
    const url = response.url;
    assert.equal(response.status, 200, `Unexpected status for ${url}`);
    assert.ok(!cached.has(requestId) && !response.fromDiskCache && !response.fromServiceWorker && !response.fromPrefetchCache,
      `Cache or service worker served ${url}`);
    const headers = headerPins(response.headers);
    const contentEncoding = headers['content-encoding'] ?? 'identity';
    assert.equal(contentEncoding, 'identity', `Use the uncompressed fixed-build HTTP harness for ${url}`);
    await waitForTerminal(requestId);
    const failure = failed.find(row => row.requestId === requestId);
    assert.ok(!failure, `Network.loadingFailed for ${url}: ${failure?.errorText}`);
    const done = finished.get(requestId);
    if (!done) throw measurementUnavailable(`Missing CDP Network.loadingFinished for ${url}`);
    let body;
    try { body = await session.send('Network.getResponseBody', {requestId}); }
    catch (error) { throw measurementUnavailable(`CDP Network.getResponseBody for ${url}: ${error.message}`); }
    const bytes = Buffer.from(body.body, body.base64Encoded ? 'base64' : 'utf8');
    if (headers['content-length'] !== undefined) assert.equal(bytes.length, Number(headers['content-length']), url);
    assert.ok(bytes.length > 0, `Empty CDP response body for ${url}`);
    if (!Number.isSafeInteger(done.encodedDataLength) || done.encodedDataLength < bytes.length)
      throw Object.assign(measurementUnavailable(`Missing measured transfer bytes for ${url}`),
        {receivedBody:{status:response.status,bytes}});
    return {requestId, bytes, status:response.status, protocol:response.protocol, contentEncoding, transferBytes:done.encodedDataLength};
  }
  async function waitForTerminal(requestId) {
    if (finished.has(requestId) || failed.some(row => row.requestId === requestId)) return;
    await new Promise(resolve => {
      const events = ['Network.loadingFinished','Network.loadingFailed'];
      const onTerminal = row => {if (row.requestId === requestId) done();};
      const timer = setTimeout(done, 1000);
      function done() {
        clearTimeout(timer);
        for (const event of events) session.off(event,onTerminal);
        resolve();
      }
      for (const event of events) session.on(event,onTerminal);
    });
  }
  const lifecycle = () => [...chains].map(([requestId,events])=>({requestId,events}));
  async function readAttempts(url) {
    const attempts = [];
    for (const {requestId, events} of lifecycle().filter(r=>r.events.some(e=>e.event==='request' && e.url===url))) {
      try {
        assert.equal(events.filter(e=>e.event==='request').length, 1, 'Redirected motion request');
        const response = responses.find(r=>r.requestId===requestId && r.response.url===url);
        assert(response, 'No response for this request ID');
        attempts.push({...await readResponse(response), lifecycle:events.slice()});
      } catch (error) {
        attempts.push({requestId,error:error.message,kind:error.kind ?? 'network-or-integrity-failed',
          receivedBody:error.receivedBody,lifecycle:events.slice()});
      }
    }
    return attempts;
  }
  return {read, readAttempts, stage: value => {phase=value;}, diagnostics: (selectedUrls=[]) => ({
    httpErrors:responses.filter(row => row.response.status >= 400).map(({response}) => ({url:response.url, status:response.status})),
    failed:failed.map(({requestId, type, errorText, canceled}) => ({requestId, type, errorText, canceled,
      url:chains.get(requestId)?.findLast(e=>e.event==='request')?.url ?? null})),
    requestLifecycle:lifecycle().filter(r=>r.events.some(e=>e.event==='fail' || selectedUrls.includes(e.url) || e.url?.includes('/assets/motion/')) ||
      (r.events.some(e=>e.event==='response') && !r.events.some(e=>e.event==='finish'))),
  })};
}

function measureAttempts(url, pin, attempts) {
  const row = {url,transfer:[],attempts:[]};
  const failures = [];
  const payload = ({status,bytes}) => ({status,bytes:bytes.length,
    sha256:createHash('sha256').update(bytes).digest('hex')});
  const matches = observed => observed.status===200 && observed.sha256===pin.sha256 && observed.bytes===pin.bytes;
  for (const attempt of attempts) {
    const {requestId,lifecycle,error,kind,receivedBody} = attempt;
    const result = {requestId,lifecycle};
    const observed = receivedBody ? payload(receivedBody) : error ? null : payload(attempt);
    if (observed && !matches(observed)) {
      result.kind='network-or-integrity-failed';
      result.error='CDP body differs from the pinned package bytes';
      result.observed=observed;
      failures.push(result.error);
    } else if (error) {
      Object.assign(result,{kind,error});
      if (observed) result.verifiedBody=observed;
      if (kind!=='measurement-unavailable') failures.push(error);
    } else {
      const measured = {...observed,transferBytes:attempt.transferBytes};
      Object.assign(result,measured);
      row.transfer.push(measured);
    }
    row.attempts.push(result);
  }
  if (!attempts.length) failures.push('No observed CDP request');
  return {row,failures,unavailable:row.attempts.filter(attempt=>attempt.kind==='measurement-unavailable')};
}

module.exports = {observeNetwork,measureAttempts};
