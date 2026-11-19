const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {EventEmitter}=require('node:events');

// The protocol supplies one prefix in the command reply and subsequent bytes in
// dataReceived.data. The command reply can reach this process after those events.
function validateContentPin(pin) {
  assert(Number.isSafeInteger(pin.bytes) && pin.bytes > 0 && pin.bytes <= 32 * 1024 * 1024);
  assert(/^[a-f0-9]{64}$/.test(pin.sha256));
  return pin;
}
function observeContent(cdp, pin) {
  validateContentPin(pin);
  let id, body, commandIssued=false, replied=false, terminal, error;
  let eventBytes=0, prefixEvents=0, prefixBytes=null, streamedBytes=0, streamedEvents=0;
  let notify;
  const completed=new Promise(resolve=>{notify=resolve;});
  function reject(reason) {
    error ??= reason;
    body=undefined;
    notify();
  }
  function copy(data, offset, limit) {
    if(typeof data!=='string' || data.length%4 || data.length>4*Math.ceil(limit/3))throw Error('oversized or missing CDP base64 data');
    const padding=data.endsWith('==')?2:data.endsWith('=')?1:0;
    if(data.length/4*3-padding>limit)throw Error('oversized decoded CDP data');
    const bytes=Buffer.from(data,'base64');
    if(bytes.length>limit || bytes.toString('base64')!==data)throw Error('invalid CDP base64 data');
    bytes.copy(body,offset);
    return bytes.length;
  }
  cdp.on('Network.requestWillBeSent',({requestId,request,redirectResponse})=>{
    if(requestId===id && id!==undefined)return reject('redirect or repeated request ID');
    if(id!==undefined || request.url!==pin.url)return;
    id=requestId;
    if(request.method!=='GET'||redirectResponse)reject('first matching request was redirected or not GET');
  });
  cdp.on('Network.responseReceived',({requestId,response})=>{
    if(requestId!==id || error)return;
    if(commandIssued)return reject('duplicate response');
    const headers=Object.fromEntries(Object.entries(response.headers).map(([k,v])=>[k.toLowerCase(),v]));
    if(response.url!==pin.url || response.status!==200 || response.fromServiceWorker || response.fromDiskCache ||
       response.fromPrefetchCache || headers['content-length']!==String(pin.bytes) ||
       (headers['content-encoding']??'identity')!=='identity')return reject('response does not match the pinned cold identity body');
    body=Buffer.alloc(pin.bytes);
    commandIssued=true;
    cdp.send('Network.streamResourceContent',{requestId}).then(({bufferedData})=>{
      if(error)return;
      prefixBytes=copy(bufferedData,0,pin.bytes-streamedBytes);
      replied=true;
      if(terminal)notify();
    }).catch(e=>reject('streamResourceContent: '+e.message));
  });
  cdp.on('Network.requestServedFromCache',({requestId})=>{
    if(requestId===id)reject('cached response');
  });
  cdp.on('Network.dataReceived',({requestId,dataLength,data})=>{
    if(requestId!==id || error)return;
    if(!commandIssued || terminal)return reject('data outside response lifetime');
    if(!Number.isSafeInteger(dataLength)||dataLength<0||dataLength>pin.bytes-eventBytes)return reject('invalid or excessive event length');
    if(data===undefined){
      if(dataLength && streamedBytes)return reject('missing data after streamed bytes started');
      prefixEvents+=dataLength;
    }else{
      try{
        if(copy(data,eventBytes,dataLength)!==dataLength)throw Error('dataLength mismatch');
      }catch(e){return reject(e.message);}
      streamedBytes+=dataLength;
      streamedEvents++;
    }
    eventBytes+=dataLength;
  });
  for(const name of ['loadingFinished','loadingFailed']){
    cdp.on('Network.'+name,({requestId,errorText,canceled,encodedDataLength})=>{
      if(requestId!==id)return;
      if(terminal)return reject('multiple terminal events');
      terminal={event:name,errorText,canceled,encodedDataLength};
      if(replied)notify();
    });
  }
  return async function result(timeoutMs=1500){
    if(id!==undefined && !error && !(replied&&terminal)){
      let timer;
      try{await Promise.race([completed,new Promise(resolve=>{timer=setTimeout(resolve,timeoutMs);})]);}
      finally{clearTimeout(timer);}
    }
    if(id===undefined)reject('no matching request');
    if(!replied || !terminal)reject('missing command reply or terminal before snapshot');
    if(prefixBytes!==prefixEvents || eventBytes!==pin.bytes || prefixBytes+streamedBytes!==pin.bytes)
      reject('buffered prefix, streamed suffix or event total do not partition the pin');
    let sha256, prefixSha256, streamedSha256;
    if(!error){
      const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
      sha256=hash(body);
      prefixSha256=hash(body.subarray(0,prefixBytes));
      streamedSha256=hash(body.subarray(prefixBytes));
      if(sha256!==pin.sha256)reject('CDP content digest mismatch');
    }
    body=undefined;
    return {requestId:id??null,pin,commandIssued,commandReplied:replied,terminal:terminal??null,
      prefixEventBytes:prefixEvents,prefixBytes,streamedBytes,streamedEvents,eventBytes,
      prefixSha256,streamedSha256,sha256,status:error?'rejected':'pinned-content-observed',error};
  };
}

// Route CDP events by request ID so a second load of the same URL has its own
// prefix, offsets, digest and terminal. Only compact receipts outlive completion.
function observePinnedRequests(session,pins,{maxBytes=64*1024*1024,maxActive=16,maxRequests=128}={}){
  assert(Number.isSafeInteger(maxBytes) && maxBytes>0 && maxBytes<=64*1024*1024);
  assert(Number.isSafeInteger(maxActive) && maxActive>0 && maxActive<=16);
  assert(Number.isSafeInteger(maxRequests) && maxRequests>0 && maxRequests<=128);
  for(const [url,pin] of pins){validateContentPin(pin);assert.equal(pin.url,url);}
  const requests=new Map(), original=new Map();
  let active=0,reserved=0,peakBytes=0,peakActive=0,overflow=0,firstExcessId;
  function settle(entry){
    if(!entry.reader || entry.settling)return entry.settling;
    entry.settling=entry.reader().then(result=>{entry.sample=result;}).finally(()=>{
      active--;reserved-=entry.pin.bytes;entry.channel=entry.reader=undefined;
    });
    return entry.settling;
  }
  session.on('Network.requestWillBeSent',event=>{
    const {requestId,request}=event;
    const prior=requests.get(requestId);
    if(prior){prior.error??='redirected or repeated request ID';return;}
    const pin=pins.get(request.url);
    if(!pin)return;
    if(requests.size>=maxRequests){overflow++;firstExcessId??=requestId;return;}
    const entry={requestId,pin};
    requests.set(requestId,entry);
    if(active>=maxActive || pin.bytes>maxBytes-reserved){entry.error='content sampler concurrent storage limit';return;}
    active++;reserved+=pin.bytes;
    peakActive=Math.max(peakActive,active);peakBytes=Math.max(peakBytes,reserved);
    entry.channel=new EventEmitter();
    entry.channel.send=(method,parameters)=>session.send(method,parameters);
    entry.reader=observeContent(entry.channel,pin);
    entry.channel.emit('Network.requestWillBeSent',event);
  });
  for(const type of ['responseReceived','requestServedFromCache','dataReceived','loadingFinished','loadingFailed']){
    session.on('Network.'+type,event=>{
      const entry=requests.get(event.requestId);
      if(!entry)return;
      if(entry.terminalSeen && (type==='loadingFailed'||type==='loadingFinished'||type==='dataReceived'))
        entry.error??='additional data or terminal after request ended';
      entry.channel?.emit('Network.'+type,event);
      if(type==='loadingFinished'||type==='loadingFailed'){
        entry.terminalSeen=true;
        settle(entry);
      }
    });
  }
  function noteOriginal(requestId,result,error){
    const entry=requests.get(requestId);
    if(!entry || original.get(requestId)?.error)return;
    if(error){original.set(requestId,{error:error.message});return;}
    const {status,bytes,transferBytes}=result;
    const sha256=createHash('sha256').update(bytes).digest('hex');
    const receipt={status,bytes:bytes.length,sha256,transferBytes};
    if(bytes.length!==entry.pin.bytes || sha256!==entry.pin.sha256 || !Number.isSafeInteger(transferBytes) ||
        transferBytes<bytes.length || status!==200)receipt.error='original CDP body, status or transfer differs from pin';
    original.set(requestId,receipt);
  }
  async function audit(readOriginal){
    for(const entry of requests.values()){
      if(!original.has(entry.requestId)){
        try{await readOriginal(entry.requestId);}
        catch(error){noteOriginal(entry.requestId,undefined,error);}
      }
      await settle(entry);
    }
    return summary();
  }
  function summary(){
    const attempts=Array.from(requests.values(),entry=>{
      const strict=original.get(entry.requestId),sample=entry.sample;
      const error=entry.error??strict?.error??sample?.error??
        (!strict?'missing original read':sample?.status!=='pinned-content-observed'?'missing complete streamed body':
          sample.terminal?.event!=='loadingFinished'?'missing successful terminal':undefined);
      return {requestId:entry.requestId,url:entry.pin.url,original:strict,content:sample,error};
    });
    const seen=new Set(attempts.map(a=>a.url));
    const missingUrls=[...pins.keys()].filter(url=>!seen.has(url));
    const passed=attempts.filter(a=>!a.error).length;
    return {status:passed===attempts.length && !overflow && !missingUrls.length?'passed':'failed',
      targetUrls:pins.size,requests:requests.size+overflow,passed,failed:attempts.length-passed+overflow,
      maxBytes,maxActive,maxRequests,peakReservedBytes:peakBytes,peakActive,overflow,firstExcessId,missingUrls,attempts};
  }
  return {noteOriginal,audit,summary};
}

module.exports={validateContentPin,observeContent,observePinnedRequests};
