import { createEquipment } from "./equipment.js";
import { createM1Skirt } from "./m1-skirt.js";

export const M1_AVATAR_SHA256 =
  "027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95";
const IDS = {
  top: "m1-uniform-top",
  shoes: "m1-uniform-shoes",
  skirt: "m1-uniform-skirt",
  pants: "m1-training-pants",
};

/** Equipment composition only. Does not control animation, delete body faces,
 * alter body materials, or infer compatibility from a similar-looking model. */
export async function createM1Equipment({ vrm, avatarSha256 }) {
  if (avatarSha256 !== M1_AVATAR_SHA256)
    throw new Error(
      "M1 equipment requires the fixed Base_Female roundtrip identity",
    );
  const adapter = await createEquipment({
    vrm,
    avatarSha256,
    manifestUrl: "/assets/m1/equipment.json",
  });
  try {
    await Promise.all(Object.values(IDS).map((id) => adapter.load(id)));
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
  // These are exact duplicated clothing surfaces, not body coverage removal.
  sourceClothes.forEach(({ mesh }) => (mesh.visible = false));
  let outfit = 0,
    debugBody = false,
    disposed = false;
  const item = (role) => adapter.get(IDS[role]);
  const skirtCorrective = createM1Skirt({
    vrm,
    source: item("skirt").meshes[0],
    body,
  });
  function apply() {
    if (disposed) return;
    // All assets are already loaded. Visibility changes are synchronous and
    // cannot arrive later over a newer user request.
    item("shoes").container.visible = true;
    item("top").container.visible = !debugBody;
    item("pants").container.visible = !debugBody && outfit === 0;
    item("skirt").container.visible = !debugBody && outfit === 1;
  }
  apply();
  return {
    setOutfit(value) {
      outfit = Number(value) === 1 ? 1 : 0;
      apply();
    },
    setDebugBody(value) {
      debugBody = Boolean(value);
      apply();
    },
    update(dt, colliders = []) {
      if (!debugBody && outfit === 1) skirtCorrective.update(dt, colliders);
    },
    getInfo() {
      return {
        outfit,
        debugBody,
        avatarSha256,
        independentEquipment: true,
        sourceBodyUnchanged: true,
        skirtDynamics: skirtCorrective.getInfo(),
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
        pants: item("pants").meshes,
        skirt: [skirtCorrective.mesh],
        sourceSkirt: item("skirt").meshes,
        sourceClothes: sourceClothes.map((x) => x.mesh),
        skirtBones: item("skirt").meshes[0].skeleton.bones.filter((b) =>
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
      skirtCorrective.dispose();
      adapter.dispose();
      sourceClothes.forEach(({ mesh, visible }) => (mesh.visible = visible));
    },
  };
}
