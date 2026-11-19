import {deriveCompany,prepareCompanyChange,CompanyError} from './document.js';
import {createCompanyScene,validateCeilingDocumentAssets} from './render.js';
import {createCompanySaveStore,encodeCompanySave,decodeCompanySave} from './persistence.js';
import {inspectCompanyPlacement} from './placement.js';
import {installationGeometryFacilities} from './desktop-placement.js';
import {publicWashroomFloors,measurePublicWashroomFloor,shouldCheckPublicWashrooms} from './public-washroom.js';
import {prepareTemplateUpgrade} from './upgrade.js';

// Agent-facing authoring transactions. No character, movement, task or lease state.
export async function createCompanyAuthoring(world,initialDocument,{catalog,templates,storage,assetLibrary,mirrorPreflight,mirrorRenderProfile,isUsePointBusy=()=>false}={}) {
  let generation=0,disposed=false;
  const pendingPreloads=new Map();
  let verifiedWashroomFloors=new Map();
  function washroomChecks(document,derived) {
    return publicWashroomFloors(document,derived).map(group=>{
      const nodes=document.nodes.filter(node=>derived.floorIds.get(node.id)===group.id);
      const signature=JSON.stringify([document.id,nodes,group.bindings.map(b=>b.rule),
        group.resources.map(r=>[r.id,r.version,r.asset?.sha256])]);
      return {group,signature,changed:verifiedWashroomFloors.get(group.id)!==signature};
    });
  }
  const store=createCompanySaveStore({storage,catalog,templates});
  function resources(document,view={},contacts=[]) {
    const derived=deriveCompany(document,catalog,templates);
    const floorId=view.floorId||document.nodes.find(n=>n.kind==='floor').id;
    const surfaceResources=view.mode==='building'?[]:derived.surfaceFinishes.filter(f=>f.floorId===floorId).map(f=>f.resource);
    return [...(view.mode==='building'?[]:derived.facilities.filter(f=>f.floorId===floorId).map(f=>f.resource)),...surfaceResources,...contacts];
  }
  function pendingResources() { return pendingPreloads.get(generation)||[]; }
  async function preload(document,view={},token=null,checkInstallation=true,changedHeightIds=[]) {
    const derived=checkInstallation?deriveCompany(document,catalog,templates):null;
    const installations=derived?installationGeometryFacilities(derived):[];
    const heightResources=changedHeightIds.length?derived.facilities.filter(f=>changedHeightIds.includes(f.id)).map(f=>f.resource):[];
    const washrooms=derived?washroomChecks(document,derived):[];
    const changed=washrooms.filter(row=>row.changed);
    const requested=[...resources(document,view),...installations.map(f=>f.resource),...heightResources,
      ...changed.flatMap(row=>row.group.resources)];
    if(token!==null)pendingPreloads.set(token,requested);
    const placement=inspectCompanyPlacement(document,catalog,templates);
    await assetLibrary?.preload(requested);
    if(token!==null)latest(token);
    if(derived){
      validateCeilingDocumentAssets(derived,assetLibrary,installations);
      for(const {group} of changed)measurePublicWashroomFloor(document,derived,placement,group,{catalog,templates,assetLibrary});
      verifiedWashroomFloors=new Map(washrooms.map(row=>[row.group.id,row.signature]));
    }
    return document;
  }
  await preload(initialDocument);
  const scene=createCompanyScene(world,initialDocument,{catalog,templates,assetLibrary,mirrorPreflight,mirrorRenderProfile});
  assetLibrary?.retainOnly?.(resources(initialDocument));
  function intent(){if(disposed)throw new CompanyError('scene-disposed','authoring','Authoring session is closed');return ++generation;}
  function latest(token){if(disposed||generation!==token)throw new CompanyError('revision-conflict','authoring','A newer edit or load superseded this prepared scene');}
  function prune() {
    if(!disposed)assetLibrary?.retainOnly?.([...resources(scene.document,scene.view,scene.contactResources?.()||[]),...pendingResources()]);
  }
  async function transaction(action) {
    const token=intent();
    try{return await action(token);}finally{pendingPreloads.delete(token);prune();}
  }
  async function replace(candidate,token) {
    latest(token);
    const floorId=candidate.nodes.some(n=>n.id===scene.view.floorId&&n.kind==='floor')?scene.view.floorId:undefined;
    await preload(candidate,{floorId},token);latest(token);return scene.restore(JSON.stringify(candidate),{isUsePointBusy});
  }
  function checkedSnapshot() {
    const document=scene.document,snapshot={document,token:generation};
    if(!shouldCheckPublicWashrooms(document,{catalog}))return snapshot;
    const derived=deriveCompany(document,catalog,templates);
    if(!washroomChecks(document,derived).some(row=>row.changed))return snapshot;
    // A host can edit the exposed scene directly. Validate a fresh snapshot before writing it.
    return transaction(async token=>{
      await preload(document,scene.view,token);latest(token);
      if(scene.revision!==document.revision||scene.document.id!==document.id)
        throw new CompanyError('revision-conflict','washroom','The edited floor changed before it could be saved');
      return {document,token};
    });
  }
  return {
    scene,
    get document(){return scene.document;},
    snapshot:()=>scene.snapshot(),
    async apply(operations) {
      return transaction(async token=>{
        const revision=scene.revision,result=prepareCompanyChange(scene.document,operations,{catalog,templates,isUsePointBusy});
        let handle;
        try {
          const changedHeightIds=operations.filter(op=>op.type==='set-vocal-height').map(op=>op.id);
          await preload(result.document,scene.view,token,true,changedHeightIds);latest(token);
          handle=scene.prepareChange(operations,{expectedRevision:revision,isUsePointBusy});
          return scene.commit(handle,{isUsePointBusy});
        } finally {if(handle)scene.discard(handle);}
      });
    },
    async load(document) {
      return transaction(token=>replace(structuredClone(document),token));
    },
    async import(text) {
      return transaction(async token=>{
        let candidate;
        try{candidate=JSON.parse(text);}catch(error){throw new CompanyError('invalid-json','import',error.message);}
        if(candidate?.schema==='company-save')candidate=await decodeCompanySave(text,catalog,templates);
        return replace(candidate,token);
      });
    },
    async save() {
      const checked=checkedSnapshot();
      const {document,token}=checked instanceof Promise?await checked:checked;
      return store.save(document,{isCurrent:revision=>!disposed&&generation===token&&scene.document.id===document.id&&scene.revision===revision});
    },
    readSavedText(id) { return store.export(id); },
    async restore(id=scene.document.id) {
      return transaction(async token=>replace(await store.load(id),token));
    },
    async setView(view) {
      return transaction(async token=>{
        const next={...scene.view,...view};await preload(scene.document,next,token,false);latest(token);return scene.setView(next);
      });
    },
    async retainUsePointContact(id) {
      if(disposed)throw new CompanyError('scene-disposed','authoring','Authoring session is closed');
      let handle;
      try {
        handle=await scene.retainUsePointContact(id);
        if(disposed) { handle.release?.(); throw new CompanyError('scene-disposed','authoring','Authoring session is closed'); }
        return handle;
      } finally { prune(); }
    },
    releaseUsePointContact(handle) {
      scene.releaseUsePointContact(handle);
      prune();
    },
    async upgrade(stationId,targetRef) {
      return transaction(async token=>{
        const result=prepareTemplateUpgrade(scene.document,stationId,targetRef,{catalog,templates,isUsePointBusy});
        await replace(result.document,token);return result;
      });
    },
    export:async()=>encodeCompanySave((await checkedSnapshot()).document,catalog,templates),
    dispose(){if(disposed)return;disposed=true;generation++;scene.dispose();},
  };
}
