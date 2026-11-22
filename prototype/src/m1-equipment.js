import { createEquipment } from "./equipment.js";
import { createM1Skirt } from "./m1-skirt.js";
import { selectSkirtFit } from "./skirt-fit.js";
import { foundationProfile } from "./foundation-profiles.js";
import { createBodyCoverageSet } from "./body-coverage.js";
import { createGarmentCoverage } from "./garment-coverage.js";
import { createBodyTextureCoverage } from "./body-texture-coverage.js";
import { outfitSelection, verifyBottomEquipmentSlot } from "./outfit-selection.js";

export const M1_AVATAR_SHA256 =
  "027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95";
/** Equipment composition and reversible rendering coverage. Complete body
 * source geometry remains available for diagnostics and contact calibration. */
export async function createM1Equipment({ vrm, avatarSha256, bodyType = "female", initialOutfit = 0, initialAssets }) {
  const config = foundationProfile(bodyType), IDS = config.ids;
  const initial = outfitSelection(config, initialOutfit);
  const embeddedClothing = config.embeddedClothing === undefined ? true : config.embeddedClothing;
  if (typeof embeddedClothing !== 'boolean') throw Error('Invalid embedded clothing policy');
  // This measured native mask owner replaces index coverage for this candidate.
  // Combining independently committed coverage systems needs its own contract.
  if(config.bodyTextureCoverage && (config.bodyCoverage || config.additionalBodyCoverage?.length || config.garmentCoverage))
    throw Error('Native texture coverage cannot be combined with unverified geometry coverage');
  // Reject malformed authored looks before allocating any runtime resources.
  for (const look of config.outfits) outfitSelection(config, look.index);
  if (avatarSha256 !== config.sha256)
    throw new Error(
      "Equipment requires its exact body roundtrip identity",
    );
  const adapter = await createEquipment({
    vrm,
    avatarSha256,
    manifestUrl: config.manifestUrl,
    manifestSha256: config.manifestSha256,
    initialAssets,
    additionalManifests: config.additionalEquipmentManifests,
  });
  const sourceClothes = [],
    body = [],
    face = [],
    hair = [];
  vrm.scene.traverse((mesh) => {
    if (!mesh.isSkinnedMesh || mesh.parent?.name?.startsWith("Equipment:"))
      return;
    const names = (
      Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    ).map((m) => m.name);
    if (names.some((n) => /_Body_\d+_SKIN/.test(n))) body.push(mesh);
    else if (
      names.some((n) => /_(Tops|Bottoms|Shoes)_|_Accessory_Tie_/.test(n))
    )
      sourceClothes.push({ mesh, visible: mesh.visible });
    else if (names.some((n) => /_HAIR/.test(n))) hair.push(mesh);
    else face.push(mesh);
  });
  if (!body.length || Boolean(sourceClothes.length) !== embeddedClothing) {
    adapter.dispose();
    throw new Error("Body or embedded clothing primitives differ from the registered body layout");
  }
  let outfit = initial.selection.index,
    lowerBodyRole = initial.bottomRole,
    debugBody = false,
    disposed = false;
  const item = (role) => adapter.get(IDS[role]);
  // Slot semantics belong to the manifest. Alternate tops share the same
  // controller, body and pose, without replacing the frozen original look.
  const selectedTopRole = () => lowerBodyRole === 'onePiece' ? 'onePiece' :
    outfitSelection(config, outfit).roles.find(role => item(role)?.entry.slot === 'top');
  let coverage, textureCoverage, garmentCoverage, garmentCoveragePending, skirtCorrective;
  let revision=0,intentRevision=0;
  const pendingUpdates=new Set();
  const footwearIds = new Map();
  const lowerEquipmentRoles = new Map();
  const pantsRoles = new Set(['pants', 'shorts', 'onePiece'].filter(role => Object.hasOwn(IDS, role)));
  const footwearPreparers = new Set();
  const getFootwear = () => adapter.get(footwearIds.get(outfit));
  function buildPreparedOutfit(nextOutfit,nextDebugBody,expectedIntent=intentRevision,materialUpdates=[]){
    if(disposed)throw Error('Equipment is disposed');
    const look=outfitSelection(config,nextOutfit),selected=nextDebugBody?[footwearIds.get(nextOutfit)]:look.ids;
    const shoeUpdates = [];
    let update,textureUpdate,garmentUpdate,equipmentUpdate;
    function releasePreparations() {
      const failures = [];
      for (const piece of [...materialUpdates, ...shoeUpdates, equipmentUpdate, update, textureUpdate, garmentUpdate]) {
        try { piece?.dispose(); } catch (error) { failures.push(error); }
      }
      if (failures.length) throw new AggregateError(failures, 'Outfit preparation cleanup failed');
    }
    try{update=coverage?.prepareEquipmentSet(selected);garmentUpdate=garmentCoverage?.prepareEquipmentSet(selected);textureUpdate=textureCoverage?.prepareEquipmentSet(selected);equipmentUpdate=adapter.prepareLoadedSet(selected);
      if (footwearIds.get(nextOutfit) !== footwearIds.get(outfit)) {
        const nextShoe = adapter.get(footwearIds.get(nextOutfit));
        for (const prepare of footwearPreparers) shoeUpdates.push(prepare(nextShoe));
      }
    }
    catch(error){
      try { releasePreparations(); } catch (cleanup) {
        throw new AggregateError([error, cleanup], 'Outfit preparation and cleanup failed', {cause:error});
      }
      throw error;
    }
    const ticket=++revision;let live=true,cleaned=false,committed=false,rolledBack=false;
    const previousState={outfit,lowerBodyRole,debugBody};
    const prepared={
      isCurrent:()=>live&&!disposed&&ticket===revision&&expectedIntent===intentRevision&&equipmentUpdate.isCurrent()&&(!update||update.isCurrent())&&(!textureUpdate||textureUpdate.isCurrent())&&(!garmentUpdate||garmentUpdate.isCurrent())&&materialUpdates.every(candidate=>candidate.isCurrent()),
      commit(){
        if(!prepared.isCurrent())throw Error('Outfit preparation is no longer current');
        const committedUpdates=[];
        try{
          for(const candidate of [textureUpdate,equipmentUpdate,update,garmentUpdate,...shoeUpdates,...materialUpdates]){if(candidate)committedUpdates.push(candidate);candidate?.commit();}
        }
        catch(error){
          const rollbackErrors=[];
          for(const candidate of committedUpdates.reverse())try{candidate.rollback?.();}catch(rollbackError){rollbackErrors.push(rollbackError);}
          if(rollbackErrors.length){
            const failure=Error('Outfit commit failed and rollback was incomplete: '+rollbackErrors.map(item=>item.message).join('; '));
            failure.cause=error;failure.rollbackErrors=rollbackErrors;prepared.commitError=failure;throw failure;
          }
          prepared.commitError=error;throw error;
        }
        outfit=nextOutfit;lowerBodyRole=look.bottomRole;debugBody=nextDebugBody;committed=true;live=false;pendingUpdates.delete(prepared);
      },
      rollback(){
        if(!committed||rolledBack)return;
        if(cleaned)throw Error('Outfit update already finalized');
        const errors=[];
        for(const candidate of [...materialUpdates.slice().reverse(),...shoeUpdates.slice().reverse(),garmentUpdate,update,equipmentUpdate,textureUpdate])try{candidate?.rollback?.();}catch(error){errors.push(error);}
        outfit=previousState.outfit;lowerBodyRole=previousState.lowerBodyRole;debugBody=previousState.debugBody;rolledBack=true;
        if(errors.length)throw Error('Outfit rollback failed: '+errors.map(error=>error.message).join('; '));
      },
      dispose() {
        if (cleaned) return;
        cleaned = true;
        live = false;
        pendingUpdates.delete(prepared);
        releasePreparations();
      },
    };pendingUpdates.add(prepared);return prepared;
  }
  function createSkirtAtRest(args) {
    const humanoid = vrm.humanoid;
    const snapshot = (nodes) => nodes
      .filter(Boolean)
      .map((node) => ({node, position:node.position.clone(), quaternion:node.quaternion.clone(), scale:node.scale.clone()}));
    const normalizedNodes = Object.values(humanoid?.normalizedHumanBones || {})
      .map((entry) => entry?.node)
      .concat(humanoid?.normalizedHumanBonesRoot || []);
    const rawNodes = Object.values(humanoid?.rawHumanBones || {})
      .map((entry) => entry?.node);
    const normalizedSnapshot = snapshot([...new Set(normalizedNodes)]);
    const rawSnapshot = snapshot([...new Set(rawNodes)]);
    if (!humanoid?.resetNormalizedPose || !humanoid?.update)
      throw Error('Skirt preparation requires the VRM rest-pose API');
    // m1-skirt samples body vertices against raw thigh axes. Calibrate from
    // the authored VRM T-pose even when the first skirt request arrives while
    // motion or live presentation has changed normalized and raw bones.
    humanoid.resetNormalizedPose();
    humanoid.update();
    vrm.scene.updateMatrixWorld(true);
    try {
      return createM1Skirt(args);
    } finally {
      for (const {node,position,quaternion,scale} of normalizedSnapshot) {
        node.position.copy(position);
        node.quaternion.copy(quaternion);
        node.scale.copy(scale);
      }
      for (const {node,position,quaternion,scale} of rawSnapshot) {
        node.position.copy(position);
        node.quaternion.copy(quaternion);
        node.scale.copy(scale);
      }
      vrm.scene.updateMatrixWorld(true);
    }
  }
  function ensureGarmentCoverage() {
    if (garmentCoverage) return Promise.resolve(garmentCoverage);
    if (!garmentCoveragePending) {
      // A helper owns the shared top's original geometry. It belongs to the
      // actor, not to a request whose later cancellation could restore that
      // geometry over a newer committed mask. Concurrent requests share it.
      garmentCoveragePending = createGarmentCoverage({
        inner:item('top'),outer:item('outer'),descriptor:config.garmentCoverage,avatarSha256,
      }).then(helper=>{
        if(disposed){helper?.dispose();throw Error('Equipment is disposed');}
        garmentCoverage=helper;
        return helper;
      }).finally(()=>{garmentCoveragePending=null;});
    }
    return garmentCoveragePending;
  }
  async function prepareOutfit(nextOutfit=outfit,nextDebugBody=debugBody){
    if(disposed)throw Error('Equipment is disposed');
    const request=++intentRevision;
    const look=outfitSelection(config,nextOutfit);
    const needsGarmentCoverage = config.garmentCoverage && look.ids.includes(IDS.outer);
    if (needsGarmentCoverage && !look.ids.includes(IDS.top))
      throw Error('Garment coverage requires the registered inner top in the selected outfit');
    // Diagnostic body mode hides the chosen look; it does not discard it.
    // Prepare the chosen outfit so returning to dressed mode remains atomic.
    const missing=look.ids.filter(id=>!adapter.get(id));
    if(missing.length)await Promise.all(missing.map(id=>adapter.load(id)));
    if(disposed)throw Error('Equipment is disposed');
    if(request!==intentRevision)throw Error('Outfit preparation cancelled by a newer selection');
    if(needsGarmentCoverage)await ensureGarmentCoverage();
    if(disposed)throw Error('Equipment is disposed');
    if(request!==intentRevision)throw Error('Outfit preparation cancelled by a newer selection');
    if(IDS.skirt&&look.bottomRole==='skirt'&&!skirtCorrective)
      skirtCorrective=createSkirtAtRest({vrm,source:item('skirt').meshes[0],body,fit:selectSkirtFit(item('skirt').entry,avatarSha256)});
    const materialUpdates=[];
    try {
      const requestedRecipes=look.selection.materialRecipes ?? {};
      for (const role of config.materialRecipeRoles ?? []) {
        const id=IDS[role];
        if (!id) throw Error(`Unknown material recipe role: ${role}`);
        materialUpdates.push(await adapter.prepareMaterialRecipe(id, requestedRecipes[role] ?? 'original'));
      }
    } catch (error) {
      materialUpdates.forEach(update=>update.dispose());
      throw error;
    }
    if(request!==intentRevision){materialUpdates.forEach(update=>update.dispose());throw Error('Outfit preparation cancelled by a newer selection');}
    return buildPreparedOutfit(nextOutfit,nextDebugBody,request,materialUpdates);
  }
  function prepareOutfitSync(nextOutfit=outfit,nextDebugBody=debugBody){
    intentRevision++;
    const look=outfitSelection(config,nextOutfit),selected=nextDebugBody?[footwearIds.get(nextOutfit)]:look.ids;
    if(selected.some(id=>!adapter.get(id)))throw Error('Outfit resources are not loaded; await prepareOutfit');
    if(config.garmentCoverage&&selected.includes(IDS.outer)&&!garmentCoverage)throw Error('Outfit coverage is not prepared; await prepareOutfit');
    if(IDS.skirt&&look.bottomRole==='skirt'&&!skirtCorrective)throw Error('Skirt solver is not prepared; await prepareOutfit');
    return buildPreparedOutfit(nextOutfit,nextDebugBody);
  }
  function apply(nextOutfit = outfit, nextDebugBody = debugBody) {
    if(disposed)return;
    const update=prepareOutfitSync(nextOutfit,nextDebugBody);
    try{update.commit();}finally{update.dispose();}
  }
  try {
    for (const look of config.outfits) {
      const selected = outfitSelection(config, look.index);
      const entries = selected.ids.map(id => adapter.describe(id));
      verifyBottomEquipmentSlot(selected, entries);
      lowerEquipmentRoles.set(look.index, selected.bottomEquipmentRole);
      if (selected.bottomRole !== 'skirt') pantsRoles.add(selected.bottomEquipmentRole);
      const shoes = entries.filter(entry => entry.slot === 'shoes');
      if (shoes.length !== 1) throw Error('Outfit must select exactly one footwear item: ' + look.role);
      footwearIds.set(look.index, shoes[0].id);
    }
    const coverageBindings = [
      ...(config.bodyCoverage ? [{entry:adapter.describe(IDS.top), descriptor:config.bodyCoverage}] : []),
      ...(config.additionalBodyCoverage ?? []).map(({role,descriptor}) => {
        if (!Object.hasOwn(IDS, role)) throw Error(`Unknown coverage equipment role: ${role}`);
        // Metadata only; an unselected garment remains unloaded.
        return {entry:adapter.describe(IDS[role]), descriptor};
      }),
    ];
    coverage = await createBodyCoverageSet({ body, avatarSha256, bindings:coverageBindings });
    if(config.bodyTextureCoverage)textureCoverage=await createBodyTextureCoverage({
      body,avatarSha256,entries:Object.values(IDS).map(id=>adapter.describe(id)),descriptor:config.bodyTextureCoverage,
    });
    const update = await prepareOutfit();
    try { update.commit(); } finally { update.dispose(); }
    // These are exact duplicated clothing surfaces, not body coverage removal.
    sourceClothes.forEach(({ mesh }) => (mesh.visible = false));
  } catch (error) {
    skirtCorrective?.dispose();
    garmentCoverage?.dispose();
    coverage?.dispose();
    textureCoverage?.dispose();
    sourceClothes.forEach(({ mesh, visible }) => (mesh.visible = visible));
    adapter.dispose();
    throw error;
  }
  return {
    prepareOutfit,
    getFootwear,
    defaultFootwearId: footwearIds.get(0),
    subscribeFootwear: new Set(footwearIds.values()).size > 1 ? prepare => {
      footwearPreparers.add(prepare);
      return () => footwearPreparers.delete(prepare);
    } : undefined,
    get bodyTextureCoverage() { return textureCoverage; },
    setOutfit(value) {
      const { selection } = outfitSelection(config, value);
      apply(selection.index, debugBody);
    },
    setMaterialRecipe(id, recipeId) { return adapter.setMaterialRecipe(id, recipeId); },
    prepareMaterialRecipe(id, recipeId) { return adapter.prepareMaterialRecipe(id, recipeId); },
    getMaterialRecipeRevision(id) { return adapter.getMaterialRecipeRevision(id); },
    getMaterialRecipeState(id) { return adapter.getMaterialRecipeState(id); },
    setDebugBody(value) {
      apply(outfit, Boolean(value));
    },
    update(dt, colliders = []) {
      if (!debugBody && lowerBodyRole === 'skirt') skirtCorrective?.update(dt, colliders);
    },
    updateMaterials(dt) { adapter.update(dt); },
    getInfo() {
      return {
        outfit,
        selection: config.outfits.find((o) => o.index === outfit),
        debugBody,
        avatarSha256,
        independentEquipment: true,
        sourceBodyUnchanged: true,
        bodyCoverage: coverage?.getInfo() ?? null,
        bodyTextureCoverage: textureCoverage?.getInfo() ?? null,
        garmentCoverage: garmentCoverage?.getInfo() ?? null,
        skirtDynamics: skirtCorrective?.getInfo() ?? null,
        items: Object.fromEntries(
          Object.entries(IDS).map(([role, id]) => [
            role,
            item(role) ? { id, visible: item(role).container.visible, ...item(role).stats } : { id, loaded: false },
          ]),
        ),
      };
    },
    getAssetProfile() {
      return {
        body,
        face,
        hair,
        get top() { return item(selectedTopRole())?.meshes || []; },
        get outer() { return IDS.outer ? item("outer")?.meshes || [] : []; },
        get shoes() { return getFootwear().meshes; },
        get pants() { return item(lowerBodyRole === 'skirt' ? 'pants' : lowerEquipmentRoles.get(outfit))?.meshes || []; },
        get allPants() { return [...pantsRoles].flatMap(role => item(role)?.meshes || []); },
        get onePiece() { return IDS.onePiece ? item('onePiece')?.meshes || [] : []; },
        get shorts() { return IDS.shorts ? item("shorts")?.meshes || [] : []; },
        get skirt() { return skirtCorrective ? [skirtCorrective.mesh] : []; },
        get sourceSkirt() { return IDS.skirt ? item("skirt")?.meshes || [] : []; },
        sourceClothes: sourceClothes.map((x) => x.mesh),
        get skirtBones() { return (IDS.skirt && item("skirt") ? item("skirt").meshes[0].skeleton.bones : []).filter((b) => /Skirt/.test(b.name)); },
        bindCoordinates:
          "Original glTF / VRM0 coordinates; world forward follows rotateVRM0(vrm)",
        equipment: adapter,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;intentRevision++;
      for(const update of pendingUpdates)update.dispose();
      footwearPreparers.clear();
      skirtCorrective?.dispose();
      garmentCoverage?.dispose();
      coverage?.dispose();
      textureCoverage?.dispose();
      adapter.dispose();
      sourceClothes.forEach(({ mesh, visible }) => (mesh.visible = visible));
    },
  };
}
