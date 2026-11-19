import {canonicalJson,sha256Hex} from './character-record.js';

const shaPattern=/^[a-f0-9]{64}$/;
const same=(a,b)=>canonicalJson(a)===canonicalJson(b);
function requireRegion(ok,message) {
  if(!ok)throw Object.assign(Error('分区发色：'+message),{code:'incompatible-hair-colorway'});
}
function keys(value,names) {
  return value && typeof value==='object' && !Array.isArray(value) &&
    Object.keys(value).length===names.length && names.every(key=>Object.hasOwn(value,key));
}
function localAsset(url) {
  return typeof url==='string' && /^\/assets\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/.test(url) &&
    !url.split('/').some(segment=>segment==='.' || segment==='..');
}
function without(obj,...fields) {
  return Object.fromEntries(Object.entries(obj).filter(([key])=>!fields.includes(key)));
}
export function validateRegionDeclaration(manifest,fit) {
  if(!Object.hasOwn(manifest,'regionColorway') && !Object.hasOwn(fit,'regionColorway'))return;
  const region=manifest.regionColorway;
  requireRegion(manifest.schema==='character-hairstyle-v1' && manifest.physics==='vrm-spring' &&
    fit.schema==='character-hair-fit-v2' && keys(region,['sourceStyle','regions','palette']) &&
    fit.regionColorway && same(region,fit.regionColorway),'清单与版型的区域身份不同');
  const source=region.sourceStyle;
  requireRegion(keys(source,['id','version','manifestSha256','fitSha256']) && typeof source.id==='string' &&
    source.id!==manifest.id && Number.isSafeInteger(source.version) && source.version>0 &&
    shaPattern.test(source.manifestSha256) && shaPattern.test(source.fitSha256),'原款身份无效');
  for(const pin of [region.regions,region.palette])requireRegion(keys(pin,['url','bytes','sha256']) &&
    localAsset(pin.url) && Number.isSafeInteger(pin.bytes) && pin.bytes>0 && shaPattern.test(pin.sha256),'配色资源身份无效');
}

/** The same reader is used in the standalone exporter and before a replacement is committed. */
export async function loadRegionColorway(entry,manifest,fit,body,sourceEntry,read) {
  validateRegionDeclaration(manifest,fit);
  const {sourceStyle,regions:regionPin,palette:palettePin}=manifest.regionColorway;
  requireRegion(sourceEntry.id===sourceStyle.id && sourceEntry.manifestSha256===sourceStyle.manifestSha256 &&
    sourceEntry.fit?.sha256===sourceStyle.fitSha256 && sourceEntry.assetSha256===entry.assetSha256 &&
    sourceEntry.fit.id!==entry.fit.id && sourceEntry.fit.sha256!==entry.fit.sha256,'原款素材或独立版型不匹配');
  async function pinned(pin,reason) {
    const bytes=new Uint8Array(await read(pin.url,reason,pin));
    requireRegion((pin.bytes===undefined || bytes.length===pin.bytes) && await sha256Hex(bytes)===pin.sha256,reason+' 数据不符');
    return bytes;
  }
  const json=async(pin,reason)=>JSON.parse(new TextDecoder().decode(await pinned(pin,reason)));
  const [sourceManifest,sourceFit,regions,palette]=await Promise.all([
    json({url:sourceEntry.manifestUrl,sha256:sourceEntry.manifestSha256},'Original hairstyle manifest'),
    json(sourceEntry.fit,'Original hairstyle body fit'),json(regionPin,'Selected hairstyle region map'),
    json(palettePin,'Selected hairstyle region palette'),
  ]);
  requireRegion(sourceManifest.id===sourceStyle.id && sourceManifest.version===sourceStyle.version &&
    same(sourceManifest.fit,sourceEntry.fit) && sourceFit.styleId===sourceStyle.id && sourceFit.id===sourceEntry.fit.id &&
    sourceFit.version===sourceEntry.fit.version && !sourceManifest.regionColorway && !sourceFit.regionColorway &&
    same(without(manifest,'id','version','label','fit','regionColorway'),without(sourceManifest,'id','version','label','fit')) &&
    same(without(fit,'id','version','styleId','regionColorway'),without(sourceFit,'id','version','styleId')),
  '派生项改变了原网格、材质或动态版型');
  requireRegion(regions?.schema==='hair-region-source-v1' && regions.bodySha256===body &&
    regions.styleId===sourceStyle.id && regions.styleVersion===sourceStyle.version &&
    regions.styleManifestSha256===sourceStyle.manifestSha256 && regions.fitSha256===sourceStyle.fitSha256 &&
    regions.assetSha256===manifest.sha256 && regions.material===manifest.sourceMaterial &&
    [regions.mesh,regions.primitive].every(n=>Number.isSafeInteger(n)&&n>=0) &&
    [regions.vertices,regions.triangles].every(n=>Number.isSafeInteger(n)&&n>0) &&
    ['positionFloat32Le','uvFloat32Le','triangleIndicesUint32Le'].every(k=>shaPattern.test(regions.streams?.[k])),
  '区域不属于当前身体、网格或原版型');
  const mask=regions.mask;
  requireRegion(mask?.format==='normalized-uint8x2-in-primitive-vertex-order' && same(mask.channels,['root','tip']) &&
    /^[A-Za-z0-9_-]+\.rg8$/.test(mask.file) && shaPattern.test(mask.sha256) && mask.bytes===regions.vertices*2,
  '根梢遮罩格式无效');
  const validColor=color=>Array.isArray(color) && color.length===3 &&
    color.every(x=>Number.isFinite(x)&&x>=0&&Number.isFinite(Math.fround(x)));
  requireRegion(keys(palette,['schema','rootLinearRgb','tipLinearRgb']) && palette.schema==='hair-region-palette-v1' &&
    validColor(palette.rootLinearRgb) && validColor(palette.tipLinearRgb),'线性色表无效');
  const url=regionPin.url.slice(0,regionPin.url.lastIndexOf('/')+1)+mask.file;
  const bytes=await pinned({url,sha256:mask.sha256,bytes:mask.bytes},'Selected hairstyle root and tip weights');
  const colors=new Float32Array(regions.vertices*3);
  let hasRoot=false,hasTip=false,hasProtected=false;
  for(let i=0;i<regions.vertices;i++) {
    const root=bytes[2*i]/255,tip=bytes[2*i+1]/255;
    requireRegion(!(root && tip),'根梢遮罩重叠');
    hasRoot ||= root>0;hasTip ||= tip>0;hasProtected ||= !root&&!tip;
    for(let c=0;c<3;c++)colors[i*3+c]=1+(palette.rootLinearRgb[c]-1)*root+(palette.tipLinearRgb[c]-1)*tip;
  }
  requireRegion(hasRoot&&hasTip&&hasProtected,'缺少根区、梢区或保护区');
  return {regions,colors};
}

// This authoring profile pins packed glTF float32 POSITION/UV and uint32 indices.
export async function verifyRegionPrimitive({regions},doc,input) {
  const mesh=doc.meshes?.[regions.mesh],p=mesh?.primitives?.[regions.primitive];
  requireRegion(p && (p.mode??4)===4 && p.attributes.COLOR_0===undefined &&
    doc.materials?.[p.material]?.name===regions.material,'目标材质或图元不匹配');
  const data=new Uint8Array(input.buffer??input,input.byteOffset??0,input.byteLength);
  const header=new DataView(data.buffer,data.byteOffset,data.byteLength);
  const binHeader=20+header.getUint32(12,true),binStart=binHeader+8;
  requireRegion(binStart<=data.length && header.getUint32(binHeader+4,true)===0x004e4942 &&
    binStart+header.getUint32(binHeader,true)===data.length,'缺少嵌入几何缓冲区');
  for(const [id,kind,component,count,width,hash] of [
    [p.attributes.POSITION,'VEC3',5126,regions.vertices,12,regions.streams.positionFloat32Le],
    [p.attributes.TEXCOORD_0,'VEC2',5126,regions.vertices,8,regions.streams.uvFloat32Le],
    [p.indices,'SCALAR',5125,regions.triangles*3,4,regions.streams.triangleIndicesUint32Le],
  ]) {
    const a=doc.accessors?.[id],v=doc.bufferViews?.[a?.bufferView];
    requireRegion(a?.type===kind && a.componentType===component && a.count===count && !a.normalized && !a.sparse &&
      v?.buffer===0 && (v.byteStride??width)===width,'图元索引或顶点布局不匹配');
    const offset=a.byteOffset??0,start=binStart+(v.byteOffset??0)+offset,size=count*width;
    requireRegion(offset>=0 && offset+size<=v.byteLength && start+size<=data.length &&
      await sha256Hex(data.subarray(start,start+size))===hash,'网格顶点或三角形顺序不同');
  }
}
