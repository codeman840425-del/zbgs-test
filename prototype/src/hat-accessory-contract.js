import {hairEntry} from './hair-fit-contract.js';

const require = (ok,message) => { if(!ok)throw Error(message); };
const sha = value => typeof value==='string' && /^[a-f0-9]{64}$/.test(value);
const vector = (value,n) => Array.isArray(value) && value.length===n && value.every(Number.isFinite);
const keys = (object,allowed) => object && typeof object==='object' && !Array.isArray(object) && Object.keys(object).every(key=>allowed.includes(key));
const identity = attachment => vector(attachment.position,3) && attachment.position.every(v=>v===0) &&
  vector(attachment.quaternion,4) && attachment.quaternion.every((v,i)=>v===(i===3?1:0)) &&
  vector(attachment.scale,3) && attachment.scale.every(v=>v===1);
const name = value => typeof value==='string' && value.length>0 && value.length<=128;
const version = value => Number.isSafeInteger(value) && value>0;
function fileInDirectory(value,base) {
  require(typeof value==='string','Invalid hat resource URL');
  const url=new URL(value,base),directory=new URL('.',base);
  require(url.origin===base.origin && !url.username && !url.password && !url.search && !url.hash &&
    url.pathname.startsWith(directory.pathname),'Hat resources must stay in the manifest directory');
  const file=url.pathname.slice(directory.pathname.length);
  require(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(file),'Unsafe hat resource path');
  return file;
}
export function validateHatManifest(manifest,base) {
  require(keys(manifest,['schema','id','version','url','sha256','bytes','mount','headLocal','physics','fit','runtimeAccepted']) &&
    manifest.schema==='character-hat-v1' && manifest.version===1 && name(manifest.id) &&
    manifest.mount==='head' && manifest.headLocal===true && manifest.physics==='rigid' && sha(manifest.sha256) &&
    Number.isSafeInteger(manifest.bytes) && manifest.bytes>0,'Unsupported hat manifest');
  require(keys(manifest.fit,['id','version','url','sha256']) && name(manifest.fit.id) &&
    version(manifest.fit.version) && sha(manifest.fit.sha256),'Invalid hat fit reference');
  return {...manifest,styleId:manifest.id,pairId:null,
    asset:{file:fileInDirectory(manifest.url,base),sha256:manifest.sha256,bytes:manifest.bytes},
    fit:{...manifest.fit,file:fileInDirectory(manifest.fit.url,base)},
    instances:[{id:manifest.id,side:'single',socket:'head',styleId:manifest.id}]};
}
export function validateHatFit(fit,manifest,avatarSha256,head) {
  require(keys(fit,['schema','id','version','assetSha256','targetBodySha256','hairDependency','attachment','physics','coverage','runtimeAccepted']) &&
    fit.schema==='character-hat-fit-v1' && fit.id===manifest.fit.id && fit.version===manifest.fit.version &&
    fit.assetSha256===manifest.asset.sha256 && fit.targetBodySha256===avatarSha256 && fit.physics==='rigid','Hat fit identity mismatch');
  const a=fit.attachment,c=fit.coverage,d=fit.hairDependency;
  require(keys(a,['humanoidBone','space','position','quaternion','scale']) && a.humanoidBone==='head' &&
    a.space==='raw-head-bind-local' && identity(a),'Unsupported hat mount transform');
  require(keys(c,['mode','preserveCompleteHair','preserveCompleteHeadSkin']) && c.mode==='none' &&
    c.preserveCompleteHair===true && c.preserveCompleteHeadSkin===true,'Unsupported hat coverage');
  require(keys(d,['path','sha256','manifestPath','manifestSha256','fitPath','fitSha256','styleId','manifestVersion','fitVersion']) &&
    name(d.styleId) && sha(d.sha256) && sha(d.manifestSha256) && sha(d.fitSha256) && version(d.manifestVersion) &&
    version(d.fitVersion) && ['path','manifestPath','fitPath'].every(k=>typeof d[k]==='string' &&
      !d[k].includes('\\') && !d[k].includes(':') && !d[k].startsWith('/') && !d[k].split('/').includes('..')),'Invalid exact hat hair dependency');
  return {...fit,fitId:fit.id,mounts:[{instanceId:manifest.id,side:'single',socket:'head',bone:'head',rawBoneName:head.name,
    space:a.space,position:a.position,quaternion:a.quaternion,scale:a.scale}]};
}
export function validateHatHairCatalog(fit,avatarSha256) {
  const d=fit.hairDependency,entry=hairEntry(avatarSha256,d.styleId);
  require(entry.assetSha256===d.sha256 && entry.manifestSha256===d.manifestSha256 &&
    entry.fit?.sha256===d.fitSha256 && entry.fit.version===d.fitVersion && !entry.legacyImplicitFit,'Hat hair dependency differs from the current exact catalog');
  return entry;
}
export function validateHatHairManifest(manifest,fit,entry,avatarSha256) {
  const d=fit.hairDependency;
  require(manifest.schema==='character-hairstyle-v1' && manifest.id===d.styleId && manifest.version===d.manifestVersion &&
    manifest.sha256===d.sha256 && manifest.mount==='head' && manifest.headLocal===true &&
    manifest.compatibleBodies?.includes(avatarSha256) && manifest.fit?.id===entry.fit.id &&
    manifest.fit.version===d.fitVersion && manifest.fit.sha256===d.fitSha256,'Hat hair manifest identity mismatch');
}
export function assertHatHairSelection(descriptor,fit,entry) {
  const d=fit.hairDependency,h=descriptor?.hairFit;
  if(descriptor?.hairStyle!==d.styleId || descriptor.replacementSHA256!==d.sha256 ||
      h?.kind!=='explicit-fit-v1' || h.id!==entry.fit.id || h.version!==d.fitVersion || h.sha256!==d.fitSha256 ||
      (descriptor.hairManifestSha256!==undefined && descriptor.hairManifestSha256!==d.manifestSha256))
    throw Object.assign(Error('帽子只适配已登记的身体与精确发型版本，请先卸帽再更换发型'),{code:'hat-hair-incompatible',field:'hairStyle'});
}
export function validateHatSourceDocument(doc) {
  require(!doc.images?.length && !doc.textures?.length && !doc.skins?.length && !doc.animations?.length && !doc.cameras?.length &&
    !doc.extensions && !doc.extensionsUsed?.length && !doc.extensionsRequired?.length &&
    doc.buffers?.length===1 && !doc.buffers[0].uri && doc.scene===0 && doc.scenes?.length===1 &&
    doc.nodes?.length===2 && doc.meshes?.length===2 && doc.materials?.length===1,'Unsupported hat dependencies or source structure');
  require(doc.scenes[0].nodes?.length===2 && new Set(doc.scenes[0].nodes).size===2 &&
    doc.scenes[0].nodes.every(i=>i===0||i===1) && doc.nodes.every((node,i)=>keys(node,['name','mesh']) && node.mesh===i),
  'Hat source must contain two identity mesh nodes');
  require(doc.meshes.every(mesh=>!mesh.weights && mesh.primitives?.length===1 && mesh.primitives.every(p=>
    keys(p,['attributes','indices','material','mode']) && (p.mode===undefined||p.mode===4) && p.material===0 &&
    keys(p.attributes,['POSITION','NORMAL']) && Number.isSafeInteger(p.attributes.POSITION) &&
    Number.isSafeInteger(p.attributes.NORMAL) && Number.isSafeInteger(p.indices))), 'Unsupported hat primitive');
  const material=doc.materials[0],pbr=material.pbrMetallicRoughness;
  require(keys(material,['name','pbrMetallicRoughness','doubleSided','alphaMode']) &&
    keys(pbr,['baseColorFactor','metallicFactor','roughnessFactor']) && vector(pbr.baseColorFactor,4) &&
    pbr.baseColorFactor.every(v=>v>=0&&v<=1) && Number.isFinite(pbr.metallicFactor) &&
    pbr.metallicFactor>=0 && pbr.metallicFactor<=1 && Number.isFinite(pbr.roughnessFactor) &&
    pbr.roughnessFactor>=0 && pbr.roughnessFactor<=1 && doc.accessors?.every(a=>!a.extensions) &&
    doc.bufferViews?.every(v=>!v.extensions && v.buffer===0),'Hat requires one untextured PBR material');
}
