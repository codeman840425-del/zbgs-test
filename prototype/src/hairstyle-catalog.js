import presetPonytail from '../public/assets/m2-preset-ponytail-fits-v1/catalog.json' with {type:'json'};
import presetShortHair from '../public/assets/m2-preset-short-hair-fits-v1/catalog.json' with {type:'json'};
// Exact body + resource + fit admissions; no motion-controller branches.
export const HAIRSTYLES = [
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
  }
];
