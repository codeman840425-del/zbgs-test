const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const test = require('node:test');
const {observePage, observeTransfer, associateAttempts, checkSelection} = require('./qa-rule-stream-lifecycle.cjs');

const url = 'http://127.0.0.1:4199/assets/body.vrm';

test('page hooks observe native EOF, lock release, explicit cancel and abort as separate events', async () => {
  globalThis.location = {href:'http://127.0.0.1:4199/record-consumer.html'};
  const responses = [new Response(Uint8Array.of(1,2,3)), new Response(Uint8Array.of(4,5)),
    new Response(new ReadableStream()), new Response()];
  const promises = responses.map(response=>Promise.resolve(response));
  let index=0;
  globalThis.fetch = () => promises[index++];
  observePage({urls:[url]});

  const first = fetch(url);
  assert.equal(first,promises[0]);
  const reader = (await first).body.getReader();
  assert.equal((await reader.read()).value.byteLength,3);
  assert.equal((await reader.read()).done,true);
  reader.releaseLock();
  assert.equal((await (await fetch(url)).arrayBuffer()).byteLength,2);
  const aborted = new AbortController();
  const third = await fetch(url,{signal:aborted.signal});
  const cancel = third.body.getReader();
  await cancel.cancel();
  aborted.abort();
  const already = new AbortController();
  already.abort();
  await fetch(url,{signal:already.signal});

  const {operations,timeOriginMs}=globalThis.__qaStreamLifecycle();
  assert(Number.isFinite(timeOriginMs));
  assert.deepEqual(operations[0].events.map(e=>e.event),['fetch-start','fetch-response','get-reader','reader-read','reader-read','reader-release-lock-call']);
  assert.deepEqual(operations[0].events.filter(e=>e.event==='reader-read').map(({done,bytes})=>({done,bytes})),
    [{done:false,bytes:3},{done:true,bytes:0}]);
  assert.equal(operations[1].events.find(e=>e.event==='array-buffer-resolved').bytes,2);
  assert.deepEqual(operations[2].events.slice(-3).map(e=>e.event),
    ['reader-cancel-call','controller-abort-call','signal-abort-event']);
  assert(operations[3].events[0].signalAlreadyAborted);
  assert.deepEqual(operations[3].events.map(e=>e.event),['fetch-start','fetch-response']);
});

test('same CDP ID retains each chunk, raw HTTP and canceled terminal without inferring a page abort',async()=>{
  const session = new EventEmitter();
  const sent=[];
  session.send=async (method,options)=>sent.push({method,options});
  const snapshot = await observeTransfer({newCDPSession:async()=>session},{},[url]);
  const init={type:'script',stack:{callFrames:[{functionName:'readPack'}]}};
  session.emit('Network.requestWillBeSent',{requestId:'1',request:{url,method:'GET'},timestamp:21,wallTime:100,initiator:init});
  session.emit('Network.responseReceived',{requestId:'1',timestamp:21.1,response:{url,status:200,headers:{'Content-Length':'5'}}});
  session.emit('Network.dataReceived',{requestId:'9',timestamp:21.2,dataLength:5000,encodedDataLength:5000});
  session.emit('Network.dataReceived',{requestId:'1',timestamp:21.3,dataLength:2,encodedDataLength:2});
  session.emit('Network.dataReceived',{requestId:'1',timestamp:21.4,dataLength:3,encodedDataLength:0});
  session.emit('Network.loadingFailed',{requestId:'1',timestamp:21.5,canceled:true,errorText:'net::ERR_ABORTED'});
  const [row]=snapshot();
  assert.equal(row.requestId,'1');
  assert.deepEqual(row.clock,{timestamp:21,wallTime:100});
  assert.deepEqual(row.events.map(e=>e.event),['request','response','fail']);
  assert.equal(row.events[0].initiator,init);
  assert.equal(row.events[1].headers['content-length'],'5');
  assert.equal(row.events[2].canceled,true);
  assert.deepEqual(row.dataReceived,[{timestamp:21.3,dataLength:2,encodedDataLength:2},
    {timestamp:21.4,dataLength:3,encodedDataLength:0}]);
  assert.deepEqual(sent.map(x=>x.method),['Network.enable','Network.setCacheDisabled','Network.setBypassServiceWorker']);
  assert.deepEqual(associateAttempts([row],{timeOriginMs:99990,operations:[]}),
    [{requestId:'1',directPageRequestId:'unobserved',correlation:'unobserved',candidateOperationIds:[]}]);
});

test('only a unique two-way timing window gives a candidate and never claims direct ID',()=>{
  const network = (requestId, pageMs, extra=[]) => ({requestId,clock:{wallTime:(100000+pageMs)/1000},
    events:[{event:'request',url,method:'GET'},...extra]});
  const read = (operationId, start, end) => ({operationId,url,method:'GET',
    events:[{event:'fetch-start',pageMs:start},{event:'fetch-response',pageMs:end}]});
  const associate = (requests,operations) => associateAttempts(requests,{timeOriginMs:100000,operations});
  assert.deepEqual(associate([network('r1',20),network('r2',110)], [read(1,18,30),read(2,105,120)]), [
    {requestId:'r1',directPageRequestId:'unobserved',correlation:'unique-url-method-time-candidate',candidateOperationIds:[1]},
    {requestId:'r2',directPageRequestId:'unobserved',correlation:'unique-url-method-time-candidate',candidateOperationIds:[2]},
  ]);
  assert.deepEqual(associate([network('1',20),network('2',22),network('redirect',110,[{event:'request',url,method:'GET'}])],
    [read(1,15,32),read(2,23,37),read(3,106,120)]).map(r=>r.correlation), ['ambiguous','ambiguous','unobserved']);
  assert.deepEqual(associate([network('1',20),network('2',22)], [read(1,15,32)]).map(r=>r.correlation), ['ambiguous','ambiguous']);
});

test('business observation requires the signed actor attached with the pinned body and visible outfit',()=>{
  const selected = ['top','bottom','shoes'].map(slot=>({id:slot,url:'/'+slot,slot,sha256:slot,visible:true}));
  const body={url:'/body.vrm',bodyType:'body',sha256:'body'};
  const game={ready:true,sourceDigest:'frozen',items:[{id:'actor',status:'completed'}],
    actors:[{id:'actor',recordSha256:'record',attached:true,body,selected}]};
  const packageManifest={runtime:{sourceDigest:'frozen'},records:[{id:'actor',recordSha256:'record',bodyType:'body',
    avatarSha256:'body',equipmentIds:['top','shoes','bottom']}]};
  const pins=new Map([body,...selected].map(asset=>[asset.url,asset]));
  checkSelection(game,packageManifest,pins);
  selected[0].visible=false;
  assert.throws(()=>checkSelection(game,packageManifest,pins),/not visible/);
});
