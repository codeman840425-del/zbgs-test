import * as THREE from 'three';
import {SURFACE_LAYER_PACKAGE} from './surface-layer-catalog.js';
import {composeSurfacePixels, validateSurfaceSelection} from './surface-layer-compositor.js';
const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
const check = (condition, message) => {if(!condition)throw Error(message);};

// Own only the derived textures. The facial palette owns all material writes,
// so lip colour and surface layers cannot overwrite one another asynchronously.
export function createSurfaceLayers({avatarSha256, packageIdentity=SURFACE_LAYER_PACKAGE}) {
  let prepared=null, pending=null, disposed=false, currentTextures=new Set();
  let current=[];
  const originalPixels=new WeakMap();
  async function read(url, sha256) {
    const response=await fetch(url);check(response.ok,`Surface resource HTTP ${response.status}`);
    const bytes=await response.arrayBuffer();check(await hash(bytes)===sha256,'Surface resource identity mismatch');return bytes;
  }
  function pixels(texture) {
    const image=texture?.image;check(image?.width && image?.height && texture.flipY===false,'Surface texture coordinates unavailable');
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
    return {canvas,context,data:context.getImageData(0,0,canvas.width,canvas.height)};
  }
  async function load() {
    if(prepared)return prepared;if(pending)return pending;
    pending=(async()=>{
      check(packageIdentity && /^[a-f0-9]{64}$/.test(packageIdentity.sha256),'No published surface package');
      const raw=await read(packageIdentity.url,packageIdentity.sha256),manifest=JSON.parse(new TextDecoder().decode(raw));
      check(manifest.schema==='character-surface-layer-v1','Unsupported surface schema');
      const variants=manifest.variants?.filter(v=>v.avatarSha256===avatarSha256);
      check(variants?.length===1,'Surface package has no exact body fit');const variant=variants[0];
      check(variant.imageYEqualsUVv===true && Array.isArray(variant.mapSize) && variant.mapSize.length===2 &&
        variant.mapSize.every(v=>Number.isSafeInteger(v)&&v>0&&v<=4096),'Invalid surface map dimensions');
      check(typeof variant.materialName==='string' && /^[a-f0-9]{64}$/.test(variant.sourcePixelSha256),'Surface base identity missing');
      check(Array.isArray(variant.layers) && variant.layers.length>0 && variant.layers.length<=8 &&
        new Set(variant.layers.map(x=>x.id)).size===variant.layers.length,'Invalid surface layer manifest');
      const layers=new Map();
      for(const layer of variant.layers){
        check(Number.isSafeInteger(layer.order) && JSON.stringify(layer.allowedOpacity)==='[0,1]','Unsupported surface layer order/range');
        const url=new URL(layer.url,new URL(packageIdentity.url,location.href));
        check(url.origin===location.origin,'Surface resource must share package origin');
        const bytes=await read(url.href,layer.sha256),image=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
        try{
          check(image.width===variant.mapSize[0]&&image.height===variant.mapSize[1],'Surface overlay dimensions mismatch');
          const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
          const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
          layers.set(layer.id,{...layer,pixels:context.getImageData(0,0,canvas.width,canvas.height).data});
        }finally{image.close();}
      }
      check(!disposed,'Surface owner disposed');return prepared={manifest,variant,layers};
    })().finally(()=>{pending=null;});return pending;
  }
  async function prepare(assignments, selection, expectedManifest) {
    selection=validateSurfaceSelection(selection);
    if(expectedManifest!==undefined)check(expectedManifest===(selection.length?packageIdentity?.sha256:null),'Surface recipe manifest mismatch');
    check(!disposed,'Surface owner disposed');
    const textures=new Set();let live=true;
    try{
      let result=assignments;
      if(selection.length){
        const {variant,layers}=await load();
        const ordered=selection.map(item=>{const layer=layers.get(item.id);check(layer,'Unknown surface layer: '+item.id);return{...layer,opacity:item.opacity};})
          .sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
        const sourceVariants=new Map();
        const compose=source=>{
          if(!source)return source;if(sourceVariants.has(source))return sourceVariants.get(source);
          const {canvas,context,data}=pixels(source);
          check(canvas.width===variant.mapSize[0]&&canvas.height===variant.mapSize[1],'Surface source dimensions mismatch');
          data.data.set(composeSurfacePixels(data.data,ordered));context.putImageData(data,0,0);
          const texture=source.clone();texture.source=new THREE.Source(canvas);texture.needsUpdate=true;
          sourceVariants.set(source,texture);textures.add(texture);return texture;
        };
        for(const {record} of assignments){
          check([variant.materialName,variant.materialName+' (Outline)'].includes(record.material.name),'Surface material mismatch');
          // Original map identity is checked before composing any lip variant.
          for(const source of new Set([record.map,record.shadeMap].filter(Boolean))){
            let value=originalPixels.get(source);
            if(!value){value=await hash(pixels(source).data.data);originalPixels.set(source,value);}
            check(value===variant.sourcePixelSha256,'Surface original pixels mismatch');
          }
        }
        result=assignments.map(a=>({...a,map:compose(a.map),shadeMap:compose(a.shadeMap)}));
      }
      check(!disposed,'Surface owner disposed');
      return {assignments:result,
        commit(){check(live&&!disposed,'Surface preparation expired');for(const t of currentTextures)t.dispose();currentTextures=textures;current=structuredClone(selection);live=false;},
        dispose(){if(!live)return;live=false;for(const t of textures)t.dispose();},
      };
    }catch(error){for(const t of textures)t.dispose();throw error;}
  }
  return{prepare,
    getState:()=>({surfaceLayers:structuredClone(current),surfaceManifestSha256:current.length?packageIdentity?.sha256:null,surfaceTextureCount:currentTextures.size}),
    dispose(){if(disposed)return;disposed=true;for(const t of currentTextures)t.dispose();currentTextures.clear();prepared=null;},
  };
}
