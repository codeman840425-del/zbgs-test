import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getEventListeners} from 'node:events';
import {createRenderContextGuard} from '../../prototype/src/render-context-guard.js';
const rows=[];const fixture=()=>{const canvas=new EventTarget();const r={domElement:canvas,lost:false,getContext(){return{isContextLost:()=>r.lost};}};return r;};
const count=r=>['webglcontextlost','webglcontextrestored'].map(n=>getEventListeners(r.domElement,n).length);
const flush=()=>new Promise(r=>setImmediate(r));
for(const late of ['resolve','reject']){
 const r=fixture(),g=createRenderContextGuard(r);let resolve,reject;
 const pending=g.wait(()=>new Promise((a,b)=>{resolve=a;reject=b;}));
 r.lost=true;r.domElement.dispatchEvent(new Event('webglcontextlost'));
 await assert.rejects(pending,/图形上下文/);g.dispose();assert.deepEqual(count(r),[0,0]);
 r.lost=false;r.domElement.dispatchEvent(new Event('webglcontextrestored'));
 const next=createRenderContextGuard(r);assert.equal(await next.wait(()=>Promise.resolve(42)),42);
 if(late==='resolve')resolve(1);else reject(Error('late failure'));
 await flush();next.check();assert.throws(()=>g.check(),/图形上下文/);next.dispose();assert.deepEqual(count(r),[0,0]);
 rows.push({case:'lost-then-late-'+late,passed:true,canvasListenersAfterDispose:count(r)});
}
{
 const r=fixture(),g=createRenderContextGuard(r);await g.wait(()=>Promise.resolve());
 r.domElement.dispatchEvent(new Event('webglcontextlost'));r.domElement.dispatchEvent(new Event('webglcontextrestored'));
 assert.throws(()=>g.check(),/图形上下文/);g.dispose();assert.deepEqual(count(r),[0,0]);rows.push({case:'loss-after-wait-before-commit-check',passed:true});
}
for(const mode of ['sync-throw','async-reject','success']){
 const r=fixture(),g=createRenderContextGuard(r);
 const p=g.wait(()=>{if(mode==='sync-throw')throw Error('injected');return mode==='async-reject'?Promise.reject(Error('injected')):Promise.resolve(1);});
 if(mode==='success')assert.equal(await p,1);else await assert.rejects(p,/injected/);
 await flush();g.dispose();assert.deepEqual(count(r),[0,0]);rows.push({case:mode,passed:true});
}
fs.writeFileSync(new URL('./report.json',import.meta.url),JSON.stringify({scope:'Actual guard, Node EventTarget and controlled promises only; not natural WebGL loss/GPU.',rows},null,2));console.log(JSON.stringify(rows));
