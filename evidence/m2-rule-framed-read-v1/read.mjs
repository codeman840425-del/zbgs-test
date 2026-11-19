// Diagnostic only. No native consumer sees an unbounded network response.
const failure=code=>Object.assign(new Error(code),{diagnostic:code});
export async function limitedBlob(stream,pin,signal,observe){
  let accepted=0;
  const bounded=stream.pipeThrough(new TransformStream({
    transform(chunk,controller){
      signal.throwIfAborted();
      if(chunk.byteLength>pin-accepted)throw failure('overflow');
      accepted+=chunk.byteLength;
      observe('chunk',accepted);
      signal.throwIfAborted();
      controller.enqueue(chunk);
    },
    flush(){if(accepted!==pin)throw failure('truncated');},
  }),{signal});
  const blob=await new Response(bounded).blob();
  if(blob.size!==pin)throw failure('truncated');
  observe('verifiedBlobSize',blob.size);
  signal.throwIfAborted();
  return new Uint8Array(await blob.arrayBuffer());
}

async function originalReader(stream,pin,signal,observe){
  const reader=stream.getReader(),data=new Uint8Array(pin);
  let used=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      if(value.length>pin-used){await reader.cancel();throw failure('overflow');}
      data.set(value,used);
      used+=value.length;
      observe('chunk',used);
      signal.throwIfAborted();
    }
  }finally{reader.releaseLock();}
  if(used!==pin)throw failure('truncated');
  return data;
}

const controlledOrUnknown=()=>typeof window!=='undefined'&&
  (!('serviceWorker' in navigator)||navigator.serviceWorker.controller!==null);

export async function readPinned(url,pin,{mode,signal,origin,observe,fetcher=fetch,controlled=controlledOrUnknown}){
  if(!Number.isSafeInteger(pin.limit)||!Number.isSafeInteger(pin.bytes)||pin.bytes<1||pin.bytes>pin.limit||
    !/^[a-f0-9]{64}$/.test(pin.sha256))throw failure('invalid-pin');
  const response=await fetcher(url,{redirect:'error',credentials:'same-origin',signal});
  observe('http',response.status);
  signal.throwIfAborted();
  if(!response.ok)throw failure('http');
  const headers=response.headers;
  const declared=headers.get('content-length');
  const genuine=response.type==='basic' && response.url===url && new URL(url).origin===origin &&
    /^https?:/.test(url) && !response.redirected && !controlled();
  const framed=genuine&&['identity',null].includes(headers.get('content-encoding'))&&
    !headers.has('transfer-encoding')&&declared!==null&&/^[1-9]\d*$/.test(declared);
  let bytes;
  if(mode==='candidate'&&framed&&BigInt(declared)>BigInt(pin.bytes)){
    observe('path','reject-header');
    await response.body.cancel();
    throw failure('declared-overflow');
  }
  if(mode==='candidate'&&framed&&declared===String(pin.bytes)){
    observe('path','limited-blob');
    bytes=await limitedBlob(response.body,pin.bytes,signal,observe);
  }else{
    observe('path','reader');
    bytes=await originalReader(response.body,pin.bytes,signal,observe);
  }
  signal.throwIfAborted();
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const sha256=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
  observe('digest',sha256);
  signal.throwIfAborted();
  if(sha256!==pin.sha256)throw failure('wrong-sha');
  return bytes.length;
}
