import {canonicalJson, sha256Hex} from './character-record.js';
import sourceProfiles from './source-outfit-profiles.json' with {type:'json'};
import sourceEquipment from '../public/assets/cc0-body-release-v1/equipment.json' with {type:'json'};

const templateSha='b16bcf65656083085032d534bab3285bf401608905b784e86fff4eaa79978ad7';
const templatePath='assets-source/rule-body-recipe-v1/template.json';
const parent=sourceProfiles['source-male-cc0-texture-release-v1'];
const sourceBodySha='2e66ee6c88524bca3f61b834672e89d3146f9f41859811d2159a01c0edf10617';
const roleToParent={top:'topFar',pants:'pants',shoes:'shoes'};
const roles=Object.keys(roleToParent);
const clothing=roles.map(role=>sourceEquipment.items.find(item=>item.id===parent.ids[roleToParent[role]]));
const hashPattern=/^[a-f0-9]{64}$/;
const bodyPattern=/^rule-body-[a-f0-9]{20}$/;
const text=new TextDecoder('utf-8',{fatal:true});

function requireData(value, message) {
  if (!value) throw Error('Invalid rule body data: '+message);
}
function keysOf(value,names) {
  return value!==null && typeof value==='object' && !Array.isArray(value) &&
    Object.keys(value).length===names.length && names.every(name=>Object.hasOwn(value,name));
}
function same(left,right) { return canonicalJson(left)===canonicalJson(right); }
function isHash(value) { return typeof value==='string' && hashPattern.test(value); }
function freezeJson(value) {
  if (value && typeof value==='object') {
    Object.values(value).forEach(freezeJson);
    Object.freeze(value);
  }
  return value;
}
function validPin(pin,location,limit) {
  return keysOf(pin,[location,'sha256','bytes']) && isHash(pin.sha256) &&
    Number.isSafeInteger(pin.bytes) && pin.bytes>0 && pin.bytes<=limit;
}
function checkPointer(ptr) {
  requireData(keysOf(ptr,['bodyType','url','sha256','bytes']) && typeof ptr.bodyType==='string' && bodyPattern.test(ptr.bodyType) &&
    ptr.url==='/character-data/'+ptr.bodyType+'/index.json' && isHash(ptr.sha256) &&
    Number.isSafeInteger(ptr.bytes) && ptr.bytes>0 && ptr.bytes<=65536,'published index pointer');
}
export function validateRuleBodyPointers(descriptors) {
  requireData(Array.isArray(descriptors) && descriptors.length<=4,'published index list');
  descriptors.forEach(checkPointer);
  requireData(new Set(descriptors.map(row=>row.bodyType)).size===descriptors.length,'duplicate body pointer');
}

async function browserBytes(url,expectedBytes,signal) {
  const response=await fetch(url,{redirect:'error',credentials:'same-origin',signal});
  requireData(response.ok,'HTTP '+response.status+' '+url);
  const reader=response.body.getReader(), data=new Uint8Array(expectedBytes);
  let offset=0;
  try {
    while (true) {
      const {done,value}=await reader.read();
      if (done) break;
      if (offset+value.byteLength>expectedBytes) {
        await reader.cancel();
        throw Error('Oversize rule body resource '+url);
      }
      data.set(value,offset); offset+=value.byteLength;
    }
  } finally { reader.releaseLock(); }
  requireData(offset===expectedBytes,'truncated resource '+url);
  return data;
}

// Stage and authenticate each package before exposing any profile. The producer
// independently reconstructs geometry and fit; the game consumes its published pins.
async function readPack(ptr,read) {
  const id=ptr.bodyType, dir='/character-data/'+id+'/', assets='assets/'+id+'/';
  const rawIndex=await read(ptr.url,ptr);
  const index=JSON.parse(text.decode(rawIndex));
  requireData(keysOf(index,['schema','bodyType','templateSha256','sourceBodySha256','recipeSha256','profile','recipe','fit','files']) &&
    index.schema==='shape-data-pack-v1' && index.bodyType===id && index.templateSha256===templateSha &&
    index.sourceBodySha256===sourceBodySha && parent.sha256===sourceBodySha && isHash(index.recipeSha256),'index identity');
  const names=['profile.json','recipe.json','fit.json',assets+'body.vrm',assets+'equipment.json',...clothing.map(item=>item.url.slice(1))];
  requireData(Array.isArray(index.files) && index.files.length===names.length,'payload count');
  const pins=new Map();
  for (const row of index.files) {
    requireData(validPin(row,'path',row?.path===assets+'body.vrm'?32*1024*1024:1024*1024) &&
      names.includes(row.path) && !pins.has(row.path),'payload path or size');
    pins.set(row.path,row);
  }
  for (const key of ['profile','recipe','fit'])
    requireData(same(index[key],pins.get(key+'.json')),'metadata pin '+key);
  for (const item of clothing) {
    const pin=pins.get(item.url.slice(1));
    requireData(pin.sha256===item.sha256 && pin.bytes===item.bytes,'uniform asset '+item.id);
  }
  const model=pins.get(assets+'body.vrm'), catalog=pins.get(assets+'equipment.json');
  requireData(id==='rule-body-'+model.sha256.slice(0,20),'content-addressed body type');
  const [recipeBytes,profileBytes,fitBytes,catalogBytes]=await Promise.all([
    read(dir+'recipe.json',index.recipe),read(dir+'profile.json',index.profile),read(dir+'fit.json',index.fit),
    read('/'+catalog.path,catalog),
  ]);
  const source=text.decode(recipeBytes), recipe=JSON.parse(source);
  requireData(keysOf(recipe,['schema','template','weight']) && recipe.schema==='shape-endpoint-body-recipe-v1' &&
    same(recipe.template,{path:templatePath,sha256:templateSha}) && Number.isFinite(recipe.weight) &&
    recipe.weight>=0 && recipe.weight<=1,'recipe');
  // The Python producer preserves its JSON number spelling (e.g. 1.0, 1e-05)
  // in the compact recipe digest and in the label. JS JSON numbers lose it.
  const numbers=[...source.matchAll(/"weight"\s*:\s*(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)(?=\s*[,}])/g)];
  requireData(numbers.length===1 && Number(numbers[0][1])===recipe.weight,'recipe weight spelling');
  const spelling=numbers[0][1];
  const canonical=canonicalJson({...recipe,weight:null}).replace('"weight":null','"weight":'+spelling);
  requireData(await sha256Hex(canonical)===index.recipeSha256,'recipe digest');
  const ids=Object.fromEntries(roles.map(role=>[role,id+'-'+role]));
  const label='规则男体 · 下颌 · '+spelling;
  const profile=JSON.parse(text.decode(profileBytes));
  const expected={
    embeddedClothing:parent.embeddedClothing,baseBodyDisplay:parent.baseBodyDisplay,sourceFloorY:parent.sourceFloorY,
    seatLayerThickness:parent.seatLayerThickness,workbenchGroup:parent.workbenchGroup,
    id,label,workbenchLabel:label,source:parent.source,ids,url:'/'+model.path,sha256:model.sha256,
    manifestUrl:'/'+catalog.path,manifestSha256:catalog.sha256,
    defaultOutfit:{index:0,role:'pants',bottomRole:'pants',equipmentRoles:['top','shoes','pants'],label:'1K 制服上衣、长裤与平底鞋'},
    fitStatus:'静止几何、蒙皮及鞋底已检查。动作与正式准入见该身体的验收记录。',
  };
  requireData(same(profile,expected),'profile differs from the supported outfit');
  const items=clothing.map((item,i)=>({...item,id:ids[roles[i]],fitId:ids[roles[i]]+'-fit',compatibleAvatarSha256:model.sha256}));
  requireData(same(JSON.parse(text.decode(catalogBytes)),{schema:'zbgs-equipment-v1',items}),'equipment bindings');
  const fit=JSON.parse(text.decode(fitBytes));
  requireData(keysOf(fit,['schema','bodyType','bodySha256','recipeSha256','templateSha256','sourceBodySha256',
    'manifestSha256','affectedTriangles','equipment','inputs','scope']) && fit.schema==='recipe-body-reception-v1' &&
    fit.bodyType===id && fit.bodySha256===model.sha256 && fit.recipeSha256===index.recipeSha256 &&
    fit.templateSha256===templateSha && fit.sourceBodySha256===sourceBodySha && fit.manifestSha256===catalog.sha256 &&
    fit.scope==='Rest-pose geometry, bind and floor only; formal outfit admission pending.' &&
    keysOf(fit.equipment,roles) && Array.isArray(fit.inputs) && fit.inputs.length>0 &&
    fit.inputs.every(pin=>validPin(pin,'path',32*1024*1024) && typeof pin.path==='string') &&
    Number.isSafeInteger(fit.affectedTriangles) && fit.affectedTriangles>=0,'fit identity');
  for (const [i,role] of roles.entries()) {
    const row=fit.equipment[role], item=items[i];
    requireData(keysOf(row,['id','fitSha256','weightedVertices','bones','sourceItem','garmentSha256','restSweptBoundsLowerDistanceM']) &&
      row.id===item.id && row.fitSha256===model.sha256 && row.sourceItem===clothing[i].id &&
      row.garmentSha256===item.sha256 && row.weightedVertices===item.stats.vertices &&
      row.bones===item.stats.joints && Number.isFinite(row.restSweptBoundsLowerDistanceM) &&
      row.restSweptBoundsLowerDistanceM>=0,'fit slot '+role);
  }
  // Foundation and equipment loaders check model digests again before drawing.
  // Inspect the body container here so it cannot introduce an external fetch.
  const body=await read('/'+model.path,model), view=new DataView(body.buffer,body.byteOffset,body.byteLength);
  requireData(body.byteLength>=20 && view.getUint32(0,true)===0x46546c67 && view.getUint32(4,true)===2 &&
    view.getUint32(8,true)===body.byteLength && view.getUint32(16,true)===0x4e4f534a,'VRM header');
  const gltf=JSON.parse(text.decode(body.subarray(20,20+view.getUint32(12,true))));
  requireData(gltf.buffers?.length===1 && !Object.hasOwn(gltf.buffers[0],'uri') &&
    gltf.images?.every(im=>!Object.hasOwn(im,'uri') && Number.isSafeInteger(im.bufferView)),'external VRM resource');
  await Promise.all(clothing.map(item=>read(item.url,pins.get(item.url.slice(1)))));
  return profile;
}

export function createRuleBodyRegistry() {
  const installed=new Map();
  return {
    hasSha(sha) { return typeof sha==='string' && installed.get('rule-body-'+sha.slice(0,20))?.sha===sha; },
    async initialize(profiles,descriptors,{readBytes=browserBytes,initialAssets,signal}={}) {
      validateRuleBodyPointers(descriptors);
      const pointers=structuredClone(descriptors), reads=new Map();
      function read(url,pin) {
        const key=url+' '+pin.bytes+' '+pin.sha256;
        if (reads.has(key)) return reads.get(key);
        async function verified() {
          signal?.throwIfAborted();
          const data=await readBytes(url,pin.bytes,signal);
          requireData(data instanceof Uint8Array && data.byteLength===pin.bytes &&
            await sha256Hex(data)===pin.sha256,'payload mismatch '+url);
          return data;
        }
        const bytes=initialAssets && url.startsWith('/assets/')
          ? initialAssets.read(url,pin.sha256,verified).then(buffer=>{
              requireData(buffer.byteLength===pin.bytes,'payload size '+url);
              return new Uint8Array(buffer);
            })
          : verified();
        reads.set(key,bytes);
        return reads.get(key);
      }
      function checkConflicts(rows) {
        for (const {ptr,profile} of rows) {
          const prior=installed.get(ptr.bodyType);
          if (prior) requireData(prior.index===ptr.sha256 && prior.bytes===ptr.bytes &&
            profiles[ptr.bodyType]===prior.profile,'changed publication '+ptr.bodyType);
          else requireData(!Object.hasOwn(profiles,ptr.bodyType) &&
            (!profile || !Object.values(profiles).some(p=>p.sha256===profile.sha256)),'existing profile '+ptr.bodyType);
        }
      }
      checkConflicts(pointers.map(ptr=>({ptr})));
      const pending=await Promise.all(pointers.map(async ptr=>({ptr,profile:installed.has(ptr.bodyType)?
        installed.get(ptr.bodyType).profile:await readPack(ptr,read)})));
      // No await between final conflict validation and installation of the group.
      signal?.throwIfAborted();
      checkConflicts(pending);
      for (const {ptr,profile} of pending) {
        if (!installed.has(ptr.bodyType)) {
          profiles[ptr.bodyType]=freezeJson(profile);
          installed.set(ptr.bodyType,{index:ptr.sha256,bytes:ptr.bytes,sha:profile.sha256,profile,references:0});
        }
        installed.get(ptr.bodyType).references++;
      }
      let released=false;
      return {bodyTypes:pointers.map(ptr=>ptr.bodyType),dispose() {
        if (released) return;
        released=true;
        for (const {bodyType} of pointers) {
          const row=installed.get(bodyType);
          if (--row.references===0) {
            if (profiles[bodyType]===row.profile) delete profiles[bodyType];
            installed.delete(bodyType);
          }
        }
      }};
    },
  };
}
export const publishedRuleBodies=createRuleBodyRegistry();
