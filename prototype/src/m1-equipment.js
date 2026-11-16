import { createEquipment } from "./equipment.js";
import { createM1Skirt } from "./m1-skirt.js";
import { selectSkirtFit } from "./skirt-fit.js";
import { foundationProfile } from "./foundation-profiles.js";
import { createBodyCoverageSet } from "./body-coverage.js";
import { createGarmentCoverage } from "./garment-coverage.js";
import { outfitSelection } from "./outfit-selection.js";

export const M1_AVATAR_SHA256 =
  "027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95";
/** Equipment composition and reversible rendering coverage. Complete body
 * source geometry remains available for diagnostics and contact calibration. */
export async function createM1Equipment({ vrm, avatarSha256, bodyType = "female" }) {
  const config = foundationProfile(bodyType), IDS = config.ids;
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
  });
  try {
    const initial = outfitSelection(config, 0);
    await Promise.all(initial.ids.map((id) => adapter.load(id)));
  } catch (error) {
    adapter.dispose();
    throw error;
  }
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
  if (!body.length || !sourceClothes.length) {
    adapter.dispose();
    throw new Error("M1 expected separate body/clothing primitives");
  }
  let outfit = 0,
    lowerBodyRole = outfitSelection(config, 0).bottomRole,
    debugBody = false,
    disposed = false;
  const item = (role) => adapter.get(IDS[role]);
  let coverage, garmentCoverage, skirtCorrective;
  let revision=0,intentRevision=0;
  const pendingUpdates=new Set();
  function buildPreparedOutfit(nextOutfit,nextDebugBody,nextCoverage=coverage,nextGarmentCoverage=garmentCoverage,nextSkirtCorrective=skirtCorrective){
    if(disposed)throw Error('Equipment is disposed');
    const look=outfitSelection(config,nextOutfit),selected=nextDebugBody?[IDS.shoes]:look.ids;
    let update,garmentUpdate,equipmentUpdate;
    try{update=nextCoverage?.prepareEquipmentSet(selected);garmentUpdate=nextGarmentCoverage?.prepareEquipmentSet(selected);equipmentUpdate=adapter.prepareLoadedSet(selected);}
    catch(error){update?.dispose();garmentUpdate?.dispose();throw error;}
    const ticket=++revision;let live=true,cleaned=false,committed=false;
    const prepared={
      isCurrent:()=>live&&!disposed&&ticket===revision&&equipmentUpdate.isCurrent()&&(!update||update.isCurrent())&&(!garmentUpdate||garmentUpdate.isCurrent()),
      commit(){if(!prepared.isCurrent())throw Error('Outfit preparation is no longer current');equipmentUpdate.commit();update?.commit();garmentUpdate?.commit();outfit=nextOutfit;lowerBodyRole=look.bottomRole;debugBody=nextDebugBody;if(nextGarmentCoverage&&nextGarmentCoverage!==garmentCoverage)garmentCoverage=nextGarmentCoverage;if(nextSkirtCorrective&&nextSkirtCorrective!==skirtCorrective)skirtCorrective=nextSkirtCorrective;committed=true;live=false;pendingUpdates.delete(prepared);},
      dispose(){if(cleaned)return;cleaned=true;live=false;pendingUpdates.delete(prepared);try{equipmentUpdate.dispose();}finally{try{update?.dispose();}finally{garmentUpdate?.dispose();}}if(!committed){if(nextGarmentCoverage&&nextGarmentCoverage!==garmentCoverage)nextGarmentCoverage.dispose();if(nextSkirtCorrective&&nextSkirtCorrective!==skirtCorrective)nextSkirtCorrective.dispose();}},
    };pendingUpdates.add(prepared);return prepared;
  }
  async function prepareOutfit(nextOutfit=outfit,nextDebugBody=debugBody){
    if(disposed)throw Error('Equipment is disposed');
    const request=++intentRevision;
    const look=outfitSelection(config,nextOutfit),selected=nextDebugBody?[IDS.shoes]:look.ids;
    const missing=selected.filter(id=>!adapter.get(id));if(missing.length)await Promise.all(missing.map(id=>adapter.load(id)));if(disposed)throw Error('Equipment is disposed');if(request!==intentRevision)throw Error('Outfit preparation cancelled by a newer selection');
    let nextGarmentCoverage=garmentCoverage,nextSkirtCorrective=skirtCorrective;
    if(config.garmentCoverage&&selected.includes(IDS.outer)&&!nextGarmentCoverage)nextGarmentCoverage=await createGarmentCoverage({inner:adapter.get(IDS.top),outer:adapter.get(IDS.outer),descriptor:config.garmentCoverage,avatarSha256});
    if(IDS.skirt&&look.bottomRole==='skirt'&&!nextSkirtCorrective)nextSkirtCorrective=createM1Skirt({vrm,source:adapter.get(IDS.skirt).meshes[0],body,fit:selectSkirtFit(adapter.get(IDS.skirt).entry,avatarSha256)});
    if(disposed||request!==intentRevision){if(nextGarmentCoverage&&nextGarmentCoverage!==garmentCoverage)nextGarmentCoverage.dispose();if(nextSkirtCorrective&&nextSkirtCorrective!==skirtCorrective)nextSkirtCorrective.dispose();throw Error(disposed?'Equipment is disposed':'Outfit preparation cancelled by a newer selection');}
    return buildPreparedOutfit(nextOutfit,nextDebugBody,coverage,nextGarmentCoverage,nextSkirtCorrective);
  }
  function prepareOutfitSync(nextOutfit=outfit,nextDebugBody=debugBody){
    const look=outfitSelection(config,nextOutfit),selected=nextDebugBody?[IDS.shoes]:look.ids;
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
    coverage = await createBodyCoverageSet({ body, avatarSha256,
      bindings: config.bodyCoverage ? [{entry:item("top").entry, descriptor:config.bodyCoverage}] : [] });
    apply();
    // These are exact duplicated clothing surfaces, not body coverage removal.
    sourceClothes.forEach(({ mesh }) => (mesh.visible = false));
  } catch (error) {
    skirtCorrective?.dispose();
    garmentCoverage?.dispose();
    coverage?.dispose();
    sourceClothes.forEach(({ mesh, visible }) => (mesh.visible = visible));
    adapter.dispose();
    throw error;
  }
  return {
    prepareOutfit,
    setOutfit(value) {
      const { selection } = outfitSelection(config, value);
      apply(selection.index, debugBody);
    },
    setMaterialRecipe(id, recipeId) { return adapter.setMaterialRecipe(id, recipeId); },
    getMaterialRecipeState(id) { return adapter.getMaterialRecipeState(id); },
    setDebugBody(value) {
      apply(outfit, Boolean(value));
    },
    update(dt, colliders = []) {
      if (!debugBody && lowerBodyRole === 'skirt') skirtCorrective?.update(dt, colliders);
    },
    getInfo() {
      return {
        outfit,
        selection: config.outfits.find((o) => o.index === outfit),
        debugBody,
        avatarSha256,
        independentEquipment: true,
        sourceBodyUnchanged: true,
        bodyCoverage: coverage?.getInfo() ?? null,
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
        get top() { return item(lowerBodyRole === 'onePiece' ? 'onePiece' : 'top')?.meshes || []; },
        get outer() { return IDS.outer ? item("outer")?.meshes || [] : []; },
        shoes: item("shoes").meshes,
        get pants() { return item(['shorts','onePiece'].includes(lowerBodyRole) ? lowerBodyRole : 'pants')?.meshes || []; },
        get allPants() { return [...(item("pants")?.meshes || []), ...(IDS.shorts ? item("shorts")?.meshes || [] : []), ...(IDS.onePiece ? item('onePiece')?.meshes || [] : [])]; },
        get onePiece() { return IDS.onePiece ? item('onePiece')?.meshes || [] : []; },
        get shorts() { return IDS.shorts ? item("shorts")?.meshes || [] : []; },
        skirt: skirtCorrective ? [skirtCorrective.mesh] : [],
        get sourceSkirt() { return IDS.skirt ? item("skirt")?.meshes || [] : []; },
        sourceClothes: sourceClothes.map((x) => x.mesh),
        skirtBones: (IDS.skirt && item("skirt") ? item("skirt").meshes[0].skeleton.bones : []).filter((b) =>
          /Skirt/.test(b.name),
        ),
        bindCoordinates:
          "Original glTF / VRM0 coordinates; world forward follows rotateVRM0(vrm)",
        equipment: adapter,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;intentRevision++;
      for(const update of pendingUpdates)update.dispose();
      skirtCorrective?.dispose();
      garmentCoverage?.dispose();
      coverage?.dispose();
      adapter.dispose();
      sourceClothes.forEach(({ mesh, visible }) => (mesh.visible = visible));
    },
  };
}
