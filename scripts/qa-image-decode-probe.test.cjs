const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const {installDecodeProbe} = require('./qa-image-decode-probe.cjs');

function page(eventLimit, omitOptional = false) {
  const state = {time:10, bitmapJobs:[], bitmapCalls:[], canvasCalls:[], imageCalls:[]};
  const realm = vm.createContext({state,Blob});
  const browser = vm.runInContext(`
    globalThis.window = globalThis;
    globalThis.performance = {timeOrigin: 100000, now(){return state.time;}};
    globalThis.createImageBitmap = function (...args) {
      state.bitmapCalls.push({receiver:this,args});
      const job = state.bitmapJobs.shift();
      if (job.throw) throw job.throw;
      return job.promise;
    };
    globalThis.ImageBitmap = class ImageBitmap {
      constructor(width,height){this.width=width;this.height=height;}
      close(){
        if (!(this instanceof ImageBitmap)) throw TypeError('Invalid bitmap receiver');
        this.width=0;this.height=0;
      }
    };
    function getContext(type, options) {
      state.canvasCalls.push({receiver:this,type,options});
      return this.available ? this.context : null;
    }
    globalThis.HTMLCanvasElement = class HTMLCanvasElement {
      constructor(width,height){
        this.width=width;this.height=height;this.available=false;
        this.context={drawImage(){throw Error('Unexpected drawing');},getImageData(){throw Error('Unexpected pixel read');}};
      }
      getContext(...args){return getContext.apply(this,args);}
    };
    ${omitOptional ? '' : `
      globalThis.OffscreenCanvas = class OffscreenCanvas {
        constructor(width,height){this.width=width;this.height=height;this.available=true;this.context={};}
        getContext(...args){return getContext.apply(this,args);}
      };
      globalThis.HTMLImageElement = class HTMLImageElement {
        decode(...args){state.imageCalls.push({receiver:this,args});return this.result;}
      };
    `}
    (${installDecodeProbe.toString()})(${JSON.stringify({eventLimit})});
    globalThis;
  `,realm);
  const probe = browser.__imageDecodeProbe;
  const snapshot = () => JSON.parse(JSON.stringify(probe.snapshot()));
  return {state,realm,browser,probe,snapshot};
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}

test('the standalone install preserves bitmap calls and promise identity across concurrent outcomes',async()=>{
  const {state,browser,probe,snapshot}=page();
  const first=deferred(),second=deferred();
  const failed=Object.assign(Error('private input path'),{name:'InvalidStateError'});
  const thrown=TypeError('invalid receiver');
  state.bitmapJobs.push(first,second,{throw:thrown});
  const source=new Blob(['encoded blob']);
  const bitmap=new browser.ImageBitmap(32,16),target={};
  const cropOptions={resizeWidth:32};
  assert.equal(browser.createImageBitmap.call(target,source,0,1,32,16,cropOptions),first.promise);
  assert.equal(state.bitmapCalls[0].receiver,target);
  assert.deepEqual([...state.bitmapCalls[0].args],[source,0,1,32,16,cropOptions]);
  assert.equal(browser.createImageBitmap(bitmap),second.promise);
  assert.throws(()=>browser.createImageBitmap(null),error=>error===thrown);

  state.time=20;
  probe.mark('selected');
  second.reject(failed);
  await assert.rejects(second.promise,error=>error===failed);
  state.time=30;
  first.resolve(bitmap);
  assert.equal(await first.promise,bitmap);
  const id=probe.imageId(bitmap);
  assert.equal(probe.imageId(bitmap),id);
  assert.equal(probe.imageId(null),null);
  state.time=35;
  assert.equal(bitmap.close(),undefined);
  state.time=40;
  bitmap.close();
  assert.throws(()=>browser.ImageBitmap.prototype.close.call({}),/Invalid bitmap receiver/);

  const result=snapshot(), event=(type,id)=>result.events.find(e=>e.type===type && e.operationId===id);
  assert.equal(result.schema,'image-decode-lifecycle-v1');
  assert.equal(result.scope,'this-window-realm');
  assert.equal(result.timeOriginMs,100000);
  assert.equal(result.capturedAtMs,40);
  assert.deepEqual(event('bitmap-start',1),{type:'bitmap-start',atMs:10,label:'opening',operationId:1,blobBytes:source.size});
  assert.equal(event('bitmap-start',2).blobBytes,null);
  assert.equal(event('bitmap-error',3).errorName,'TypeError');
  assert.deepEqual(event('bitmap-error',2),{type:'bitmap-error',atMs:20,label:'selected',operationId:2,durationMs:10,errorName:'InvalidStateError'});
  assert.deepEqual(event('bitmap-end',1),{type:'bitmap-end',atMs:30,label:'selected',operationId:1,durationMs:20,imageId:id,width:32,height:16});
  assert.deepEqual(result.events.filter(e=>e.type==='bitmap-close').map(({imageId,closeCount,atMs})=>({imageId,closeCount,atMs})),
    [{imageId:id,closeCount:1,atMs:35},{imageId:id,closeCount:2,atMs:40}]);
  assert(!JSON.stringify(result).includes(failed.message));
});

test('canvas observes only the first successful 2d acquisition and HTMLImage uses natural size',async()=>{
  const {state,browser,probe,snapshot}=page();
  const canvas=new browser.HTMLCanvasElement(20,10),offscreen=new browser.OffscreenCanvas(16,8);
  const options={willReadFrequently:true};
  assert.equal(canvas.getContext('2d',options),null);
  canvas.available=true;
  assert.equal(canvas.getContext('webgl'),canvas.context);
  state.time=15;
  assert.equal(canvas.getContext('2d',options),canvas.context);
  canvas.width=40;
  assert.equal(canvas.getContext('2d'),canvas.context);
  assert.equal(offscreen.getContext('2d'),offscreen.context);
  assert.equal(state.canvasCalls[2].receiver,canvas);
  assert.equal(state.canvasCalls[2].options,options);

  const img=new browser.HTMLImageElement(),job=deferred();
  img.width=22;img.height=9;img.naturalWidth=0;img.naturalHeight=0;img.result=job.promise;
  const id=probe.imageId(img);
  assert.equal(img.decode('native argument'),job.promise);
  assert.equal(state.imageCalls[0].receiver,img);
  assert.deepEqual([...state.imageCalls[0].args],['native argument']);
  state.time=20;
  img.naturalWidth=512;img.naturalHeight=256;job.resolve(undefined);
  await job.promise;
  const failure=Error('unable to decode');
  img.result=Promise.reject(failure);
  await assert.rejects(img.decode(),error=>error===failure);

  const {hooks,events}=snapshot();
  assert.deepEqual(hooks,{createImageBitmap:true,imageBitmapClose:true,htmlImageDecode:true,htmlCanvas2d:true,offscreenCanvas2d:true});
  assert.deepEqual(events.filter(e=>e.type==='canvas-2d').map(({kind,imageId,width,height,pixels})=>({kind,imageId,width,height,pixels})),[
    {kind:'HTMLCanvasElement',imageId:probe.imageId(canvas),width:20,height:10,pixels:200},
    {kind:'OffscreenCanvas',imageId:probe.imageId(offscreen),width:16,height:8,pixels:128},
  ]);
  assert.deepEqual(events.find(e=>e.type==='image-decode-end'),{type:'image-decode-end',atMs:20,label:'opening',operationId:1,
    durationMs:5,imageId:id,width:512,height:256});
  assert.equal(events.find(e=>e.type==='image-decode-error').operationId,2);
});

test('event limits keep accurate counters and snapshots isolated, even with optional APIs absent',async()=>{
  const {state,realm,browser,probe,snapshot}=page(2,true);
  vm.runInContext(`(${installDecodeProbe.toString()})({eventLimit:1});`,realm);
  assert.equal(browser.__imageDecodeProbe,probe);
  assert.equal(snapshot().hooks.offscreenCanvas2d,false);
  assert.equal(snapshot().hooks.htmlImageDecode,false);
  probe.mark('prep'.repeat(100));
  const bitmap=new browser.ImageBitmap(1,1);
  state.bitmapJobs.push({promise:Promise.resolve(bitmap)});
  await browser.createImageBitmap(new Blob([]));
  bitmap.close();
  const first=probe.snapshot();
  assert.equal(first.eventLimit,2);
  assert.equal(first.droppedEvents,2);
  assert.equal(first.events.length,2);
  assert.equal(first.events[1].label.length,96);
  assert.equal(first.counts['bitmap-end'],1);
  assert.equal(first.counts['bitmap-close'],1);
  first.events[0].label='mutation';
  first.counts['bitmap-end']=100;
  assert.equal(snapshot().events[0].label.length,96);
  assert.equal(snapshot().counts['bitmap-end'],1);
});
