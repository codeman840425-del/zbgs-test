const test=require('node:test');
const assert=require('node:assert/strict');
const T=require('../prototype/node_modules/three');
const {sampleAnkleBootVisibility}=require('./qa-ankleboot-visible.cjs');

// A mesh with two open 22-point boundaries. Only exercise readback accounting
// and teardown here; the real room is responsible for the WebGL render.
function fixture(fail=false){
  const scene=new T.Scene(),root=new T.Group(),camera=new T.PerspectiveCamera(36,1,.01,10);
  scene.add(root);camera.position.set(0,.18,.8);camera.lookAt(0,.18,0);camera.updateMatrixWorld();
  const bones=[new T.Bone(),new T.Bone()];bones.forEach((b,i)=>{b.position.set(i===0?-.05:.05,.12,0);root.add(b);});
  const points=[],indices=[],joints=[],weights=[];
  for(let leg=0;leg<2;leg++){
    const start=points.length/3,cx=leg===0?-.05:.05;
    for(let j=0;j<23;j++){
      const angle=j*Math.PI/11;
      points.push(cx+(j===22?0:.033*Math.cos(angle)),.25,j===22?0:.034*Math.sin(angle));
      joints.push(leg,0,0,0);weights.push(1,0,0,0);
      if(j<22)indices.push(start+22,start+j,start+(j+1)%22);
    }
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(points,3));geo.setIndex(indices);
  geo.setAttribute('skinIndex',new T.Uint16BufferAttribute(joints,4));geo.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
  root.updateMatrixWorld(true);
  const material=new T.MeshBasicMaterial(),skeleton=new T.Skeleton(bones);
  const [boot,skin,pants]=Array.from({length:3},()=>{
    const m=new T.SkinnedMesh(geo,material);root.add(m);m.bind(skeleton);return m;
  });
  const item={id:'fixture-boot',entry:{sha256:'fixture-sha'},meshes:[boot]};
  const actor={root,profile:{motion:{getFootwear:()=>item},meshRoles:{body:[skin.uuid],pants:[pants.uuid]}},
    vrm:{humanoid:{getRawBoneNode:name=>name==='leftFoot'?bones[0]:name==='rightFoot'?bones[1]:null}}};
  const W=64,makeCanvas=()=>({width:W,height:W,toDataURL:()=> 'data:image/png;base64,YQ==',
    getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}})});
  let bound=null,lastCamera=null,readCount=0,compiles=0;
  const renderer={domElement:makeCanvas(),shadowMap:{autoUpdate:true},debug:{onShaderError:null},
    getClearColor:c=>c.set(0),getClearAlpha:()=>1,setClearColor(){},getRenderTarget:()=>bound,
    setRenderTarget:t=>{bound=t;},clear(){},getContext:()=>({isContextLost:()=>false}),
    render:(s,c)=>{
      lastCamera=c;
      if(!bound)return;
      if(fail)throw Error('forced render failure');
      const shader={uniforms:{},vertexShader:T.ShaderLib.basic.vertexShader,fragmentShader:T.ShaderLib.basic.fragmentShader};
      boot.material.onBeforeCompile(shader,renderer);
      assert.equal(shader.uniforms.qaBootHide.value,readCount===1);
      assert.match(shader.fragmentShader,/void ankleBootOriginalMain/);compiles++;
    },
    readRenderTargetPixels:(t,x,y,w,h,p)=>{
      for(let i=0;i<p.length;i+=4){p[i]=224;p[i+2]=73;p[i+3]=255;}
      const i=(32*W+29)*4;
      p[i]=readCount?96:32;p[i+1]=40;readCount++;
    }};
  global.window={__debug:{three:T,avatar:()=>actor,scene,renderer,cameraObject:()=>camera}};
  global.document={createElement:makeCanvas};
  return {args:{cameraView:'room',shoeId:item.id,expectedShoeSha256:item.entry.sha256},verify(){
    assert.equal(boot.material,material);assert.equal(pants.material,material);assert.equal(skin.material,material);
    assert.equal(lastCamera,camera);assert.equal(bound,null);assert(renderer.shadowMap.autoUpdate);
    assert.equal(compiles,fail?0:2);assert.equal(renderer.debug.onShaderError,null);
  }};
}

test('same-pose category readbacks and camera/scene restoration',async()=>{
  const f=fixture();
  try{
    const r=await sampleAnkleBootVisibility(f.args);
    assert.equal(r.pixels.visibleBodySkinInBand,1);assert.equal(r.pixels.counts.skinBeforeBoot,1);
    assert.equal(r.pixels.sameBandClothingBehindSkin,1);
    assert.deepEqual(r.images,{normal:'YQ==',mask:'YQ=='});f.verify();
  }finally{delete global.window;delete global.document;}
});
test('render failure restores original meshes and active room target',async()=>{
  const f=fixture(true);
  try{
    await assert.rejects(sampleAnkleBootVisibility(f.args),/forced render failure/);f.verify();
  }finally{delete global.window;delete global.document;}
});
