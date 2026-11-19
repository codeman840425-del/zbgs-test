const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {EventEmitter} = require('node:events');
const test = require('node:test');
const {measureAttempts, observeNetwork} = require('./qa-cold-assets.cjs');

const url = 'http://127.0.0.1/assets/body.vrm';
const content = Buffer.from('a simulated body');
const pin = {bytes:content.length,sha256:createHash('sha256').update(content).digest('hex')};

async function fixture() {
  const session = new EventEmitter();
  const bodyReads = [];
  const bodies = new Map();
  session.send = async (method, params) => {
    if (method!=='Network.getResponseBody') return;
    bodyReads.push(params.requestId);
    if (!bodies.has(params.requestId)) throw Error('body evicted from the inspector');
    return {body:bodies.get(params.requestId).toString('base64'),base64Encoded:true};
  };
  const network = await observeNetwork({newCDPSession:async()=>session},{});
  const begin = id => {
    session.emit('Network.requestWillBeSent',{requestId:id,request:{url,method:'GET'},initiator:{type:'script'}});
    session.emit('Network.responseReceived',{requestId:id,response:{url,status:200,protocol:'http/1.1',
      headers:{'Content-Length':String(content.length),'Cache-Control':'no-store','Set-Cookie':'not measured'}}});
    session.emit('Network.responseReceivedExtraInfo',{requestId:id,statusCode:200,headers:{'Content-Length':String(content.length)}});
  };
  const finish = (id, bytes=content, transfer=content.length+40) => {
    if(bytes) bodies.set(id,bytes);
    session.emit('Network.loadingFinished',{requestId:id,timestamp:10,encodedDataLength:transfer});
  };
  return {network,session,begin,finish,bodyReads};
}

test('two responses to one URL preserve a missing finish and an independently measured second request',async()=>{
  const {network,begin,finish,bodyReads} = await fixture();
  network.stage('initial-registration-and-restore');
  begin('1');begin('2');finish('2');
  const measurement = measureAttempts(url,pin,await network.readAttempts(url));
  assert.deepEqual(bodyReads,['2']);
  assert.deepEqual(measurement.failures,[]);
  assert.equal(measurement.unavailable.length,1);
  const [first,second]=measurement.row.attempts;
  assert.equal(first.requestId,'1');
  assert.match(first.error,/Missing CDP Network.loadingFinished/);
  assert(!Object.hasOwn(first,'transferBytes'));
  assert.deepEqual(first.lifecycle.map(e=>e.event),['request','response','response-extra']);
  assert.deepEqual(first.lifecycle[1].headers,{'content-length':String(content.length),'cache-control':'no-store'});
  assert.equal(second.requestId,'2');
  assert.equal(second.lifecycle.find(e=>e.event==='finish').encodedDataLength,content.length+40);
  assert.equal(measurement.row.transfer.length,1);
  assert.equal(network.diagnostics().requestLifecycle[0].requestId,'1');
  finish('1');
  assert.equal(network.diagnostics([url]).requestLifecycle[0].events.at(-1).event,'finish');
  assert.equal(measurement.row.transfer.length,1);
});

test('late finish is observed, while a terminal cancellation is a real failure',async()=>{
  const {network,session,begin,finish} = await fixture();
  begin('late');begin('abort');
  session.emit('Network.loadingFailed',{requestId:'abort',errorText:'net::ERR_ABORTED',canceled:true,timestamp:9});
  const reading=network.readAttempts(url);
  setTimeout(()=>finish('late'),20);
  const {row,failures,unavailable} = measureAttempts(url,pin,await reading);
  assert.deepEqual(unavailable,[]);
  assert.match(failures[0],/Network.loadingFailed.*net::ERR_ABORTED/);
  assert(row.attempts[1].lifecycle.some(e=>e.event==='fail' && e.canceled));
  assert.equal(row.transfer.length,1);
});

test('CDP body eviction cannot create measured bytes and available bad bytes remain a hard failure',async()=>{
  const {network,begin,finish} = await fixture();
  begin('evicted');finish('evicted',null);
  begin('wrong');finish('wrong',Buffer.alloc(content.length,7),0);
  const {row,failures,unavailable} = measureAttempts(url,pin,await network.readAttempts(url));
  assert.match(unavailable[0].error,/CDP Network.getResponseBody.*evicted/);
  assert.deepEqual(row.transfer,[]);
  assert.equal(failures[0],'CDP body differs from the pinned package bytes');
  assert.equal(row.attempts[1].observed.bytes,content.length);
});
