// Body type is an asset/fit identity, not the streamer's gender or personality.
// Differences stay here; both candidates use the same movement controller.
export const FOUNDATION_PROFILES = {
  female: {
    id: "beta-base-female-m1",
    url: "/assets/foundation/base-female-roundtrip.vrm",
    sha256: "027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95",
    manifestUrl: "/assets/m1/equipment.json",
    forearmCollision: { url: "/assets/forearm-collision-v2/female.json", sha256: "b2ef32aa1566b6ef4b2b3796649cd732602da9788898264fff15dcb7afd4103e" },
    source: "Base_Female / reconstructed Blender source",
    label: "M1A 女性候选",
    pantsLabel: "独立及膝裤",
    ids: { top: "m1-uniform-top", shoes: "m1-uniform-shoes", skirt: "m1-uniform-skirt", pants: "m1-training-pants" },
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
  "id": "m1a-jaw-v1",
  "url": "/assets/m1-variants/m1a-jaw-v1/avatar.vrm",
  "sha256": "3c11caaed49f6db514acb7678551352afdf1c2893ef92ca93b959a8d09691011",
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
  "id": "m1a-waisthip-v1",
  "url": "/assets/m1-variants/m1a-waisthip-v1/avatar.vrm",
  "sha256": "10778174ece87e3e3a00ecaf5e0c98eef59cd7d762e9bb52daa50162ee1743b5",
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

export function foundationProfile(bodyType = "female") {
  const profile = FOUNDATION_PROFILES[bodyType];
  if (!profile) throw new Error(`Unknown foundation body type: ${bodyType}`);
  const result = structuredClone(profile);
  result.outfits = [
    { index: 0, role: "pants", label: result.pantsLabel },
    ...(result.ids.skirt ? [{ index: 1, role: "skirt", label: "独立裙装" }] : []),
    ...(result.ids.shorts ? [{ index: 2, role: "shorts", label: result.shortsLabel || "独立短裤" }] : []),
  ];
  return result;
}
