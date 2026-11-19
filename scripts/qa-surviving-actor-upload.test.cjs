const assert = require('node:assert/strict');
const {webcrypto} = require('node:crypto');
const test = require('node:test');
const vm = require('node:vm');
const {verifySurvivorUpload} = require('./qa-surviving-actor-upload.cjs');

async function fixture(mode) {
  const state={draws:0,uploads:0};
  const page=vm.createContext({state,mode,crypto:webcrypto});
  vm.runInContext(`
    globalThis.window=globalThis;
    globalThis.requestAnimationFrame=callback=>callback(12);
    globalThis.ImageBitmap=class {};
    globalThis.WebGL2RenderingContext=class {
      PIXEL_PACK_BUFFER_BINDING=1; READ_FRAMEBUFFER_BINDING=2; CURRENT_PROGRAM=3; ACTIVE_TEXTURE=4; TEXTURE_BINDING_2D=5;
      SAMPLES=6; DITHER=7; TEXTURE0=10; TEXTURE_2D=11; RGBA=12; UNSIGNED_BYTE=13; NO_ERROR=0;
      drawingBufferWidth=2; drawingBufferHeight=1; active=10;
      getParameter(key){return key===3?program:key===4?this.active:key===5?handle:key===6?4:null;}
      activeTexture(unit){this.active=unit;}
      getUniformLocation(_program,slot){return slot==='map'?{}:null;}
      getUniform(){return 1;}
      isTexture(id){return id===handle;}
      getError(){return 0;}
      isEnabled(){return true;}
      getContextAttributes(){return {antialias:true};}
      isContextLost(){return false;}
      texSubImage2D(){state.uploads++;}
      texImage2D(){throw Error('Unexpected upload method');}
      readPixels(_x,_y,_w,_h,_format,_type,bytes){
        if(!root.visible && mode==='read-error' && state.draws===6)throw Error('Hidden readback failed');
        const diff = (mode==='redraw' && state.draws>=2) || (mode==='visibility' && state.draws>=4) ||
          (mode==='upload' && state.uploads>0) || (mode==='restore' && state.draws===7);
        bytes.set(root.visible?[201+(diff?1:0),10,20,255,0,0,0,255]:[1,10,20,255,0,0,0,255]);
      }
    };
    const gl=new WebGL2RenderingContext(),program={},handle={},scene={},camera={uuid:'camera'};
    const image=Object.assign(new ImageBitmap(),{width:512,height:512});
    const texture={uuid:'texture',source:{uuid:'source',version:1},image,version:1,isTexture:true,
      set needsUpdate(value){if(value) {this.version++;this.source.version++;}}};
    const material={name:'shoes',map:texture},previous=()=>{};
    const mesh={isMesh:true,name:'mesh',onAfterRender:previous};
    const root={visible:true,parent:scene,uuid:'root',traverseVisible(callback){if(this.visible)callback(mesh);}};
    const renderer={getContext:()=>gl,autoClear:true,getRenderTarget:()=>null,properties:{has:()=>true,get:()=>({__webglTexture:handle})},
      render(){state.draws++;if(root.visible){
        if(texture.version>1 && !state.uploads && mode!=='no-upload')
          gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,image);
        mesh.onAfterRender(this,scene,camera,{},material);
      }}};
    const actor={identity:{id:'actor'},recordSha256:'signed',avatar:{root,profile:{bodyType:'body',sha256:'body-sha'}}};
    window.__recordConsumer={ready:true,actors:new Map([['actor',actor]]),records:[{identity:{id:'actor'},integrity:{recordSha256:'signed'},
      appearanceRecipe:{base:{bodyType:'body',sha256:'body-sha'}}}],renderer,scene,camera};
    state.restored=()=>root.visible && mesh.onAfterRender===previous && !Object.hasOwn(gl,'texSubImage2D') && gl.active===10;
  `,page);
  const report = JSON.parse(JSON.stringify(await vm.runInContext(`(${verifySurvivorUpload.toString()})()`,page)));
  assert(state.restored());
  return {state,report};
}

test('same-frame controls preserve the original zero-difference gate and target upload',async()=>{
  const {state,report}=await fixture('stable');
  assert.equal(report.status,'verified',report.failure);
  assert.deepEqual([state.draws,state.uploads],[7,1]);
  const {fingerprints,controls}=report.framebuffer;
  for (const phase of ['noOpRedraw','noUploadRestored','afterUpload','restored']) assert.equal(fingerprints[phase],fingerprints.before);
  assert.equal(fingerprints.noUploadHidden,fingerprints.hidden);
  assert.notEqual(fingerprints.hidden,fingerprints.before);
  assert.deepEqual(controls.redraw.uploadCalls,[]);
  assert.deepEqual(controls.visibility.uploadCalls,[]);
  assert.equal(report.reupload.count,1);
  assert.equal(report.framebuffer.actorContribution.changedPixels,1);
});

test('one-LSB redraw and visibility drift are distinguishable from a real upload-only or restore-only pixel difference',async()=>{
  const spectra=[
    ['redraw','No-op redraw changed the framebuffer',[1,1,1,1]],
    ['visibility','Framebuffer did not restore in the no-upload control',[0,1,1,1]],
    ['upload','Framebuffer differs after the texture upload',[0,0,1,1]],
    ['restore','Framebuffer did not restore',[0,0,0,1]],
  ];
  for (const [mode,failure,counts] of spectra) {
    const {report}=await fixture(mode);
    assert.equal(report.status,'failed');
    assert.equal(report.failure,failure);
    assert.equal(report.reupload.count,1);
    const {controls,afterUpload,restored}=report.framebuffer;
    assert.deepEqual([controls.redraw.difference,controls.visibility.restored,afterUpload,restored]
      .map(row=>row.changedPixels),counts);
    assert.equal(restored.maxChannelDelta,1);
    assert.deepEqual(restored.firstDifferences,[{x:0,y:0,reference:[201,10,20,255],observed:[202,10,20,255]}]);
  }
});

test('missing upload and hidden readback errors fail without leaving the survivor hidden',async()=>{
  for (const [mode,failure] of [['no-upload','One successful level-zero upload'],['read-error','Hidden readback failed']]) {
    const {report}=await fixture(mode);
    assert.equal(report.status,'failed');
    assert(report.failure.includes(failure));
    assert.equal(report.framebuffer.visibilityRestored,true);
  }
});
