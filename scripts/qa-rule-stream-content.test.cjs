const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createHash}=require('node:crypto');
const test=require('node:test');
const {observeTransfer,contentSelection,identifyRegistration}=require('./qa-rule-stream-lifecycle.cjs');

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const b64=text=>Buffer.from(text).toString('base64');
const pin={url:'http://127.0.0.1/assets/selected/body.vrm',recordId:'actor',bytes:5,sha256:hash('abcde')};

async function fixture(headers={'Content-Length':'5'}) {
  const session=new EventEmitter(), commands=[];
  const reply=Promise.withResolvers();
  session.send=async(method,params)=>{
    commands.push({method,params});
    if(method==='Network.streamResourceContent')return reply.promise;
  };
  const read=await observeTransfer({newCDPSession:async()=>session},{},[pin.url],pin);
  const event=(name,fields,id='first')=>session.emit('Network.'+name,{requestId:id,...fields});
  const start=(id='first')=>event('requestWillBeSent',{request:{url:pin.url,method:'GET'},timestamp:1,wallTime:2},id);
  const response=(id='first')=>event('responseReceived',{response:{url:pin.url,status:200,headers}},id);
  const chunk=(dataLength,data,id)=>event('dataReceived',{dataLength,data,encodedDataLength:dataLength},id);
  const finish=()=>event('loadingFinished',{encodedDataLength:170});
  start();response();
  return {read,reply,commands,event,start,response,chunk,finish};
}

for(const replyFirst of [true,false]){
  test('ordered prefix and suffix remain distinct when command reply comes '+(replyFirst?'first':'last'),async()=>{
    const f=await fixture();
    if(replyFirst){f.reply.resolve({bufferedData:b64('ab')});await new Promise(setImmediate);}
    f.chunk(2);f.chunk(2,b64('cd'));
    f.start('second');f.response('second');f.chunk(5,b64('WRONG'),'second');
    f.chunk(1,b64('e'));f.chunk(0);
    f.event('loadingFailed',{errorText:'net::ERR_ABORTED',canceled:true});
    if(!replyFirst)f.reply.resolve({bufferedData:b64('ab')});
    const sample=await f.read.content();
    assert.equal(sample.status,'pinned-content-observed');
    assert.equal(sample.requestId,'first');
    assert.deepEqual([sample.prefixEventBytes,sample.prefixBytes,sample.streamedBytes,sample.streamedEvents],[2,2,3,2]);
    assert.deepEqual([sample.prefixSha256,sample.streamedSha256,sample.sha256],[hash('ab'),hash('cde'),pin.sha256]);
    assert.deepEqual(f.commands.filter(c=>c.method==='Network.streamResourceContent'),[
      {method:'Network.streamResourceContent',params:{requestId:'first'}}]);
    assert.equal(sample.terminal.errorText,'net::ERR_ABORTED');
    assert.equal(f.read()[0].events.at(-1).event,'fail');
  });
}

const rejectCases=[
  ['wrong digest', f=>{f.chunk(5,b64('xbcde'));f.finish();f.reply.resolve({bufferedData:''});},/digest mismatch/],
  ['missing prefix', f=>{f.chunk(2);f.chunk(3,b64('cde'));f.finish();f.reply.resolve({bufferedData:''});},/partition/],
  ['overlapping prefix', f=>{f.chunk(2);f.chunk(3,b64('cde'));f.finish();f.reply.resolve({bufferedData:b64('abc')});},/oversized/],
  ['duplicate suffix', f=>{f.chunk(5,b64('abcde'));f.chunk(1,b64('e'));},/excessive/],
  ['gap after streamed bytes', f=>{f.chunk(4,b64('abcd'));f.chunk(1);},/missing data/],
  ['malformed base64', f=>f.chunk(2,'@@@='),/base64/],
  ['incorrect frame size', f=>f.chunk(3,b64('ab')),/dataLength mismatch/],
  ['redirect', f=>f.start(),/redirect/],
  ['cached response',f=>f.event('requestServedFromCache',{}),/cached/],
  ['unsupported protocol command',f=>f.reply.reject(Error('not supported')),/not supported/],
  ['no terminal', f=>{f.chunk(5,b64('abcde'));f.reply.resolve({bufferedData:''});},/missing command reply or terminal/],
  ['no reply', f=>{f.chunk(5,b64('abcde'));f.finish();},/missing command reply or terminal/],
];
for(const [name,apply,reason] of rejectCases){
  test(name+' produces a rejected sample',async()=>{
    const f=await fixture();apply(f);
    const row=await f.read.content(10);
    assert.equal(row.status,'rejected');
    assert.match(row.error,reason);
  });
}

test('wrong framing prevents sending the sampling command',async()=>{
  const f=await fixture({'Content-Length':'6'});
  assert.equal((await f.read.content()).status,'rejected');
  assert(!f.commands.some(c=>c.method==='Network.streamResourceContent'));
});

test('only the external file pinned by the selected package record is eligible',()=>{
  const bodyType='rule-body-'+pin.sha256.slice(0,20),path='assets/'+bodyType+'/body.vrm';
  const file={path,sha256:pin.sha256,bytes:pin.bytes,provenance:[{packPath:path,indexSha256:hash('index')}]};
  const pack={records:[{id:pin.recordId,bodyType,avatarSha256:pin.sha256}],files:[file]};
  const selected=()=>contentSelection(pin.recordId,pack,'http://localhost/');
  assert.equal(selected().url,'http://localhost/'+path);
  file.bytes=32*1024*1024+1;assert.throws(selected);file.bytes=pin.bytes;
  file.sha256=hash('other');assert.throws(selected);file.sha256=pin.sha256;
  file.provenance=[];assert.throws(selected,/externally published/);
});

test('a complete body alone cannot identify the registration reader',()=>{
  const op={operationId:3,url:pin.url,method:'GET',events:[
    {event:'get-reader',mode:'default'},{event:'reader-read',done:false,bytes:5},{event:'reader-read',done:true,bytes:0}]};
  const page={operations:[op],game:{actors:[{id:'actor',attached:true,body:{sha256:pin.sha256}}]}};
  function identify(correlation){
    const s={requestId:'r',pin,status:'pinned-content-observed'};
    identifyRegistration(s,page,[{requestId:'r',correlation,candidateOperationIds:[3]}]);return s;
  }
  assert.equal(identify('unique-url-method-time-candidate').registration.pageOperationId,3);
  assert.equal(identify('ambiguous').status,'rejected');
  op.events[0].event='array-buffer-call';assert.equal(identify('unique-url-method-time-candidate').status,'rejected');
});
