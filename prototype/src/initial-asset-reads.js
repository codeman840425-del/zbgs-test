import {sha256Hex} from './character-record.js';

// One selected group's initial load. Every parser gets its own ArrayBuffer.
// After release, even an equipment loader retained by a live actor reads afresh.
export function createInitialAssetReads(baseUrl) {
  const entries=new Map();
  let closed=false;
  const key=(url,sha)=>new URL(url,baseUrl).href+' '+sha;
  return {
    async read(url,sha,loadVerified) {
      if (closed) return loadVerified();
      const id=key(url,sha);
      let pending=entries.get(id);
      if (!pending) {
        pending=loadVerified().then(bytes=>new Blob([bytes]));
        entries.set(id,pending);
      }
      try { return (await pending).arrayBuffer(); }
      catch (error) {
        if (entries.get(id)===pending) entries.delete(id);
        throw error;
      }
    },
    dispose() { closed=true; entries.clear(); },
  };
}

export async function loadPinnedBytes(url,sha,scope,{options,bytes,httpError,integrityError}) {
  async function load() {
    const response=await fetch(url,options);
    if (!response.ok) throw Error(httpError+' HTTP '+response.status);
    const data=await response.arrayBuffer();
    if ((bytes!==undefined && data.byteLength!==bytes) || await sha256Hex(new Uint8Array(data))!==sha)
      throw Error(integrityError);
    return data;
  }
  const data=scope?await scope.read(url,sha,load):await load();
  if (bytes!==undefined && data.byteLength!==bytes) throw Error(integrityError);
  return data;
}

// A failed or superseded preflight never releases the displayed group's profiles.
export function createRuleBodyGroupLoads(descriptors,initialize,baseUrl) {
  let pending,active;
  function cancelPending() {
    pending?.abort();
    pending=null;
  }
  return {
    async prepare(records) {
      cancelPending();
      const owner=new AbortController(), initialAssets=createInitialAssetReads(baseUrl);
      pending=owner;
      const bodies=new Set(records.map(r=>r?.appearanceRecipe?.base?.bodyType));
      const selected=descriptors.filter(row=>bodies.has(row.bodyType));
      let registration;
      try {
        registration=await initialize(selected,{initialAssets,signal:owner.signal});
        if (pending!==owner) {
          registration.dispose();
          initialAssets.dispose();
          return null;
        }
        const dispose=()=>{initialAssets.dispose();registration.dispose();};
        owner.signal.addEventListener('abort',dispose,{once:true});
        return {commit(){
          if(pending!==owner)return null;
          owner.signal.removeEventListener('abort',dispose);
          pending=null;
          active?.dispose();
          active={dispose,initialAssets};
          return initialAssets;
        }};
      } catch (error) {
        initialAssets.dispose();
        if (pending!==owner) return null;
        pending=null;
        owner.abort();
        throw error;
      }
    },
    cancel() { cancelPending();active?.initialAssets.dispose(); },
    dispose() { cancelPending();active?.dispose();active=null; },
  };
}
