// Body type is an asset/fit identity, not the streamer's gender or personality.
// Differences stay here; both candidates use the same movement controller.
export const FOUNDATION_PROFILES = {
  female: {
    bodyCoverage: { url: "/assets/body-coverage-risk-v1/female-top.json", sha256: "800d528d1b05f43e1230571ed57acb443d5ac9c3467775867b0635aca0b97b07" },
    handSurfaceContact: {"url": "/assets/hand-joint-contact-v1/female.json", "sha256": "09688e79fadaca6f58530da7a4cb52c4ad0b3d9b42de4233c6b0a5f682454453"},
    id: "beta-base-female-m1",
    url: "/assets/foundation/base-female-roundtrip.vrm",
    sha256: "027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95",
    manifestUrl: "/assets/m1/equipment.json",
    forearmCollision: { url: "/assets/forearm-collision-v2/female.json", sha256: "b2ef32aa1566b6ef4b2b3796649cd732602da9788898264fff15dcb7afd4103e" },
    source: "Base_Female / reconstructed Blender source",
    label: "M1A 女性候选",
    pantsLabel: "独立及膝裤",
    ids: { top: "m1-uniform-top", shoes: "m1-uniform-shoes", skirt: "m1-uniform-skirt-open-waist-v1", pants: "m1-training-pants" },
    // Measured only for the female generated 6 mm training-pants shell.
    seatLayerThickness: 0.006 / 0.61,
  },
  male: {
    id: "beta-base-male-m1b",
    url: "/assets/foundation/base-male-roundtrip.vrm",
    sha256: "62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff",
    manifestUrl: "/assets/m1b/equipment.json",
    forearmCollision: { url: "/assets/forearm-collision-v2/male.json", sha256: "f6ec1714c80e492bc129078e179d12c48a4f7e072e5d0249d52b4943b75fbf15" },
    source: "Base_Male / reconstructed Blender source",
    label: "M1B 男性候选",
    pantsLabel: "独立长裤",
    shortsLabel: "独立露膝短裤",
    ids: { top: "m1b-uniform-top", shoes: "m1b-uniform-shoes", pants: "m1b-uniform-pants", shorts: "m1b-uniform-shorts-v1" },
    // Candidate initial value only: actual upper surface/weights retained within
    // 1.195e-7; shorts still require their own posed seat/contact acceptance.
    outfitSeatLayerThickness: { 2: 0.0036 },
    outfitFitStatus: { 2: "candidate: retained seat geometry; shorts runtime validation pending" },
    // Original male trouser surface: no female-shell offset inherited.
    // Measured male seat surface response: +10 mm pelvis -> +8.289 mm trouser underside.
    // Original fit was -1.975 mm; 3.6 mm gives approximately +1 mm clearance.
    seatLayerThickness: 0.0036,
  },
};

// Bounded geometry-risk specimens; original candidates remain available.
FOUNDATION_PROFILES["m1a-jaw-v1"] = {
    handSurfaceContact: {"url": "/assets/hand-joint-contact-v1/jaw.json", "sha256": "3377854746d694992b3efb4a5fb3eb3d951d03d4abfe4609f89e53cf2adda12c"},
  "id": "m1a-jaw-v1",
  "url": "/assets/m1-variants/m1a-jaw-v1/avatar.vrm",
  "sha256": "3c11caaed49f6db514acb7678551352afdf1c2893ef92ca93b959a8d09691011",
  "forearmCollision": {"url": "/assets/m1-variants/forearm-collision-v2/m1a-jaw-v1.json", "sha256": "9717d0b384e7682cedcb0b276bcac933f91dc4d229cec2034a491c27bdbf754b"},
  "manifestUrl": "/assets/m1-variants/m1a-jaw-v1/equipment/equipment.json",
  "ids": {
    "top": "m1a-jaw-v1-uniform-top",
    "shoes": "m1a-jaw-v1-uniform-shoes",
    "skirt": "m1a-jaw-v1-uniform-skirt",
    "pants": "m1a-jaw-v1-training-pants"
  },
  "source": "Original Base_Female + local editable geometry specimen",
  "referenceBody": "female",
  "label": "下颌几何风险样件",
  "pantsLabel": "派生适配及膝裤",
  "seatLayerThickness": 0.01121,
  "fitStatus": "candidate: own 3c6e actual seat response 0.54815; recheck required"
};
FOUNDATION_PROFILES["m1a-waisthip-v1"] = {
    handSurfaceContact: {"url": "/assets/hand-joint-contact-v1/waisthip.json", "sha256": "07b62497d826e417476c1154224a44722b50f8c38694fff5c653d3c8c1486e0d"},
  "id": "m1a-waisthip-v1",
  "url": "/assets/m1-variants/m1a-waisthip-v1/avatar.vrm",
  "sha256": "10778174ece87e3e3a00ecaf5e0c98eef59cd7d762e9bb52daa50162ee1743b5",
  "forearmCollision": {"url": "/assets/m1-variants/forearm-collision-v2/m1a-waisthip-v1.json", "sha256": "3bc08e1e9d967a3a0f30099c32fec3900f2b4d99a32758b628a68d4e6a688d6b"},
  "manifestUrl": "/assets/m1-variants/m1a-waisthip-v1/equipment/equipment.json",
  "ids": {
    "top": "m1a-waisthip-v1-uniform-top",
    "shoes": "m1a-waisthip-v1-uniform-shoes",
    "skirt": "m1a-waisthip-v1-uniform-skirt",
    "pants": "m1a-waisthip-v1-training-pants"
  },
  "source": "Original Base_Female + local editable geometry specimen",
  "referenceBody": "female",
  "label": "腰臀几何风险样件",
  "pantsLabel": "派生适配及膝裤",
  "seatLayerThickness": 0.01105,
  "fitStatus": "candidate: own 3c6e actual seat response 0.53429; recheck required"
};

// BEGIN audited M2 male jaw specimen
FOUNDATION_PROFILES["m2-male-jaw-v1"] = {
  "id": "m2-male-jaw-v1",
  "referenceBody": "male",
  "label": "M2 男性下颌离散样件",
  "source": "Base_Male preserved editable source + one local jaw Basis edit",
  "url": "/assets/m2-male-face-v1/avatar.vrm",
  "sha256": "25ac8a8174110d7b0a6bb290ac8cab66ad6939ea522f80cdef62571d2ab24153",
  "manifestUrl": "/assets/m1b/m2-male-jaw-v1-equipment.json",
  "forearmCollision": {
    "url": "/assets/m2-male-face-v1/forearm-profile.json",
    "sha256": "dabfa98781d168746bb9a2696e61daba782d514d38f588025a32e6aa25626445"
  },
  "pantsLabel": "独立长裤",
  "shortsLabel": "独立露膝短裤",
  "ids": {
    "top": "m1b-uniform-top",
    "shoes": "m1b-uniform-shoes",
    "pants": "m1b-uniform-pants",
    "shorts": "m1b-uniform-shorts-v1"
  },
  "seatLayerThickness": 0.0036,
  "outfitSeatLayerThickness": {
    "2": 0.0036
  },
  "outfitFitStatus": {
    "0": "Body and original male trouser geometry/binds exact; candidate own readback pending",
    "2": "Body and original male shorts geometry/binds exact; candidate own readback pending"
  },
  "fitStatus": "Offline exact Body/bind equality only; expressions/seating/gear actual runtime pending; mic/glasses/normalized motion no automatic compatibility"
};
// END audited M2 male jaw specimen

export function foundationProfile(bodyType = "female") {
  const profile = FOUNDATION_PROFILES[bodyType];
  if (!profile) throw new Error(`Unknown foundation body type: ${bodyType}`);
  const result = structuredClone(profile);
  result.outfits = [
    { index: 0, role: "pants", label: result.pantsLabel },
    ...(result.ids.skirt ? [{ index: 1, role: "skirt", label: "独立裙装" }] : []),
    ...(result.ids.shorts ? [{ index: 2, role: "shorts", label: result.shortsLabel || "独立短裤" }] : []),
    ...(result.extraOutfits ?? []),
  ];
  if (result.outfits.some(item => !Number.isSafeInteger(item.index) || item.index < 0 || typeof item.role !== 'string') ||
      new Set(result.outfits.map(item => item.index)).size !== result.outfits.length ||
      new Set(result.outfits.map(item => item.role)).size !== result.outfits.length)
    throw Error(`Invalid or duplicate outfit identity for ${bodyType}`);
  return result;
}
