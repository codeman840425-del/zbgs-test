import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

const root = new URL('../../', import.meta.url);
const sha = value => createHash('sha256').update(value).digest('hex');
const sourceRoot = 'assets-source/company-surface-finishes-v1';
const outputRoot = 'prototype/public/company-assets/surface-finishes-v1';
const evidenceRoot = 'evidence/company-surface-production-v1';
const generatorSha256 = sha(await fs.readFile(new URL(import.meta.url)));

const designIds = ['wall-fine-stripes','wall-leaf-damask','wall-diamond-grid','wall-arc-fan',
  'floor-offset-plank','floor-herringbone','floor-checker-tile','floor-terrazzo'];
const parameterKeys = {'fine-stripes':'stripePx',leaf:'leafPx',diamond:'gridPx',arc:'arcPx',
  'offset-plank':'plankPx',herringbone:'bonePx',checker:'tilePx',terrazzo:'chipPx'};
const mod=(x,n)=>((x%n)+n)%n;
function validateDesign(d) {
  const key=parameterKeys[d.pattern],n=d.params?.[key];
  if(!key||Object.keys(d.params).length!==1||!Number.isInteger(n)||n<16||n>128||256%n!==0)
    throw Error('Pattern period must divide 256, between 16 and 128 pixels; exactly its named parameter is supported');
  if(!['wall','floor'].includes(d.surface)||!Array.isArray(d.tile)||d.tile.length!==2||!d.tile.every(n=>Number.isFinite(n)&&n>=.1&&n<=4))throw Error('Invalid surface or metre tile');
  for(const c of [d.base,d.accent])if(!Array.isArray(c)||c.length!==3||!c.every(n=>Number.isInteger(n)&&n>=0&&n<=255))throw Error('Invalid RGB');
}
// All coordinates are periodic in 512px. Rectangular pieces are authored in a
// rotated integer lattice, so herringbone has actual interlocking 2:1 boards.
export function pixelAt(d,x,y) {
  x=mod(x,512);y=mod(y,512);
  const n=d.params[parameterKeys[d.pattern]],base=d.base,accent=d.accent;
  const mix=t=>base.map((v,i)=>Math.round(v+(accent[i]-v)*t));
  if(d.pattern==='fine-stripes')return mod(x,2*n)<n/4?accent:base;
  if(d.pattern==='leaf') {
    const row=Math.floor(y/n),dx=mod(x+(row%2)*n/2,n)-n/2,dy=mod(y,n)-n/2;
    const u=(dx+dy)*.7071,v=(dy-dx)*.7071;
    return u*u/(n*n*.16)+v*v/(n*n*.035)<1?(Math.abs(v)<1?mix(.4):accent):base;
  }
  if(d.pattern==='diamond')return Math.min(mod(x+y,n),mod(x-y,n))<n/24?accent:base;
  if(d.pattern==='arc') {
    let ring=false;
    for(let row=Math.floor(y/n)-1;row<=Math.floor(y/n);row++) {
      const dx=mod(x+(row%2)*n/2+n/2,n)-n/2,dy=y-row*n;
      const radius=Math.hypot(dx,dy);
      if(dy>=0&&dy<=n)for(const k of [.32,.55,.78,1])if(Math.abs(radius-n*k)<n/45)ring=true;
    }
    return ring?accent:base;
  }
  if(d.pattern==='offset-plank') {
    const row=Math.floor(y/n),u=mod(x+(row%2)*n,2*n),v=mod(y,n);
    if(u<3||v<3)return accent;
    return mix(.06+.11*Math.sin((v/n)*Math.PI*12+.7*Math.sin(u/20))**2);
  }
  if(d.pattern==='herringbone') {
    const u=x+y,v=y-x,ix=Math.floor(u/n),iy=Math.floor(v/n),s=mod(ix-iy,4);
    const horizontal=s<2,lx=mod(u,n)+(s===1?n:0),ly=mod(v,n)+(s===2?n:0);
    const along=horizontal?lx:ly,across=horizontal?mod(v,n):mod(u,n);
    if(along<2||across<2)return accent;
    return mix((horizontal?.08:.22)+.1*Math.sin(across/n*28+.6*Math.sin(along/13))**2);
  }
  if(d.pattern==='checker') {
    if(mod(x,n)<2||mod(y,n)<2)return mix(.4);
    return (Math.floor(x/n)+Math.floor(y/n))%2?base:accent;
  }
  const cellX=Math.floor(x/n),cellY=Math.floor(y/n),seed=mod(cellX*73+cellY*151+cellX*cellY*17,251);
  const cx=n*(.25+(seed%13)/26),cy=n*(.25+(seed%11)/22);
  const dx=mod(x,n)-cx,dy=mod(y,n)-cy;
  return Math.abs(dx)+Math.abs(dy)*1.3<n*(.14+(seed%5)*.025)?mix(.45+(seed%3)*.23):base;
}

function png(width,height,pixels){
  const rows=Buffer.alloc((width*4+1)*height); for(let y=0;y<height;y++){rows[(width*4+1)*y]=0; pixels.copy(rows,(width*4+1)*y+1,y*width*4,y*width*4+width*4);}
  const chunk=(type,data)=>{const t=Buffer.from(type); const out=Buffer.alloc(12+data.length); out.writeUInt32BE(data.length,0); t.copy(out,4); data.copy(out,8); out.writeUInt32BE(crc32(Buffer.concat([t,data])),8+data.length); return out;};
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',(()=>{const h=Buffer.alloc(13);h.writeUInt32BE(width,0);h.writeUInt32BE(height,4);h[8]=8;h[9]=6;return h;})()),chunk('IDAT',deflateSync(rows,{level:9}),),chunk('IEND',Buffer.alloc(0))]);
}
function crc32(buf){let c=0xffffffff;for(const b of buf){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
export function texture(design) {
  validateDesign(design);
  const w=512,h=512,p=Buffer.alloc(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const c=pixelAt(design,x,y),i=(y*w+x)*4;p[i]=c[0];p[i+1]=c[1];p[i+2]=c[2];p[i+3]=255;
  }
  return png(w,h,p);
}

export function glb(design, image){
  const pos=new Float32Array([-0.5,0,0.5,0.5,0,0.5,0.5,0,-0.5,-0.5,0,-0.5]);
  const nor=new Float32Array([0,1,0,0,1,0,0,1,0,0,1,0]); const uv=new Float32Array([0,0,1,0,1,1,0,1]); const idx=new Uint16Array([0,1,2,0,2,3]);
  const align=b=>Buffer.concat([b,Buffer.alloc((4-b.length%4)%4)]); let chunks=[],offset=0; const add=b=>{const a=align(Buffer.from(b.buffer||b,b.byteOffset||0,b.byteLength||b.length));const o=offset;offset+=a.length;chunks.push(a);return [o,a.length];};
  const vp=add(pos),vn=add(nor),vu=add(uv),vi=add(idx),vim=add(image); const bin=Buffer.concat(chunks);
  const j={asset:{version:'2.0',generator:'company-surface-finishes-v1'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'finish-surface',mesh:0}],meshes:[{name:'finish-surface',primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},indices:3,material:0}]}],buffers:[{byteLength:bin.length}],bufferViews:[{buffer:0,byteOffset:vp[0],byteLength:vp[1]},{buffer:0,byteOffset:vn[0],byteLength:vn[1]},{buffer:0,byteOffset:vu[0],byteLength:vu[1]},{buffer:0,byteOffset:vi[0],byteLength:vi[1],target:34963},{buffer:0,byteOffset:vim[0],byteLength:vim[1]}],accessors:[{bufferView:0,componentType:5126,count:4,type:'VEC3',min:[-.5,0,-.5],max:[.5,0,.5]},{bufferView:1,componentType:5126,count:4,type:'VEC3'},{bufferView:2,componentType:5126,count:4,type:'VEC2'},{bufferView:3,componentType:5123,count:6,type:'SCALAR'}],images:[{bufferView:4,mimeType:'image/png'}],textures:[{sampler:0,source:0}],samplers:[{wrapS:10497,wrapT:10497,magFilter:9729,minFilter:9987}],materials:[{name:'finish-surface',pbrMetallicRoughness:{baseColorTexture:{index:0},metallicFactor:0,roughnessFactor:.72}}]};
  const jb=Buffer.from(JSON.stringify(j)); const jp=Buffer.concat([jb,Buffer.alloc((4-jb.length%4)%4,0x20)]); const bp=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]); const head=Buffer.alloc(12);head.writeUInt32LE(0x46546c67,0);head.writeUInt32LE(2,4);head.writeUInt32LE(12+8+jp.length+8+bp.length,8); const ch=(type,b)=>{const h=Buffer.alloc(8);h.writeUInt32LE(b.length,0);h.writeUInt32LE(type,4);return Buffer.concat([h,b]);};return Buffer.concat([head,ch(0x4e4f534a,jp),ch(0x004e4942,bp)]);
}

export async function build({check=false}={}) {
  const resources=[],records=[];
  for(const id of designIds) {
    const sourcePath=`${sourceRoot}/${id}.json`,sourceBytes=await fs.readFile(new URL(sourcePath,root));
    const d=JSON.parse(sourceBytes);if(d.id!==id)throw Error('Source identity differs from its filename');
    const image=texture(d),model=glb(d,image),dir=`${outputRoot}/${id}/v1`;
    const resource={id:d.id,version:1,kind:'surface-finish',displayName:d.label,mountRole:'surface-finish',
      coordinates:{units:'metres',up:'+Y',forward:'+Z'},finish:{allowedSurfaces:[d.surface],materialNode:'finish-surface',tileMeters:d.tile},
      materialSlots:{finish:['finish-surface']},stateDefaults:{},asset:{format:'glb',url:`/company-assets/surface-finishes-v1/${id}/v1/model.glb`,sha256:sha(model),bytes:model.length},
      provenance:{license:'Project-authored procedural surface sample. No external art assets.',sourceParameters:sourcePath,sourceParametersSha256:sha(sourceBytes),generator:'scripts/company-platform/build-surface-finishes.mjs',generatorSha256,sourceParametersSummary:d.params,tools:['Node.js zlib PNG encoder','hand-packed glTF 2.0']}};
    for(const [name,value]of [['texture.png',image],['model.glb',model],['resource.json',Buffer.from(JSON.stringify(resource,null,2)+'\n')]]) {
      const target=new URL(`${dir}/${name}`,root);
      if(check){if(!(await fs.readFile(target)).equals(value))throw Error(`Output differs ${target}`);}
      else {await fs.mkdir(new URL('./',target),{recursive:true});await fs.writeFile(target,value);}
    }
    resources.push(`${dir}/resource.json`);records.push({id,pattern:d.pattern,sourceSha256:sha(sourceBytes),textureSha256:sha(image),assetSha256:sha(model),bytes:model.length});
  }
  const collection=Buffer.from(JSON.stringify({schemaVersion:1,generator:'scripts/company-platform/build-surface-finishes.mjs',generatorSha256,resources},null,2)+'\n');
  const target=new URL(`${sourceRoot}/collection.json`,root);
  if(check){if(!(await fs.readFile(target)).equals(collection))throw Error('Collection differs');}
  else await fs.writeFile(target,collection);
  return {status:'passed',mode:check?'check':'build',resources:records};
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)console.log(JSON.stringify(await build({check:process.argv.includes('--check')})));
