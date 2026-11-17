import { createClothMaterial } from './cloth-material.js';

// One allowlisted implementation. Recipes are data, never downloaded code.
const IMPLEMENTATION = 'cloth-normal-v4-review1';
const IMPLEMENTATION_SHA = '4539ac3f83bc5fb1fa9aa91dbfb7323a8f2e7084a5f762d9713d0ae36bcfb565';
const SHA = /^[a-f0-9]{64}$/;
const ORIGINAL = 'original';

/**
 * Own the render materials for one loaded garment.
 *
 * A recipe transaction prepares clones without touching a mesh. Commit swaps
 * every primitive together and keeps the previous material set alive until the
 * caller releases the transaction. This lets an outer appearance transaction
 * roll back after a later domain fails.
 */
export function createGarmentMaterialRecipes({entry,meshes,avatarSha256,manifestBase,threeRevision,fetchImpl=globalThis.fetch,cryptoImpl=globalThis.crypto}) {
  if ((entry.materialRecipes??[]).length && String(threeRevision)!=='187') throw Error('Material recipe requires reviewed Three revision 187');
  const refs=new Map((entry.materialRecipes??[]).map(r=>[r.id,Object.freeze({...r})]));
  if(refs.size!==(entry.materialRecipes??[]).length)throw Error('Duplicate material recipe IDs');
  for(const r of refs.values())if(!r.id||!SHA.test(r.sha256)||!Number.isSafeInteger(r.bytes)||r.bytes<1||typeof r.url!=='string')throw Error('Invalid material recipe pin');
  const identityBase=Object.freeze({id:entry.id,sha256:entry.sha256,body:avatarSha256,fitId:entry.fitId,styleId:entry.styleId});
  const originals=meshes.map(mesh=>({mesh,material:mesh.material}));
  const cache=new Map();
  let revision=0,disposed=false,pending=null,active=null,activeMaterials=originals.map(item=>item.material),activeClones=[],status='original',error=null,abort=null;
  const transactions=new Set();
  const hash=async bytes=>[...new Uint8Array(await cryptoImpl.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const materialList=material=>Array.isArray(material)?material:[material];
  const sameMaterials=(a,b)=>a.length===b.length&&a.every((value,index)=>value===b[index]);
  const currentMaterials=()=>originals.map(item=>item.mesh.material);
  const disposeMaterials=materials=>{for(const material of materials)material?.dispose?.();};
  const sourceMaterials=()=>originals.flatMap(item=>materialList(item.material));
  function restoreActive(){
    originals.forEach((item,index)=>{item.mesh.material=activeMaterials[index];});
  }
  function clearPending(ticket){if(pending?.revision===ticket)pending=null;}
  function isCurrentTicket(ticket){return !disposed&&pending?.revision===ticket&&revision===ticket;}
  function normalize(id){
    // null remains accepted for the historical API. New records use an
    // explicit "original" selection so restoring source materials is visible.
    if(id===null||id===undefined)return ORIGINAL;
    if(typeof id!=='string')throw new TypeError('Material recipe id must be a string or null');
    return id;
  }
  function validate(recipe,id){
    if(recipe.schema!=='zbgs-garment-material-recipe-v1'||recipe.id!==id||recipe.version!==1||recipe.implementation?.id!==IMPLEMENTATION||recipe.implementation?.sha256!==IMPLEMENTATION_SHA||String(recipe.implementation?.threeRevision)!=='187')throw Error('Unsupported material recipe version/implementation');
    const fit=recipe.fit;
    if(fit?.equipmentId!==identityBase.id||fit?.garmentSha256!==identityBase.sha256||fit?.avatarSha256!==identityBase.body||fit?.fitId!==identityBase.fitId||fit?.styleId!==identityBase.styleId)throw Error('Material recipe incompatible with garment/body fit');
    const names=sourceMaterials().map(material=>material.name).sort();
    if(JSON.stringify(names)!==JSON.stringify(recipe.materialNames?.slice().sort()))throw Error('Material recipe primitive selection differs');
    // createClothMaterial validates the bounded numerical settings before swap.
    return recipe;
  }
  function getState(){
    const pendingState=pending?{revision:pending.revision,recipeId:pending.recipeId}:null;
    return {
      id:identityBase.id,
      revision,
      status,
      pending:pendingState,
      requested:pending?.recipeId??null,
      selected:active?.recipeId??ORIGINAL,
      active:active?{...active}:null,
      error,
      disposed,
    };
  }
  function cancelledTransaction(ticket,reason='superseded'){
    const tx={
      revision:ticket,
      recipeId:null,
      reason,
      isCurrent:()=>false,
      validateCommit:()=>{throw Error(`Material recipe preparation is ${reason}`);},
      commit:()=>{throw Error(`Material recipe preparation is ${reason}`);},
      rollback:()=>{},
      dispose:()=>{},
      release:()=>{},
    };
    return Object.freeze(tx);
  }
  function makeTransaction({ticket,recipeId,recipe,ref,staged,preparedMaterials}){
    const previousMaterials=activeMaterials.slice();
    const previousClones=activeClones.slice();
    const previousActive=active;
    const identity=recipeId===ORIGINAL?null:Object.freeze({schema:'zbgs-equipment-material-selection-v1',equipmentId:identityBase.id,styleId:identityBase.styleId,fitId:identityBase.fitId,garmentSha256:identityBase.sha256,avatarSha256:identityBase.body,recipeId,recipeVersion:recipe.version,recipeSha256:ref.sha256,implementationId:IMPLEMENTATION,implementationSha256:IMPLEMENTATION_SHA});
    let live=true,committed=false,released=false,rolledBack=false;
    const tx={
      revision:ticket,
      recipeId,
      identity,
      isCurrent:()=>live&&!disposed&&revision===ticket&&(pending?.revision===ticket||committed),
      validateCommit(){
        if(!tx.isCurrent())throw Error('Material recipe preparation is no longer current');
        if(committed)return true;
        if(!sameMaterials(currentMaterials(),previousMaterials))throw Error('Garment materials changed while preparing recipe');
        return true;
      },
      commit(){
        tx.validateCommit();
        if(committed)return {applied:true,state:getState()};
        if(recipeId!==ORIGINAL){
          // Keep all old materials alive until this swap is complete. A failed
          // assignment restores every mesh and leaves the old selection intact.
          try{originals.forEach((item,index)=>{item.mesh.material=preparedMaterials[index];});}
          catch(commitError){originals.forEach((item,index)=>{item.mesh.material=previousMaterials[index];});throw commitError;}
        }else originals.forEach((item)=>{item.mesh.material=item.material;});
        activeMaterials=recipeId===ORIGINAL?originals.map(item=>item.material):preparedMaterials.slice();
        activeClones=recipeId===ORIGINAL?[]:staged.slice();
        active=identity;
        committed=true;live=true;clearPending(ticket);status=recipeId===ORIGINAL?'original':'ready';error=null;
        return {applied:true,state:getState()};
      },
      rollback(){
        if(rolledBack||released)return;
        if(!committed){
          if(isCurrentTicket(ticket)){revision++;clearPending(ticket);abort?.abort();abort=null;status=active?'ready':'original';}
          disposeMaterials(staged);live=false;rolledBack=true;released=true;transactions.delete(tx);return;
        }
        if(disposed){
          disposeMaterials(staged);live=false;rolledBack=true;released=true;transactions.delete(tx);return;
        }
        // A later request owns the current material set. Its transaction will
        // release any old clones, so an old commit must simply become inert.
        if(revision!==ticket||!sameMaterials(currentMaterials(),activeMaterials)){
          live=false;rolledBack=true;released=true;transactions.delete(tx);return;
        }
        originals.forEach((item,index)=>{item.mesh.material=previousMaterials[index];});
        activeMaterials=previousMaterials.slice();activeClones=previousClones.slice();active=previousActive;
        disposeMaterials(staged);revision++;clearPending(ticket);status=active?'ready':'original';error=null;live=false;rolledBack=true;released=true;transactions.delete(tx);
      },
      // Finalize a successful outer transaction. Previous active clones are
      // released only here, after all other domains have committed.
      release(){
        if(released)return;
        if(!committed){
          disposeMaterials(staged);released=true;live=false;transactions.delete(tx);
          if(isCurrentTicket(ticket)){revision++;clearPending(ticket);abort?.abort();abort=null;status=active?'ready':'original';}
          return;
        }
        if(!disposed&&!sameMaterials(currentMaterials(),activeMaterials)){released=true;live=false;transactions.delete(tx);return;}
        disposeMaterials(previousClones);released=true;live=false;
        transactions.delete(tx);
      },
      dispose(){
        if(released)return;
        if(committed)this.release();
        else {disposeMaterials(staged);released=true;live=false;transactions.delete(tx);if(isCurrentTicket(ticket)){revision++;clearPending(ticket);abort?.abort();abort=null;status=active?'ready':'original';}}
      },
    };
    transactions.add(tx);
    return tx;
  }
  async function prepareMaterialRecipe(id){
    if(disposed)throw Error('Material recipes disposed');
    const recipeId=normalize(id);
    if(recipeId!==ORIGINAL&&!refs.has(recipeId))throw Error('Unknown material recipe '+recipeId);
    const ticket=++revision;
    abort?.abort();abort=null;
    pending={revision:ticket,recipeId};error=null;status='loading';
    const controller=new AbortController();abort=controller;
    let staged=[],preparedMaterials=[];
    try{
      let recipe=null,ref=null;
      if(recipeId!==ORIGINAL){
        ref=refs.get(recipeId);recipe=cache.get(recipeId);
        if(!recipe){
          const response=await fetchImpl(new URL(ref.url,manifestBase),{cache:'no-store',signal:controller.signal});
          if(!response.ok)throw Error('Material recipe HTTP '+response.status);
          const bytes=await response.arrayBuffer();
          if(bytes.byteLength!==ref.bytes||await hash(bytes)!==ref.sha256)throw Error('Material recipe integrity check failed');
          recipe=validate(JSON.parse(new TextDecoder().decode(bytes)),recipeId);
          if(!isCurrentTicket(ticket))return cancelledTransaction(ticket);
          cache.set(recipeId,recipe);
        }
        recipe=validate(recipe,recipeId);
        if(!isCurrentTicket(ticket))return cancelledTransaction(ticket);
        const replacements=[];
        try{
          for(const item of originals){
            const values=materialList(item.material).map(material=>{const clone=createClothMaterial(material,recipe.settings);staged.push(clone);return clone;});
            replacements.push(Array.isArray(item.material)?values:values[0]);
          }
        }catch(error){disposeMaterials(staged);throw error;}
        preparedMaterials=replacements;
      }else if(!isCurrentTicket(ticket))return cancelledTransaction(ticket);
      if(disposed||!isCurrentTicket(ticket)){disposeMaterials(staged);return cancelledTransaction(ticket,disposed?'disposed':'superseded');}
      const tx=makeTransaction({ticket,recipeId,recipe:recipe||{version:1},ref:ref||{sha256:null},staged,preparedMaterials});
      abort=null;
      return tx;
    }catch(e){
      disposeMaterials(staged);
      if(disposed||!isCurrentTicket(ticket))return cancelledTransaction(ticket,disposed?'disposed':'superseded');
      clearPending(ticket);status='error';error=String(e.message||e);abort=null;throw e;
    }
  }
  async function select(id){
    const tx=await prepareMaterialRecipe(id);
    if(!tx.isCurrent())return {applied:false,reason:tx.reason||'superseded'};
    try{
      const result=tx.commit();
      tx.release();
      return result;
    }catch(e){tx.dispose();throw e;}
  }
  function dispose(){
    if(disposed)return;
    disposed=true;revision++;abort?.abort();abort=null;pending=null;
    for(const tx of transactions)try{tx.dispose();}catch{}
    transactions.clear();
    const liveClones=activeClones.slice();
    originals.forEach(item=>{item.mesh.material=item.material;});
    disposeMaterials(liveClones);activeClones=[];activeMaterials=originals.map(item=>item.material);active=null;
    cache.clear();status='disposed';error=null;
  }
  function cancelPending(){
    if(disposed)return;
    revision++;
    abort?.abort();abort=null;pending=null;
    for(const tx of transactions)try{tx.dispose();}catch{}
    status=active?'ready':'original';error=null;
  }
  return {
    select,
    prepareMaterialRecipe,
    getState,
    list:()=>[...refs.values()].map(r=>({id:r.id,sha256:r.sha256,bytes:r.bytes})),
    dispose,
    cancelPending,
    ORIGINAL,
  };
}
