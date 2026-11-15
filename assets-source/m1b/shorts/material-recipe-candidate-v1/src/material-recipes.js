import { createClothMaterial } from './cloth-material.js';

// One allowlisted implementation; recipes are data, never downloaded code.
const IMPLEMENTATION = 'cloth-normal-v4-review1';
const IMPLEMENTATION_SHA = '4539ac3f83bc5fb1fa9aa91dbfb7323a8f2e7084a5f762d9713d0ae36bcfb565';
const SHA = /^[a-f0-9]{64}$/;
export function createGarmentMaterialRecipes({entry,meshes,avatarSha256,manifestBase,threeRevision,fetchImpl=globalThis.fetch,cryptoImpl=globalThis.crypto}) {
  if ((entry.materialRecipes??[]).length && String(threeRevision)!=='187') throw Error('Material recipe requires reviewed Three revision 187');
  const refs=new Map((entry.materialRecipes??[]).map(r=>[r.id,Object.freeze({...r})]));
  if(refs.size!==(entry.materialRecipes??[]).length)throw Error('Duplicate material recipe IDs');
  for(const r of refs.values())if(!r.id||!SHA.test(r.sha256)||!Number.isSafeInteger(r.bytes)||r.bytes<1||typeof r.url!=='string')throw Error('Invalid material recipe pin');
  const identity=Object.freeze({id:entry.id,sha256:entry.sha256,body:avatarSha256,fitId:entry.fitId,styleId:entry.styleId});
  const originals=meshes.map(mesh=>({mesh,material:mesh.material})),cache=new Map();
  let revision=0,disposed=false,request=null,active=null,clones=[],status='original',error=null,abort=null;
  const hash=async bytes=>[...new Uint8Array(await cryptoImpl.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  function restore(){for(const p of originals)p.mesh.material=p.material;for(const m of clones)m.dispose();clones=[];active=null;}
  function validate(recipe,id){
    if(recipe.schema!=='zbgs-garment-material-recipe-v1'||recipe.id!==id||recipe.version!==1||recipe.implementation?.id!==IMPLEMENTATION||recipe.implementation?.sha256!==IMPLEMENTATION_SHA||String(recipe.implementation?.threeRevision)!=='187')throw Error('Unsupported material recipe version/implementation');
    const fit=recipe.fit;
    if(fit?.equipmentId!==identity.id||fit?.garmentSha256!==identity.sha256||fit?.avatarSha256!==identity.body||fit?.fitId!==identity.fitId||fit?.styleId!==identity.styleId)throw Error('Material recipe incompatible with garment/body fit');
    const names=originals.flatMap(p=>(Array.isArray(p.material)?p.material:[p.material]).map(m=>m.name)).sort();
    if(JSON.stringify(names)!==JSON.stringify(recipe.materialNames?.slice().sort()))throw Error('Material recipe primitive selection differs');
    // createClothMaterial validates the bounded numerical settings before swap.
    return recipe;
  }
  async function select(id){
    if(disposed)throw Error('Material recipes disposed');
    if(id!==null&&!refs.has(id))throw Error('Unknown material recipe '+id);
    const ticket=++revision;abort?.abort();abort=null;request=id;error=null;
    if(id===null){restore();status='original';return {applied:true,state:getState()};}
    if(active?.recipeId===id){status='ready';request=null;return {applied:true,state:getState()};}
    status='loading';const controller=new AbortController();abort=controller;
    try{
      let recipe=cache.get(id);const ref=refs.get(id);
      if(!recipe){
        const response=await fetchImpl(new URL(ref.url,manifestBase),{cache:'no-store',signal:controller.signal});
        if(!response.ok)throw Error('Material recipe HTTP '+response.status);
        const bytes=await response.arrayBuffer();
        if(bytes.byteLength!==ref.bytes||await hash(bytes)!==ref.sha256)throw Error('Material recipe integrity check failed');
        recipe=validate(JSON.parse(new TextDecoder().decode(bytes)),id);
      }
      if(disposed||ticket!==revision)return {applied:false,reason:'superseded'};
      const created=[],replacements=[];
      try{
        for(const p of originals){const values=(Array.isArray(p.material)?p.material:[p.material]).map(m=>{const clone=createClothMaterial(m,recipe.settings);created.push(clone);return clone;});replacements.push(Array.isArray(p.material)?values:values[0]);}
      }catch(e){created.forEach(m=>m.dispose());throw e;}
      restore();originals.forEach((p,i)=>p.mesh.material=replacements[i]);clones=created;
      cache.set(id,recipe);active=Object.freeze({schema:'zbgs-equipment-material-selection-v1',equipmentId:identity.id,styleId:identity.styleId,fitId:identity.fitId,garmentSha256:identity.sha256,avatarSha256:identity.body,recipeId:id,recipeVersion:recipe.version,recipeSha256:ref.sha256,implementationId:IMPLEMENTATION,implementationSha256:IMPLEMENTATION_SHA});
      request=null;status='ready';abort=null;return {applied:true,state:getState()};
    }catch(e){
      if(disposed||ticket!==revision)return {applied:false,reason:'superseded'};
      request=null;status='error';error=String(e.message||e);abort=null;throw e;
    }
  }
  function getState(){return {status,requested:request,active:active?{...active}:null,error,disposed};}
  return {select,getState,list:()=>[...refs.values()].map(r=>({id:r.id,sha256:r.sha256,bytes:r.bytes})),
    dispose(){if(disposed)return;disposed=true;revision++;abort?.abort();abort=null;request=null;restore();cache.clear();status='disposed';error=null;}};
}
