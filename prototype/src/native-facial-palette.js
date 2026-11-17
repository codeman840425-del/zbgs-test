import * as THREE from 'three';
import {assertAppearanceColorSelection} from './appearance-color-policy.js';
import {validateSurfaceSelection} from './surface-layer-compositor.js';

const owners=new WeakMap();
const samplerValues={9729:THREE.LinearFilter,10497:THREE.RepeatWrapping};
const check=(ok,message)=>{if(!ok)throw Error(`原生虹膜配色：${message}`);};
const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
  .map(value=>value.toString(16).padStart(2,'0')).join('');
const pixels=image=>{
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  check(context,'无法读取来源像素');context.drawImage(image,0,0);
  return context.getImageData(0,0,canvas.width,canvas.height).data;
};

export function createNativeFacialPalette({vrm,avatarSha256,contract}) {
  const token={},pending=new Set(),cleanupErrors=[];
  let disposed=false,generation=0,eyeColor='original',wantedEye='original',loading=false,error=null;
  let resources=null,preparation=null;
  const baseURL=new URL(contract.url,globalThis.location?.href??'http://localhost/');
  async function read(descriptor) {
    const url=new URL(descriptor.url,baseURL);
    check(url.origin===baseURL.origin,'资源来源不匹配');
    const response=await fetch(url.href);check(response.ok,`资源加载失败 (${response.status})`);
    const bytes=await response.arrayBuffer();check(await digest(bytes)===descriptor.sha256,'资源字节身份不匹配');
    check(!disposed,'人物已卸载');return bytes;
  }
  function cleanup(value) {
    for(const texture of value.textures.values())try{texture.dispose();}catch(e){cleanupErrors.push(String(e));}
    value.textures.clear();
    for(const key of ['reference','bitmap']) {
      try{value[key]?.close();}catch(e){cleanupErrors.push(String(e));}value[key]=null;
    }
    for(const record of value.records)if(owners.get(record.material)===token)owners.delete(record.material);
  }
  function assertOwned(value) {
    check(!disposed,'人物已卸载');
    if(!value)return;
    for(const record of value.records) {
      const expected=source=>eyeColor==='original'?source:value.textures.get(source);
      check(owners.get(record.material)===token&&record.material.map===expected(record.map)&&
        record.material.shadeMultiplyTexture===expected(record.shadeMap),'虹膜材质已在外部改变');
    }
  }
  async function load() {
    if(resources)return resources;
    if(preparation)return preparation;
    preparation=(async()=>{
      const value={records:[],textures:new Map(),reference:null,bitmap:null};
      try {
        const bytes=await read(contract),manifest=JSON.parse(new TextDecoder().decode(bytes)),iris=manifest.iris;
        check(manifest.schema==='native-facial-palette-v1'&&manifest.avatarSha256===avatarSha256&&
          contract.bodySha256===avatarSha256&&manifest.sourceManifestSha256===contract.sourceManifestSha256,'清单或目标身份不匹配');
        check(iris?.materialName&&iris.width===1024&&iris.height===512&&iris.texCoord===0&&iris.alphaMode==='BLEND'&&
          Object.keys(iris.colors??{}).length===1&&iris.colors.green?.color===contract.colors.eyeColor.green,'原生颜色或映射不匹配');
        const materials=new Set();
        vrm.scene.traverse(mesh=>{
          if(!mesh.isMesh)return;
          for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])
            if(m?.name===iris.materialName||m?.name===iris.materialName+' (Outline)')materials.add(m);
        });
        check(materials.size>0&&materials.size<=2&&[...materials].some(m=>!m.isOutline),'虹膜材质缺失');
        for(const material of materials) {
          check(material.isMToonMaterial&&typeof material.update==='function'&&!owners.has(material)&&
            material.transparent===true&&material.alphaTest===0&&material.opacity===1&&material.side===THREE.FrontSide,'虹膜MToon或所有权不匹配');
          const map=material.map,shadeMap=material.shadeMultiplyTexture;
          for(const texture of [map,shadeMap])check(texture?.isTexture&&texture.image?.width===iris.width&&texture.image?.height===iris.height&&
            texture.flipY===iris.sampler.flipY&&texture.colorSpace===iris.sampler.colorSpace&&
            texture.magFilter===samplerValues[iris.sampler.magFilter]&&texture.minFilter===samplerValues[iris.sampler.minFilter]&&
            texture.wrapS===samplerValues[iris.sampler.wrapS]&&texture.wrapT===samplerValues[iris.sampler.wrapT]&&texture.channel===0&&
            texture.offset.x===0&&texture.offset.y===0&&texture.repeat.x===1&&texture.repeat.y===1&&texture.rotation===0,'虹膜采样或UV不匹配');
          value.records.push({material,map,shadeMap});
        }
        for(const record of value.records)owners.set(record.material,token);
        const source=await read(iris.source);
        value.reference=await createImageBitmap(new Blob([source],{type:'image/png'}),
          {premultiplyAlpha:'none',colorSpaceConversion:'none',imageOrientation:'none'});
        check(!disposed,'人物已卸载');
        check(value.reference.width===iris.width&&value.reference.height===iris.height,'来源图片尺寸不匹配');
        const reference=pixels(value.reference),referenceSHA=await digest(reference);
        for(const texture of new Set(value.records.flatMap(record=>[record.map,record.shadeMap])))
          check(await digest(pixels(texture.image))===referenceSHA,'当前虹膜来源像素不匹配');
        value.reference.close();value.reference=null;
        const green=await read(iris.colors.green);
        value.bitmap=await createImageBitmap(new Blob([green],{type:'image/png'}),
          {premultiplyAlpha:'none',colorSpaceConversion:'none',imageOrientation:'none'});
        check(!disposed,'人物已卸载');
        check(value.bitmap.width===iris.width&&value.bitmap.height===iris.height,'颜色图片尺寸不匹配');
        const colored=pixels(value.bitmap);
        for(let i=3;i<reference.length;i+=4)check(reference[i]===colored[i],'原生颜色alpha发生变化');
        for(const source of new Set(value.records.flatMap(record=>[record.map,record.shadeMap]))) {
          const texture=source.clone();texture.source=new THREE.TextureSource(value.bitmap);texture.needsUpdate=true;
          value.textures.set(source,texture);
        }
        assertOwned(value);resources=value;return value;
      } catch(e){cleanup(value);throw e;}
    })();
    try{return await preparation;}finally{preparation=null;}
  }
  function stage(value,nextEye) {
    if(!value)return;
    const materials=[];
    try {
      for(const record of value.records) {
        const material=record.material.clone();materials.push(material);
        material.map=nextEye==='original'?record.map:value.textures.get(record.map);
        material.shadeMultiplyTexture=nextEye==='original'?record.shadeMap:value.textures.get(record.shadeMap);
        material.update(0);
      }
    } finally{for(const material of materials)material.dispose();}
  }
  async function prepareUpdate(input={}, {trackIntent=false}={}) {
    if(disposed)return{applied:false,reason:'人物已卸载'};
    const nextEye=input.reset?'original':input.eyeColor??(trackIntent?wantedEye:eyeColor);
    const nextLip=input.reset?'original':input.lipColor??'original';
    try {
      assertAppearanceColorSelection(avatarSha256,{eyeColor:nextEye,lipColor:nextLip});
      check(Object.hasOwn(contract.colors.eyeColor,nextEye),'未登记的原生颜色');
      check(!validateSurfaceSelection(input.reset?[]:input.surfaceLayers??[]).length,'当前基模没有皮肤层适配');
    }catch(e){return{applied:false,reason:e.message};}
    if(trackIntent)wantedEye=nextEye;
    const request=++generation;error=null;loading=nextEye!=='original'&&!resources;
    try {
      const value=nextEye==='original'?resources:await load();
      if(disposed||request!==generation)return{applied:false,cancelled:true};
      assertOwned(value);stage(value,nextEye);
      let live=true;
      const update={
        isCurrent:()=>{if(!live||disposed||request!==generation)return false;try{assertOwned(value);return true;}catch{return false;}},
        commit() {
          check(update.isCurrent(),'配色准备已过期');
          const previous=value?.records.map(record=>[record.material.map,record.material.shadeMultiplyTexture]);
          try {
            for(const record of value?.records??[]) {
              record.material.map=nextEye==='original'?record.map:value.textures.get(record.map);
              record.material.shadeMultiplyTexture=nextEye==='original'?record.shadeMap:value.textures.get(record.shadeMap);
              record.material.needsUpdate=true;record.material.update(0);
            }
          } catch(e) {
            value.records.forEach((record,i)=>{
              record.material.map=previous[i][0];record.material.shadeMultiplyTexture=previous[i][1];record.material.needsUpdate=true;
              try{record.material.update(0);}catch(restoreError){cleanupErrors.push(String(restoreError));}
            });
            live=false;pending.delete(update);loading=false;wantedEye=eyeColor;throw e;
          }
          eyeColor=nextEye;wantedEye=eyeColor;loading=false;live=false;pending.delete(update);return{applied:true};
        },
        dispose(){if(!live)return;live=false;pending.delete(update);if(request===generation){loading=false;wantedEye=eyeColor;}},
      };
      pending.add(update);return update;
    } catch(e) {
      if(disposed||request!==generation)return{applied:false,cancelled:true};
      error=e.message;loading=false;wantedEye=eyeColor;return{applied:false,reason:e.message};
    }
  }
  return {
    prepareUpdate,
    async set(input={}) {
      const update=await prepareUpdate(input,{trackIntent:true});
      if(!update.commit)return update;
      try{return update.isCurrent()?update.commit():{applied:false,cancelled:true};}finally{update.dispose();}
    },
    getState:()=>({eyeColor,lipColor:'original',surfaceLayers:[],surfaceManifestSha256:null,surfaceTextureCount:0,
      facialPaletteLoading:loading,facialPaletteError:error,facialTextureCount:resources?.textures.size??0,
      facialMaskIdentity:null,nativePaletteVersion:contract.version,cleanupErrors:[...cleanupErrors]}),
    dispose() {
      if(disposed)return;disposed=true;generation++;loading=false;
      for(const update of [...pending])update.dispose();
      if(resources) {
        for(const record of resources.records) {
          record.material.map=record.map;record.material.shadeMultiplyTexture=record.shadeMap;record.material.needsUpdate=true;
          try{record.material.update(0);}catch(e){cleanupErrors.push(String(e));}
        }
        cleanup(resources);resources=null;
      }
    },
  };
}
