import { createEquipment } from "./equipment.js";
import { createM1Skirt } from "./m1-skirt.js";
import { selectSkirtFit } from "./skirt-fit.js";
import { foundationProfile } from "./foundation-profiles.js";
import { createBodyCoverageSet } from "./body-coverage.js";
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
    await Promise.all(Object.values(IDS).map((id) => adapter.load(id)));
    if (IDS.skirt) selectSkirtFit(adapter.get(IDS.skirt).entry, avatarSha256);
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
  let coverage, skirtCorrective;
  let revision=0;
  const pendingUpdates=new Set();
  function prepareOutfit(nextOutfit = outfit, nextDebugBody = debugBody) {
    if (disposed) throw Error('Equipment is disposed');
    // All assets are already loaded. Visibility changes are synchronous and
    // cannot arrive later over a newer user request.
    const look = outfitSelection(config, nextOutfit);
    const selected = nextDebugBody ? [IDS.shoes] : look.ids;
    const update = coverage?.prepareEquipmentSet(selected);
    let equipmentUpdate;
    try { equipmentUpdate=adapter.prepareLoadedSet(selected); }
    catch(error){update?.dispose();throw error;}
    const ticket=++revision;let live=true,cleaned=false;
    const prepared={
      isCurrent:()=>live&&!disposed&&ticket===revision&&equipmentUpdate.isCurrent()&&(!update||update.isCurrent()),
      commit(){
        if(!prepared.isCurrent())throw Error('Outfit preparation is no longer current');
        equipmentUpdate.commit();update?.commit();
        outfit=nextOutfit;lowerBodyRole=look.bottomRole;debugBody=nextDebugBody;
        live=false;pendingUpdates.delete(prepared);
      },
      dispose(){
        if(cleaned)return;cleaned=true;live=false;pendingUpdates.delete(prepared);
        try{equipmentUpdate.dispose();}finally{update?.dispose();}
      },
    };
    pendingUpdates.add(prepared);return prepared;
  }
  function apply(nextOutfit = outfit, nextDebugBody = debugBody) {
    if(disposed)return;
    const update=prepareOutfit(nextOutfit,nextDebugBody);
    try{update.commit();}finally{update.dispose();}
  }
  try {
    coverage = await createBodyCoverageSet({ body, avatarSha256,
      bindings: config.bodyCoverage ? [{entry:item("top").entry, descriptor:config.bodyCoverage}] : [] });
    skirtCorrective = IDS.skirt ? createM1Skirt({
      vrm, source: item("skirt").meshes[0], body,
      fit: selectSkirtFit(item("skirt").entry, avatarSha256),
    }) : null;
    apply();
    // These are exact duplicated clothing surfaces, not body coverage removal.
    sourceClothes.forEach(({ mesh }) => (mesh.visible = false));
  } catch (error) {
    skirtCorrective?.dispose();
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
        skirtDynamics: skirtCorrective?.getInfo() ?? null,
        items: Object.fromEntries(
          Object.entries(IDS).map(([role, id]) => [
            role,
            { id, visible: item(role).container.visible, ...item(role).stats },
          ]),
        ),
      };
    },
    getAssetProfile() {
      return {
        body,
        face,
        hair,
        top: item("top").meshes,
        shoes: item("shoes").meshes,
        get pants() { return item(lowerBodyRole === 'shorts' ? 'shorts' : 'pants').meshes; },
        allPants: [...item("pants").meshes, ...(IDS.shorts ? item("shorts").meshes : [])],
        shorts: IDS.shorts ? item("shorts").meshes : [],
        skirt: skirtCorrective ? [skirtCorrective.mesh] : [],
        sourceSkirt: IDS.skirt ? item("skirt").meshes : [],
        sourceClothes: sourceClothes.map((x) => x.mesh),
        skirtBones: (IDS.skirt ? item("skirt").meshes[0].skeleton.bones : []).filter((b) =>
          /Skirt/.test(b.name),
        ),
        bindCoordinates:
          "Original glTF / VRM0 coordinates; world forward follows rotateVRM0(vrm)",
        equipment: adapter,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for(const update of pendingUpdates)update.dispose();
      skirtCorrective?.dispose();
      coverage?.dispose();
      adapter.dispose();
      sourceClothes.forEach(({ mesh, visible }) => (mesh.visible = visible));
    },
  };
}
