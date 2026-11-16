import {FACIAL_GEOMETRY_PROFILES} from './facial-geometry-profiles.js';
import {LEGACY_FACE_SOURCES,VISIBLE_FACE_SOURCES,mouthValueSupported,faceSampleSupported} from './facial-geometry-contract.js';

export function appearanceAdmissionError(field,code,reason){
  return Object.assign(Error(reason),{field,code});
}

export function facialGeometryCapability(avatarSha256,{legacy=false}={}){
  const profile=FACIAL_GEOMETRY_PROFILES[avatarSha256];
  const capability={available:!!profile?.mouth,mouthRange:profile?.mouth?.range??null,
    mouthSupportedValues:profile?.mouth?.supportedValues??null,
    mouthEndpointValues:legacy?[]:(profile?.mouth?.visible?.supportedValues??[]).filter(value=>value<profile.mouth.range[0]||value>profile.mouth.range[1])};
  for(const domain of ['brow','nose','eye']){
    capability[domain+'Available']=!!profile?.[domain];
    capability[domain+'Samples']=['none'];
    if(profile?.[domain]){
      capability[domain+'Samples'].push(LEGACY_FACE_SOURCES[domain].sampleId);
      if(!legacy&&profile.visibleSex)capability[domain+'Samples'].push(VISIBLE_FACE_SOURCES[domain].sampleId);
    }
  }
  return structuredClone(capability);
}

export function facialSampleResource(avatarSha256,domain,sample){
  if(sample==='none')return null;
  const profile=FACIAL_GEOMETRY_PROFILES[avatarSha256];
  if(!profile?.[domain])return null;
  const original=LEGACY_FACE_SOURCES[domain],visible=VISIBLE_FACE_SOURCES[domain];
  const source=sample===original.sampleId?original:sample===visible.sampleId?visible:null;
  if(!source)return null;
  const isVisible=source===visible;
  return{sampleId:sample,baseURL:'/assets/'+source.directory+'/',endpoint:source.endpoint,
    unit:original.unit,recipeSha256:source.recipes[profile.visibleSex],visible:isVisible,
    mouthRecipeSha256:isVisible?profile.mouth.visible.recipeSha256:profile.mouth.recipeSha256};
}

// Pure identity resolution. It performs no loading, geometry work or revision
// changes. Runtime preparation separately verifies fetched bytes and topology.
export function resolveFacialGeometrySelection(avatarSha256,input,{legacy=false,requireIdentities=false}={}){
  const capability=facialGeometryCapability(avatarSha256,{legacy});
  const value=input.mouthWidth,profile=FACIAL_GEOMETRY_PROFILES[avatarSha256];
  if(!mouthValueSupported(capability,value))throw appearanceAdmissionError('geometry.mouthWidth','unsupported-value','嘴宽参数不在该版本已制作范围内');
  const useVisible=profile?.mouth?.visible&&!mouthValueSupported({...capability,mouthEndpointValues:[]},value);
  const mouthSource=profile?.mouth?(useVisible?profile.mouth.visible:profile.mouth):null;
  const resources={mouth:value!==0?{baseURL:mouthSource.baseURL,recipeSha256:mouthSource.recipeSha256,visible:!!useVisible}:null};
  for(const domain of ['brow','nose','eye']){
    const sample=input[domain+'Sample'];
    if(!faceSampleSupported(capability,domain,sample))throw appearanceAdmissionError('geometry.'+domain+'Sample','unsupported-sample','五官样件未适配当前人物或配方版本');
    resources[domain]=facialSampleResource(avatarSha256,domain,sample);
  }
  for(const [domain,key] of [['mouth','recipeSha256'],['brow','browRecipeSha256'],['nose','noseRecipeSha256'],['eye','eyeRecipeSha256']]){
    const expected=resources[domain]?.recipeSha256??null,provided=input[key];
    if((requireIdentities||provided!=null)&&provided!==expected)
      throw appearanceAdmissionError('geometry.'+key,'resource-identity-mismatch','保存配方的五官资源版本不匹配');
  }
  return structuredClone({resources,mouthSource:mouthSource?{baseURL:mouthSource.baseURL,recipeSha256:mouthSource.recipeSha256,visible:!!useVisible}:null});
}

export function queryFacialGeometry(avatarSha256){
  const capability=facialGeometryCapability(avatarSha256),profile=FACIAL_GEOMETRY_PROFILES[avatarSha256];
  const mouth=profile?.mouth;
  const result={mouthWidth:{default:0,unit:'ratio',axis:'glTF mesh-local X',
    continuousRange:mouth&&!mouth.supportedValues?mouth.range:null,
    discreteValues:mouth?.supportedValues??(mouth?.visible?.supportedValues??[0]),
    resources:mouth?[{baseURL:mouth.baseURL,recipeSha256:mouth.recipeSha256,continuousRange:mouth.supportedValues?null:mouth.range,supportedValues:mouth.supportedValues},
      ...(mouth.visible?[{baseURL:mouth.visible.baseURL,recipeSha256:mouth.visible.recipeSha256,continuousRange:null,supportedValues:mouth.visible.supportedValues}]:[])]:[]}};
  for(const domain of ['brow','nose','eye'])result[domain+'Sample']={default:'none',
    choices:capability[domain+'Samples'].map(value=>({value,resource:facialSampleResource(avatarSha256,domain,value)}))};
  result.constraints=['mouthWidth is a weighted width multiplier delta; endpoints do not admit their interior interval',
    'brow samples couple authored height and spacing; eye samples use an authored aperture width ratio',
    'geometry and expressions are checked during preparation; attachment and garment fit are limited to existing registered assets'];
  return structuredClone(result);
}
