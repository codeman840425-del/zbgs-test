import {CompanyError,deriveCompany,catalogMaps} from './document.js';

const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const refKey=ref=>`${ref.id}@${ref.version}`;
// Stores sharing an adapter share write intents as well. A browser context uses
// one localStorage adapter; cross-tab simultaneous authoring is not supported.
const storageIntents=new WeakMap();
async function digest(value) {
  const bytes=new TextEncoder().encode(JSON.stringify(canonical(value)));
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function dependencies(document,catalog,templates) {
  deriveCompany(document,catalog,templates);const maps=catalogMaps(catalog,templates);
  const resourceRefs=new Map(),templateRefs=new Map();
  for(const node of document.nodes) {
    if(node.resource)resourceRefs.set(refKey(node.resource),node.resource);
    if(node.template)templateRefs.set(refKey(node.template),node.template);
  }
  const collect=async(refs,map)=>Promise.all([...refs].sort(([a],[b])=>a.localeCompare(b)).map(async([key,ref])=>({...ref,sha256:await digest(map.get(key))})));
  return {resources:await collect(resourceRefs,maps.resources),templates:await collect(templateRefs,maps.combinations)};
}
export async function encodeCompanySave(document,catalog,templates) {
  const saved=structuredClone(document),pins=await dependencies(saved,catalog,templates);
  return JSON.stringify({schema:'company-save',version:1,document:saved,dependencies:pins},null,2)+'\n';
}
export async function decodeCompanySave(text,catalog,templates) {
  let envelope;
  try {envelope=JSON.parse(text);}catch(error){throw new CompanyError('invalid-save-json','save',error.message);}
  if(envelope?.schema!=='company-save'||envelope.version!==1)throw new CompanyError('unsupported-save-version','save','Expected company-save version 1');
  const actual=await dependencies(envelope.document,catalog,templates);
  for(const type of ['resources','templates']) {
    const saved=envelope.dependencies?.[type];
    if(!Array.isArray(saved)||saved.length!==actual[type].length)throw new CompanyError('missing-dependency-pin',`save.dependencies.${type}`,'Save must pin every used resource and template');
    for(let i=0;i<actual[type].length;i++) {
      const expected=actual[type][i],pin=saved[i];
      if(pin?.id!==expected.id||pin.version!==expected.version||pin.sha256!==expected.sha256)
        throw new CompanyError('dependency-content-mismatch',`save.dependencies.${type}[${i}]`,'Pinned ID/version/content differs; retain the original save and load the matching dependency or explicitly migrate',{expected,pin});
    }
  }
  // No lease or task API is called here. Live occupancy must be reconstructed by
  // the character platform from actual actors/tasks, never from an old lock.
  return structuredClone(envelope.document);
}

export function createCompanySaveStore({storage,catalog,templates,prefix='company-platform:v1:'}) {
  if(!storage?.getItem||!storage?.setItem)throw new TypeError('Company store requires an explicit storage adapter');
  const storageKey=id=>prefix+encodeURIComponent(id);
  if(!storageIntents.has(storage))storageIntents.set(storage,new Map());
  const intents=storageIntents.get(storage);
  const begin=id=>{const token=Symbol(id);intents.set(storageKey(id),token);return token;};
  const assertLatest=(id,token)=>{if(intents.get(storageKey(id))!==token)throw new CompanyError('revision-conflict',id,'A later save or import superseded this write');};
  return {
    async save(document,{isCurrent=()=>true}={}) {
      const snapshot=structuredClone(document),token=begin(snapshot.id),text=await encodeCompanySave(snapshot,catalog,templates);
      assertLatest(snapshot.id,token);
      if(!isCurrent(snapshot.revision))throw new CompanyError('revision-conflict','save','Company changed while dependencies were being prepared');
      try {storage.setItem(storageKey(snapshot.id),text);}catch(error){throw new CompanyError('save-write-failed',snapshot.id,error.message);}
      return {id:snapshot.id,revision:snapshot.revision,bytes:new TextEncoder().encode(text).length};
    },
    async load(id) {
      const text=storage.getItem(storageKey(id));
      if(text===null)throw new CompanyError('save-not-found',id,'No saved company with this identity');
      const document=await decodeCompanySave(text,catalog,templates);
      if(document.id!==id)throw new CompanyError('save-identity-mismatch',id,'Stored company identity differs from requested company');
      return document;
    },
    export(id) {
      const text=storage.getItem(storageKey(id));if(text===null)throw new CompanyError('save-not-found',id,'No saved company');return text;
    },
    async import(text,{expectedCompanyId}={}) {
      let raw;try{raw=JSON.parse(text);}catch(error){throw new CompanyError('invalid-save-json','save',error.message);}
      const id=raw?.document?.id;
      if(typeof id!=='string'||!id)throw new CompanyError('invalid-id','save.document.id','Expected a company identity');
      if(expectedCompanyId&&id!==expectedCompanyId)throw new CompanyError('save-identity-mismatch',expectedCompanyId,'Imported company differs from the selected company');
      const token=begin(id);
      const document=await decodeCompanySave(text,catalog,templates);
      if(expectedCompanyId&&document.id!==expectedCompanyId)throw new CompanyError('save-identity-mismatch',expectedCompanyId,'Imported company differs from the selected company');
      assertLatest(id,token);
      // Validation and dependency checking finish before the only storage mutation.
      try {storage.setItem(storageKey(document.id),text);}catch(error){throw new CompanyError('save-write-failed',document.id,error.message);}
      return document;
    },
  };
}
