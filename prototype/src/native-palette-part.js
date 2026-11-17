import * as THREE from 'three';

const owners=new WeakMap();
const samplerValues={9729:THREE.LinearFilter,10497:THREE.RepeatWrapping};
const check=(ok,message)=>{if(!ok)throw Error(`原生部件配色：${message}`);};
const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
  .map(value=>value.toString(16).padStart(2,'0')).join('');
const pixels=image=>{
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  check(context,'无法读取来源像素');context.drawImage(image,0,0);
  return context.getImageData(0,0,canvas.width,canvas.height).data;
};

export function createNativePalettePart({vrm,avatarSha256,contract,field,expectedSide=THREE.FrontSide,validateInput=()=>{}}) {
  const token={},pending=new Set(),cleanupErrors=[];
  let disposed=false,generation=0,current='original',wanted='original',loading=false,error=null;
  let baseRecords=null;
  const resources=new Map(),preparations=new Map();

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

  }
  function assertOwned(value) {
    check(!disposed,'人物已卸载');
    if(!value)return;
    for(const record of value.records) {
      const expected=source=>current==='original'?source:resources.get(current)?.textures.get(source);
      check(owners.get(record.material)===token&&record.material.map===expected(record.map)&&
        record.material.shadeMultiplyTexture===expected(record.shadeMap),'部件材质已在外部改变');
    }
  }
  async function load(color) {
    if(resources.has(color))return resources.get(color);
    if(preparations.has(color))return preparations.get(color);
    const preparation=(async()=>{
      const value={records:[],textures:new Map(),reference:null,bitmap:null};
      try {
        const bytes=await read(contract),manifest=JSON.parse(new TextDecoder().decode(bytes)),partData=manifest.schema==='native-facial-palette-v1'&&field==='eyeColor'?manifest.iris:manifest.parts?.[field];
        check(['native-facial-palette-v1','native-facial-palette-v2'].includes(manifest.schema)&&manifest.avatarSha256===avatarSha256&&
          contract.bodySha256===avatarSha256&&manifest.sourceManifestSha256===contract.sourceManifestSha256,'清单或目标身份不匹配');
        check(partData?.materialName&&Number.isInteger(partData.width)&&partData.width>0&&Number.isInteger(partData.height)&&partData.height>0&&partData.texCoord===0&&partData.alphaMode==='BLEND'&&
          Object.keys(partData.colors??{}).length===Object.keys(contract.colors[field]).filter(key=>key!=='original').length&&Object.entries(partData.colors).every(([key,entry])=>key!=='original'&&entry.color===contract.colors[field][key])&&!!partData.colors[color],'原生颜色或映射不匹配');
        const materials=new Set();
        vrm.scene.traverse(mesh=>{
          if(!mesh.isMesh)return;
          for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])
            if(m?.name===partData.materialName||m?.name===partData.materialName+' (Outline)')materials.add(m);
        });
        check(materials.size>0&&materials.size<=2&&[...materials].some(m=>!m.isOutline),'部件材质缺失');
        for(const material of materials) {
          check(material.isMToonMaterial&&typeof material.update==='function'&&(!owners.has(material)||owners.get(material)===token)&&
            material.transparent===true&&material.alphaTest===0&&material.opacity===1&&material.side===expectedSide,'部件MToon或所有权不匹配');
          const saved=baseRecords?.find(record=>record.material===material);
          const map=saved?.map??material.map,shadeMap=saved?.shadeMap??material.shadeMultiplyTexture;
          for(const texture of [map,shadeMap])check(texture?.isTexture&&texture.image?.width===partData.width&&texture.image?.height===partData.height&&
            texture.flipY===partData.sampler.flipY&&texture.colorSpace===partData.sampler.colorSpace&&
            texture.magFilter===samplerValues[partData.sampler.magFilter]&&texture.minFilter===samplerValues[partData.sampler.minFilter]&&
            texture.wrapS===samplerValues[partData.sampler.wrapS]&&texture.wrapT===samplerValues[partData.sampler.wrapT]&&texture.channel===0&&
            texture.offset.x===0&&texture.offset.y===0&&texture.repeat.x===1&&texture.repeat.y===1&&texture.rotation===0,'部件采样或UV不匹配');
          value.records.push({material,map,shadeMap});
        }
        if(baseRecords)check(value.records.length===baseRecords.length&&value.records.every(record=>baseRecords.some(base=>base.material===record.material)),'部件材质集合已改变');
        else baseRecords=value.records;
        for(const record of value.records)owners.set(record.material,token);
        const source=await read(partData.source);
        value.reference=await createImageBitmap(new Blob([source],{type:'image/png'}),
          {premultiplyAlpha:'none',colorSpaceConversion:'none',imageOrientation:'none'});
        check(!disposed,'人物已卸载');
        check(value.reference.width===partData.width&&value.reference.height===partData.height,'来源图片尺寸不匹配');
        const reference=pixels(value.reference),referenceSHA=await digest(reference);
        for(const texture of new Set(value.records.flatMap(record=>[record.map,record.shadeMap])))
          check(await digest(pixels(texture.image))===referenceSHA,'当前部件来源像素不匹配');
        value.reference.close();value.reference=null;
        const colorBytes=await read(partData.colors[color]);
        value.bitmap=await createImageBitmap(new Blob([colorBytes],{type:'image/png'}),
          {premultiplyAlpha:'none',colorSpaceConversion:'none',imageOrientation:'none'});
        check(!disposed,'人物已卸载');
        check(value.bitmap.width===partData.width&&value.bitmap.height===partData.height,'颜色图片尺寸不匹配');
        const colored=pixels(value.bitmap);
        for(let i=3;i<reference.length;i+=4)check(reference[i]===colored[i],'原生颜色alpha发生变化');
        for(const source of new Set(value.records.flatMap(record=>[record.map,record.shadeMap]))) {
          const texture=source.clone();texture.source=new THREE.TextureSource(value.bitmap);texture.needsUpdate=true;
          value.textures.set(source,texture);
        }
        assertOwned(value);resources.set(color,value);return value;
      } catch(e){cleanup(value);throw e;}
    })();
    preparations.set(color,preparation);
    try{return await preparation;}finally{if(preparations.get(color)===preparation)preparations.delete(color);}
  }
  function stage(value,nextColor) {
    if(!value)return;
    const materials=[];
    try {
      for(const record of value.records) {
        const material=record.material.clone();materials.push(material);
        material.map=nextColor==='original'?record.map:value.textures.get(record.map);
        material.shadeMultiplyTexture=nextColor==='original'?record.shadeMap:value.textures.get(record.shadeMap);
        material.update(0);
      }
    } finally{for(const material of materials)material.dispose();}
  }
  async function prepareUpdate(input={}, {trackIntent=false}={}) {
    if(disposed)return{applied:false,reason:'人物已卸载'};
    const nextColor=input.reset?'original':input[field]??(trackIntent?wanted:current);
    try {
      validateInput(input,nextColor);
      check(Object.hasOwn(contract.colors[field],nextColor),'未登记的原生颜色');
    }catch(e){return{applied:false,reason:e.message};}
    if(trackIntent)wanted=nextColor;
    const request=++generation;error=null;loading=nextColor!=='original'&&!resources.has(nextColor);
    try {
      const value=nextColor==='original'?(resources.values().next().value??null):await load(nextColor);
      if(disposed||request!==generation)return{applied:false,cancelled:true};
      assertOwned(value);stage(value,nextColor);
      let live=true,committed=false,checkpoint=null;
      const update={
        isCurrent:()=>{if(!live||disposed||request!==generation)return false;try{assertOwned(value);return true;}catch{return false;}},
        commit() {
          check(update.isCurrent(),'配色准备已过期');
          const previous=value?.records.map(record=>[record.material.map,record.material.shadeMultiplyTexture]);
          checkpoint={previous,color:current};
          try {
            for(const record of value?.records??[]) {
              record.material.map=nextColor==='original'?record.map:value.textures.get(record.map);
              record.material.shadeMultiplyTexture=nextColor==='original'?record.shadeMap:value.textures.get(record.shadeMap);
              record.material.needsUpdate=true;record.material.update(0);
            }
          } catch(e) {
            value.records.forEach((record,i)=>{
              record.material.map=previous[i][0];record.material.shadeMultiplyTexture=previous[i][1];record.material.needsUpdate=true;
              try{record.material.update(0);}catch(restoreError){cleanupErrors.push(String(restoreError));}
            });
            live=false;pending.delete(update);loading=false;wanted=current;throw e;
          }
          current=nextColor;wanted=current;loading=false;live=false;committed=true;pending.delete(update);return{applied:true};
        },
        rollback() {
          if(!committed||disposed||request!==generation)return{applied:false};
          for(const [index,record] of (value?.records??[]).entries()) {
            record.material.map=checkpoint.previous[index][0];record.material.shadeMultiplyTexture=checkpoint.previous[index][1];
            record.material.needsUpdate=true;
            try{record.material.update(0);}catch(e){cleanupErrors.push(String(e));}
          }
          current=checkpoint.color;wanted=current;committed=false;return{applied:true};
        },
        dispose(){if(!live)return;live=false;pending.delete(update);if(request===generation){loading=false;wanted=current;}},
      };
      pending.add(update);return update;
    } catch(e) {
      if(disposed||request!==generation)return{applied:false,cancelled:true};
      error=e.message;loading=false;wanted=current;return{applied:false,reason:e.message};
    }
  }
  return {
    prepareUpdate,
    async set(input={}) {
      const update=await prepareUpdate(input,{trackIntent:true});
      if(!update.commit)return update;
      try{return update.isCurrent()?update.commit():{applied:false,cancelled:true};}finally{update.dispose();}
    },
    getState:()=>({color:current,loading,error,textureCount:[...resources.values()].reduce((sum,value)=>sum+value.textures.size,0),
      version:contract.version,cleanupErrors:[...cleanupErrors]}),
    dispose() {
      if(disposed)return;disposed=true;generation++;loading=false;
      for(const update of [...pending])update.dispose();
      if(baseRecords) {
        for(const record of baseRecords) {
          record.material.map=record.map;record.material.shadeMultiplyTexture=record.shadeMap;record.material.needsUpdate=true;
          try{record.material.update(0);}catch(e){cleanupErrors.push(String(e));}
        }
        for(const value of resources.values())cleanup(value);resources.clear();
        for(const record of baseRecords)if(owners.get(record.material)===token)owners.delete(record.material);
        baseRecords=null;
      }
    },
  };
}
