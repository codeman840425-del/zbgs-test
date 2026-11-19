import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {limitedBlob,readPinned} from './read.mjs';

const digest=data=>createHash('sha256').update(data).digest('hex');
const chunks=(...sizes)=>new ReadableStream({start(controller){
  for(const size of sizes)controller.enqueue(new Uint8Array(size));
  controller.close();
}});

test('a decoded overrun after exact pin is rejected before the extra chunk reaches the Blob',async()=>{
  const observed=[];
  await assert.rejects(limitedBlob(chunks(2,2,3),4,new AbortController().signal,
    (stage,n)=>observed.push([stage,n])),{diagnostic:'overflow'});
  assert.deepEqual(observed,[['chunk',2],['chunk',4]]);
});

test('oversized first chunk and short final stream both fail before a Blob is exposed',async()=>{
  for(const [size,code] of [[7,'overflow'],[3,'truncated']]){
    const stages=[];
    await assert.rejects(limitedBlob(chunks(size),4,new AbortController().signal,
      stage=>stages.push(stage)),{diagnostic:code});
    assert(!stages.includes('verifiedBlobSize'));
    assert.equal(stages.includes('chunk'),size<4);
  }
});

test('abort on verified Blob size prevents returning game bytes',async()=>{
  const controller=new AbortController();
  await assert.rejects(limitedBlob(chunks(2,2),4,controller.signal,(stage,size)=>{
    if(stage==='verifiedBlobSize'){assert.equal(size,4);controller.abort();}
  }),{name:'AbortError'});
});

test('synthetic response with a false exact header still has a decoded-size ceiling',async()=>{
  const paths=[];
  await assert.rejects(readPinned('http://localhost/file',{limit:8,bytes:4,sha256:digest(Buffer.alloc(4))},{
    mode:'candidate',signal:new AbortController().signal,origin:'http://localhost',
    observe:(stage,value)=>{if(stage==='path')paths.push(value);},
    fetcher:async()=>new Response(chunks(2,2,1),{headers:{'Content-Length':'4'}})
  }),{diagnostic:'overflow'});
  assert.deepEqual(paths,['reader']);
});

test('bad size or digest pin rejects before starting a request',async()=>{
  const valid={limit:8,bytes:4,sha256:digest(Buffer.alloc(4))};
  for(const overrides of [{limit:NaN},{bytes:9},{bytes:0},{sha256:'aabb'}]){
    await assert.rejects(readPinned('http://localhost/file',{...valid,...overrides},{
      mode:'candidate',signal:new AbortController().signal,origin:'http://localhost',
      fetcher:()=>assert.fail('unexpected fetch')
    }),{diagnostic:'invalid-pin'});
  }
});
