import revisedShortHair from '../public/assets/m2-preset-short-hair-fits-v2/catalog.json' with {type:'json'};
import revisedPonytail from '../public/assets/m2-preset-ponytail-fits-v2/catalog.json' with {type:'json'};
import presetPonytail from '../public/assets/m2-preset-ponytail-fits-v1/catalog.json' with {type:'json'};
import presetShortHair from '../public/assets/m2-preset-short-hair-fits-v1/catalog.json' with {type:'json'};
import regionColorways from '../public/assets/m2-hair-region-v1/catalog.json' with {type:'json'};
import {fittedHeadHairstyles} from './fitted-head-appearance.js';
// Exact body + resource + fit admissions; no motion-controller branches.
export const HAIRSTYLES = [
  {
    id:'native-male-hairset001-v1',label:'原生长直发 · 独立动态验证',
    manifestUrl:'/assets/native-hairset001-v1/manifest.json',
    manifestSha256:'7e74eebe4d634eae8b2455715899d53e4ba25a677fc0f3de8841a1a4c5766046',
    assetSha256:'cfa965e68d4f11ca1a93096edb43f5b7657862f10c40b9d88f5b0fd404ae5a02',
    sourceBodySha256:'dab423674f42d3e6e79eb1b8aa1375e5b664e11bf130d093c14f78c5d3967238',
    sourceMaterials:['N00_000_00_HairBack_00_HAIR (Instance)','N00_000_Hair_00_HAIR (Instance)'],
    compatibleBodies:['7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81'],
    legacyImplicitFit:false,
    fit:{id:'native-male-hairset001-7586-fit-v1',version:1,url:'/assets/native-hairset001-v1/fit.json',
      sha256:'c4b5f72aca522712256578cc30928ee80453945728e84e50411bed9954b0fb79'},
  },
  ...revisedShortHair,
  ...revisedPonytail,
  ...presetShortHair,
  ...presetPonytail,
{
  "id": "female-ponytail-headref-v3",
  "label": "长束发 · 头部参考对照候选",
  "manifestUrl": "/assets/m2-long-hair-raw-head-reference-v3/manifest.json",
  "manifestSha256": "376db50c730eab95767a7cfacefad740a56e31ca59949bbb0a7dceb055f633de",
  "assetSha256": "1b785f9d54107818cee39eda2de7263ad0720ce90968fbaa7cc32c2465e3c385",
  "sourceMaterial": "F00_000_HairBack_00_HAIR",
  "compatibleBodies": [
    "027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95"
  ],
  "sourceBodySha256": "027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95",
  "legacyImplicitFit": false,
  "fit": {
    "id": "female-ponytail-headref-v3-fit",
    "version": 3,
    "url": "/assets/m2-long-hair-raw-head-reference-v3/fit.json",
    "sha256": "03f5a0595ff95002f55487ad3db15aac8e93068aa7a4fe41e73d1138cc8a7afe"
  }
},
  {
    id:'female-ponytail-v1', label:'长束发 · 动态制作候选',
    manifestUrl:'/assets/m2-long-hair-rootjoin-v2/manifest.json',
    manifestSha256:'28337f44c1d297f2657b8ca32466e0c3b9e0cfceb17c39bda019fc19bfb48b9d',
    assetSha256:'1b785f9d54107818cee39eda2de7263ad0720ce90968fbaa7cc32c2465e3c385',
    sourceMaterial:'F00_000_HairBack_00_HAIR',
    compatibleBodies:['027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'],
    sourceBodySha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95',
    legacyImplicitFit:false,
    fit:{id:'female-ponytail-v1-rootjoin-fit-v2',version:2,url:'/assets/m2-long-hair-rootjoin-v2/fit.json',
      sha256:'5e6d7499852ffc6198e6c7190a50cf5b55abd51f535c038044201b1cd9ada04f'},
  },
  {
    "id": "female-bob-v1",
    "label": "齐颈侧后短发",
    "manifestUrl": "/assets/m2-hairstyle-v1/manifest.json",
    "manifestSha256": "98bc1b0874658a22f696834eb622e03aff92f499d41943d285c825a4fe7ee908",
    "assetSha256": "3dcf01957d8ab72dfc128c6950f0e9600c2c7b801ea774a612058dc4b5d68110",
    "sourceMaterial": "F00_000_HairBack_00_HAIR",
    "compatibleBodies": [
      "027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95"
    ],
    "legacyImplicitFit": true
  },
  {
    "id": "male-sidepart-v1",
    "label": "偏侧蓬松短发",
    "manifestUrl": "/assets/m2-male-hairstyle-v1/manifest.json",
    "manifestSha256": "d7bcf95056cb58650887bc941df384c7f6342042743b310e417fdc7a0a941b73",
    "assetSha256": "fb5fd49352b7bab0e6d2c0ec3f6e565f0004062e4a8975f1afcd93fb24dd48fd",
    "sourceMaterial": "M00_000_HairBack_00_HAIR",
    "compatibleBodies": [
      "62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff"
    ],
    "legacyImplicitFit": true
  },
  {
    "id": "male-sidepart-v1",
    "label": "偏侧蓬松短发",
    "manifestUrl": "/assets/m2-male-jaw-hair-fit-v1/manifest.json",
    "manifestSha256": "1db5dd6a73d662f0b1e90eb508d1226c626405045cbf02caa7e3a21d373036e9",
    "assetSha256": "fb5fd49352b7bab0e6d2c0ec3f6e565f0004062e4a8975f1afcd93fb24dd48fd",
    "sourceMaterial": "M00_000_HairBack_00_HAIR",
    "compatibleBodies": [
      "25ac8a8174110d7b0a6bb290ac8cab66ad6939ea522f80cdef62571d2ab24153"
    ],
    "legacyImplicitFit": false,
    "fit": {
      "id": "male-sidepart-jaw-fit-v1",
      "version": 1,
      "url": "/assets/m2-male-jaw-hair-fit-v1/fit.json",
      "sha256": "004f7b3bdb0b72d85849b13a05c9b4448a060a7a0d2660ebdeb25bd9f5311ad4"
    },
    "sourceBodySha256": "62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff"
  },
  ...fittedHeadHairstyles,
  ...regionColorways,
];
