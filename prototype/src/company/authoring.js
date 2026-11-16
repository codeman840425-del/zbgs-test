import {deriveCompany,prepareCompanyChange,CompanyError} from './document.js';
import {createCompanyScene} from './render.js';
import {createCompanySaveStore,encodeCompanySave,decodeCompanySave} from './persistence.js';
import {inspectCompanyPlacement} from './placement.js';

// Agent-facing authoring transactions. No character, movement, task or lease state.
export async function createCompanyAuthoring(world,initialDocument,{catalog,templates,storage,assetLibrary,isUsePointBusy=()=>false}={}) {
  let generation=0,disposed=false;
  const store=createCompanySaveStore({storage,catalog,templates});
  async function preload(document) {
    const derived=deriveCompany(document,catalog,templates);
    inspectCompanyPlacement(document,catalog,templates);
    await assetLibrary?.preload(derived.facilities.map(f=>f.resource));
    return document;
  }
  await preload(initialDocument);
  const scene=createCompanyScene(world,initialDocument,{catalog,templates,assetLibrary});
  function intent(){if(disposed)throw new CompanyError('scene-disposed','authoring','Authoring session is closed');return ++generation;}
  function latest(token){if(disposed||generation!==token)throw new CompanyError('revision-conflict','authoring','A newer edit or load superseded this prepared scene');}
  return {
    scene,
    get document(){return scene.document;},
    snapshot:()=>scene.snapshot(),
    async apply(operations) {
      const token=intent(),revision=scene.revision;
      const result=prepareCompanyChange(scene.document,operations,{catalog,templates,isUsePointBusy});
      await preload(result.document);latest(token);
      const handle=scene.prepareChange(operations,{expectedRevision:revision,isUsePointBusy});
      try{return scene.commit(handle,{isUsePointBusy});}finally{scene.discard(handle);}
    },
    async load(document) {
      const token=intent(),candidate=structuredClone(document);
      await preload(candidate);latest(token);
      return scene.restore(JSON.stringify(candidate),{isUsePointBusy});
    },
    async import(text) {
      const token=intent();let candidate;
      try{candidate=JSON.parse(text);}catch(error){throw new CompanyError('invalid-json','import',error.message);}
      if(candidate.schema==='company-save')candidate=await decodeCompanySave(text,catalog,templates);
      await preload(candidate);latest(token);
      return scene.restore(JSON.stringify(candidate),{isUsePointBusy});
    },
    async save() {
      const token=generation,document=scene.document;
      return store.save(document,{isCurrent:revision=>!disposed&&generation===token&&scene.document.id===document.id&&scene.revision===revision});
    },
    async restore(id=scene.document.id) {
      const token=intent(),document=await store.load(id);
      await preload(document);latest(token);
      return scene.restore(JSON.stringify(document),{isUsePointBusy});
    },
    export:()=>encodeCompanySave(scene.document,catalog,templates),
    dispose(){if(disposed)return;disposed=true;generation++;scene.dispose();},
  };
}
