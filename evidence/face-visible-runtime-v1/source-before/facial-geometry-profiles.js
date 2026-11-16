// Asset admission data only. A bounded endpoint does not admit its interior range.
const originalMouth={baseURL:'/assets/face-parameters-v1/',range:[-.04,.04],supportedValues:null,preciseNormals:false,verifySourceIdentity:false};
export const FACIAL_GEOMETRY_PROFILES=Object.freeze({
  '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95':{
    mouth:originalMouth,brow:true,nose:true,eye:true,
  },
  '62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff':{
    mouth:originalMouth,brow:true,nose:true,eye:true,
  },
  '25ac8a8174110d7b0a6bb290ac8cab66ad6939ea522f80cdef62571d2ab24153':{
    mouth:{baseURL:'/assets/m2-male-jaw-mouth-v1/',range:[0,.04],supportedValues:[0,.04],
      recipeSha256:'e953cb663484bbf999064110e21b86c43e73db20cb7de2a49a1138a03a2c51d1',preciseNormals:true,verifySourceIdentity:true},
    brow:false,nose:false,eye:false,
  },
});
