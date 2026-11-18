import {nativeProductionCatalog} from './native-production-catalog.js';
import sourceOutfits from './source-outfit-profiles.json' with {type:'json'};
import {REPRESENTATIVE_PROFILES} from './representative-batch.js';
import {appearanceColorSupport} from './appearance-color-policy.js';
import layerOutfits from '../public/assets/m2-vest-layer-fit-v1/profiles.json' with {type:'json'};

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
    additionalEquipmentManifests: [{url:'/assets/garment-basecolor-release-v1/female/equipment.json',sha256:'8a9c814ec42f968982940952423d62d29ae411c1ac9db39eafe6610ddb5f6dc7'}],
    additionalBodyCoverage: [{role:'topFar',descriptor:{url:'/assets/garment-basecolor-release-v1/female/body-coverage.json',sha256:'fab2830ae2a47d79f19a265bdec60431b6fbc5f67916004215651e355a147c36'}}],
    forearmCollision: { url: "/assets/forearm-collision-v2/female.json", sha256: "b2ef32aa1566b6ef4b2b3796649cd732602da9788898264fff15dcb7afd4103e" },
    source: "Base_Female / reconstructed Blender source",
    label: "M1A 女性候选",
    pantsLabel: "独立及膝裤",
    ids: { top: "m1-uniform-top", topFar: "m1-female-uniform-top-1k-v1", shoes: "m1-uniform-shoes", skirt: "m1-uniform-skirt-open-waist-v1", pants: "m1-training-pants", socks: "female-plain-crew-socks-v1" },
    extraOutfits: [
      { index: 3, role: 'pants-socks', bottomRole: 'pants', equipmentRoles: ['top','shoes','pants','socks'], label: '及膝裤＋独立薄袜', description: '技术候选：原身体长袜贴图仍保留，检查独立袜层与鞋口' },
      { index: 5, role: 'pants-top-far', bottomRole:'pants', equipmentRoles:['topFar','shoes','pants'], label:'1K 上衣、及膝裤和平底鞋' },
    ],
    // Measured only for the female generated 6 mm training-pants shell.
    seatLayerThickness: 0.006 / 0.61,
  },
  male: {
    garmentCoverage: { url: "/assets/m2-garment-coverage-v1/coverage-mask.json", sha256: "9da63589879a129aacddded37d9dfcc60d7f32364a394c316737c9999f65bfc6" },
    id: "beta-base-male-m1b",
    url: "/assets/foundation/base-male-roundtrip.vrm",
    sha256: "62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff",
    manifestUrl: "/assets/m1b/equipment.json",
    forearmCollision: { url: "/assets/forearm-collision-v2/male.json", sha256: "f6ec1714c80e492bc129078e179d12c48a4f7e072e5d0249d52b4943b75fbf15" },
    source: "Base_Male / reconstructed Blender source",
    label: "M1B 男性候选",
    pantsLabel: "独立长裤",
    shortsLabel: "独立露膝短裤",
    ids: { top: "m1b-uniform-top", shoes: "m1b-uniform-shoes", pants: "m1b-uniform-pants", shorts: "m1b-uniform-shorts-v1", outer: "m2-male-open-vest-panels-v2", onePiece: "m2-male-training-onepiece-v1", socks: "male-plain-crew-socks-v1" },
    extraOutfits: [
      { index: 3, role: 'outer-pants', bottomRole: 'pants', equipmentRoles: ['top','shoes','pants','outer'], label: '开襟马甲＋长裤', description: '候选：观察叠穿与动作' },
      { index: 4, role: 'outer-shorts', bottomRole: 'shorts', equipmentRoles: ['top','shoes','shorts','outer'], label: '开襟马甲＋短裤', description: '候选：观察叠穿与动作' },
      { index: 5, role: 'onePiece', bottomRole: 'onePiece', equipmentRoles: ['shoes','onePiece'], label: '短袖连体练功服', description: '技术候选：检查连体换装与接触' },
      { index: 6, role: 'shorts-socks', bottomRole: 'shorts', equipmentRoles: ['top','shoes','shorts','socks'], label: '露膝短裤＋独立薄袜', description: '技术候选：检查袜口与鞋口' },
      { index: 7, role: 'pants-socks', bottomRole: 'pants', equipmentRoles: ['top','shoes','pants','socks'], label: '长裤＋独立薄袜', description: '技术候选：检查裤口与袜层覆盖' },
    ],
    // Candidate initial value only: actual upper surface/weights retained within
    // 1.195e-7; shorts still require their own posed seat/contact acceptance.
    // onePiece 80e actual posed surface: zero extra lift leaves 4.41mm clearance;
    // +10mm lift widens it to 11.84mm. Do not inherit trouser compensation.
    outfitSeatLayerThickness: { 2: 0.0036, 5: 0, 6: 0.0036, 7: 0.0036 },
    outfitFitStatus: { 2: "candidate: retained seat geometry; shorts runtime validation pending", 5: "80e actual seated garment gap 4.41mm at zero lift; continuous runtime review pending" },
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

// Real segment-proportion specimen: original controller, measured derived fits.
FOUNDATION_PROFILES['m2-male-lower-leg-v1'] = {
  id: 'm2-male-lower-leg-v1', referenceBody: 'male',
  label: 'M2 男性小腿比例样件',
  source: 'Base_Male + both shin segments 20 mm; source/rest equivalence evidence retained',
  url: '/assets/m2-lower-leg-proportion-v1/avatar.vrm',
  sha256: '968a9d997683cd99de4eea8f77965184eea6d7bc639a6ae062085928325189d8',
  // Exact min of the derived rest shoe surface. Place this model origin on
  // the game floor before sampling motion; do not bend the knees to absorb it.
  sourceFloorY: -0.01944977603852749,
  manifestUrl: '/assets/m2-lower-leg-proportion-v1/equipment.json',
  forearmCollision: {
    url: '/assets/m2-lower-leg-proportion-v1/forearm-profile.json',
    sha256: '151537eabc65a643c775cc9d2fdc4e0d59a9b279686df32ac82d54a2bf09131b',
  },
  pantsLabel: '比例适配露膝短裤',
  ids: {top:'male-lower-leg-plus20-v1-top',shoes:'male-lower-leg-plus20-v1-shoes',pants:'male-lower-leg-plus20-v1-bottom'},
  seatLayerThickness: 0,
  fitStatus: 'Candidate: actual derived-body floor and seated contact must be measured; no inherited 3.6 mm original trouser compensation',
};

Object.assign(FOUNDATION_PROFILES,REPRESENTATIVE_PROFILES);

for (const [bodyType, profile] of Object.entries(sourceOutfits)) {
  if (Object.hasOwn(FOUNDATION_PROFILES, bodyType) || bodyType !== profile.id)
    throw Error('Conflicting source outfit body registration: ' + bodyType);
  FOUNDATION_PROFILES[bodyType] = profile;
}

// Explicit technical candidate. Not listed by the normal appearance menu.
// Own source geometry/skin/binds; no old-body accessory or contact fits inherited.
FOUNDATION_PROFILES['native-female-843ac-v1'] = {
  id:'native-vroid-unmasked-female-130-v1',
  label:'原生女性 · 完整皮肤接入验证',
  source:'VRoid 2.16 editable sources + pinned native Body PNG combination',
  url:'/assets/native-factory-v1/native-vroid-unmasked-base-v1/generated/female-native-unmasked-130-v1.vrm',
  sha256:'843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef',
  manifestUrl:'/assets/native-factory-v1/native-vroid-factory-fit-v1/equipment.json',
  additionalEquipmentManifests:[{url:'/assets/native-factory-v1/sleeve56-runtime-equipment.json',sha256:'5e2612e32e7891ef6353aa80112c5e3200a0e10e08049e8e32652d4734e919b9'}],
  sourceFloorY:-8.449510756143027e-7,
  baseBodyDisplay:'source-with-hair',
  previewAppearanceSupport:appearanceColorSupport('843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef'),
  bodyTextureCoverage:{url:'/assets/native-factory-v1/native-vroid-body-texture-fit-v1/manifest.json',sha256:'003e98086ed67b6fcd5c57e0b3b13e9c4a4beff412b3b74683e7cefc049c8fb2'},
  ids:{top:'native-unmasked-843ac-top-v1',shorts:'native-unmasked-843ac-shorts-v1',shoes:'native-unmasked-843ac-shoes-v1',alternateTop:'native-unmasked-843ac-sleeve56-top-v1'},
  defaultOutfit:{index:0,role:'shorts',bottomRole:'shorts',label:'原生上衣／短裤／鞋',equipmentRoles:['top','shorts','shoes']},
  extraOutfits:[{index:3,role:'shorts-sleeve56',bottomRole:'shorts',label:'改袖上衣＋同一短裤',description:'原生袖长 66→56 的制作样件；复用人物控制器',equipmentRoles:['alternateTop','shorts','shoes']}],
  seatLayerThickness:0,
  fitStatus:'Technical candidate; own runtime/contact validation pending; no accessory, recolor or geometry-edit admission inherited',
};

export function foundationProfile(bodyType = "female") {
  const profile = FOUNDATION_PROFILES[bodyType];
  if (!profile) throw new Error(`Unknown foundation body type: ${bodyType}`);
  const result = structuredClone(profile);
  if(layerOutfits.schema!=='vest-layer-outfits-v1')throw Error('Unknown layer outfit registry');
  const layer=layerOutfits.profiles[bodyType];
  if(layer){
    if(layer.bodySha256!==result.sha256||layer.bottomId!==result.ids.pants||layer.sourceManifestUrl!==result.manifestUrl||result.ids.fitTop)
      throw Error('Layer outfit requires its exact body, original catalog and lower garment');
    result.ids.fitTop=layer.topId;
    result.additionalEquipmentManifests=[layer.manifest,...(result.additionalEquipmentManifests??[])];
    result.additionalBodyCoverage=[{role:'fitTop',descriptor:layer.bodyCoverage},...(result.additionalBodyCoverage??[])];
    result.extraOutfits=[...(result.extraOutfits??[]),layer.outfit].sort((a,b)=>a.index-b.index);
  }
  const initialLook = {
    ...(result.defaultOutfit ?? { index: 0, role: "pants" }),
    label: result.defaultOutfit?.label ?? result.pantsLabel ?? "基础服装",
  };
  if (initialLook.index !== 0) throw Error(`Initial outfit must use index 0 for ${bodyType}`);
  result.outfits = [
    initialLook,
    ...(result.ids.skirt && initialLook.role !== 'skirt' ? [{ index: 1, role: "skirt", label: "独立裙装" }] : []),
    ...(result.ids.shorts && initialLook.role !== 'shorts' ? [{ index: 2, role: "shorts", label: result.shortsLabel || "独立短裤" }] : []),
    ...(result.extraOutfits ?? []),
  ];
  if (result.outfits.some(item => !Number.isSafeInteger(item.index) || item.index < 0 || typeof item.role !== 'string') ||
      new Set(result.outfits.map(item => item.index)).size !== result.outfits.length ||
      new Set(result.outfits.map(item => item.role)).size !== result.outfits.length)
    throw Error(`Invalid or duplicate outfit identity for ${bodyType}`);
  return result;
}

// Exact native male source candidate. No legacy body/gear/contact fits inherited.
FOUNDATION_PROFILES['native-male-7586-v1'] = {
  id:'native-vroid-unmasked-male-79-v1',
  label:'原生男性 · 完整皮肤接入验证',
  source:'VRoid 2.16 original male editable source + exact native Tops-removed Body PNG',
  url:'/assets/native-male-factory-v1/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm',
  sha256:'7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81',
  manifestUrl:'/assets/native-male-factory-v1/native-vroid-male-equipment-v1/generated/equipment.json',
  additionalEquipmentManifests:[{url:'/assets/native-crew-template-v1/equipment.json',sha256:'d27b63d8090a16ebbf2f054dce4dff7bd35e967fa45723c74bffae92ebb12b98'}],
  sourceFloorY:-1.1503509525979781e-6,
  baseBodyDisplay:'source-with-hair',
  previewAppearanceSupport:appearanceColorSupport('7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81'),
  bodyTextureCoverage:{url:'/assets/native-male-factory-v1/native-vroid-male-body-texture-fit-v1/generated/manifest.json',sha256:'c432a7cdd1f6f5e5af4bf07b79465b902f26c09b00f39254f206c2df24617143'},
  ids:{top:'native-unmasked-7586-top-v1',shorts:'native-unmasked-7586-shorts-v1',shoes:'native-unmasked-7586-shoes-v1',socks:'native-7586-template-plain-crew-socks-v1'},
  defaultOutfit:{index:0,role:'shorts',bottomRole:'shorts',label:'原生上衣／短裤／鞋',equipmentRoles:['top','shorts','shoes']},
  extraOutfits:[{index:1,role:'shorts-socks',bottomRole:'shorts',label:'原生短裤＋中筒袜（鞋侧穿出）',description:'诊断样件：部分袜面在鞋侧可见。',equipmentRoles:['top','shorts','shoes','socks']}],
  seatLayerThickness:0,
  fitStatus:'Technical candidate: own source/bind CPU verified; same-room contact, appearance and persistence pending',
};

FOUNDATION_PROFILES['native-female-face-v1'] = {
  id:'native-vroid-face-geometry-unmasked-v1',
  label:'原生女性 Face 派生 · 皮肤接缝',
  source:'VRoid native face-derived source with exact body mask and three independent equipment resources',
  url:'/assets/native-face-factory-v2/generated/female-geometry-face-unmasked.vrm',
  sha256:'cc0843b8781e5897fdfce144d7d2d872f33f455b568a9d62165ad9b3a0ac00ce',
  manifestUrl:'/assets/native-face-factory-v2/equipment.json',
  sourceFloorY:-8.449510756150829e-7,
  sourceRawFloorY:-7.442453409112204e-8,
  baseBodyDisplay:'source-with-hair',
  previewAppearanceSupport:appearanceColorSupport('cc0843b8781e5897fdfce144d7d2d872f33f455b568a9d62165ad9b3a0ac00ce'),
  bodyTextureCoverage:{url:'/assets/native-face-factory-v2/manifest.json',sha256:'9fed8d43beef7149650d84dd6455bfae0a83029bb4a82899118ac93abd56d6a5'},
  ids:{top:'native-vroid-face-geometry-top-v1',shorts:'native-vroid-face-geometry-shorts-v1',shoes:'native-vroid-face-geometry-shoes-v1'},
  defaultOutfit:{index:0,role:'shorts',bottomRole:'shorts',label:'原生上衣／短裤／鞋',equipmentRoles:['top','shorts','shoes']},
  seatLayerThickness:0,
  fitStatus:'CPU source/body mask and equipment identity only; runtime, expression, contact and visual validation pending',
};

FOUNDATION_PROFILES['native-female-waist-v1'] = {
  id:'native-vroid-waist-geometry-unmasked-v1',
  label:'原生女性 · 腰部局部改形',
  source:'VRoid authored WaistScaleMag derivative; its own body, garment auxiliary bones and bind matrices',
  url:'/assets/native-waist-factory-v1/generated/female-geometry-waist-unmasked.vrm',
  sha256:'cf1574b243b3eb1d5803928598f62809c30938bde67154d3956d346f39fa1ed5',
  manifestUrl:'/assets/native-waist-factory-v1/equipment.json',
  sourceFloorY:-8.449510756150829e-7,
  sourceRawFloorY:-7.442453409112204e-8,
  baseBodyDisplay:'source-with-hair',
  previewAppearanceSupport:appearanceColorSupport('cf1574b243b3eb1d5803928598f62809c30938bde67154d3956d346f39fa1ed5'),
  bodyTextureCoverage:{url:'/assets/native-waist-factory-v1/manifest.json',sha256:'46a868ddc366a4f64de1154cbea3f70478b3f8406ceddb5a79d2b174ef373d5e'},
  ids:{top:'native-vroid-waist-geometry-top-v1',shorts:'native-vroid-waist-geometry-shorts-v1',shoes:'native-vroid-waist-geometry-shoes-v1'},
  defaultOutfit:{index:0,role:'shorts',bottomRole:'shorts',label:'腰部改形适配 · 原生上衣／短裤／鞋',equipmentRoles:['top','shorts','shoes']},
  seatLayerThickness:0,
  fitStatus:'Same-source Waist fit, body mask and runtime rest floor measured; gameplay contact and visuals pending',
};

// Data-only native imports retain the same factory, equipment and actor interfaces.
Object.assign(FOUNDATION_PROFILES, nativeProductionCatalog(FOUNDATION_PROFILES).profiles);
