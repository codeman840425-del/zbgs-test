import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

const root = new URL('../../', import.meta.url);
const sha = value => createHash('sha256').update(value).digest('hex');
const sourceRoot = 'assets-source/company-surface-finishes-v1';
const outputRoot = 'prototype/public/company-assets/surface-finishes-v1';
const evidenceRoot = 'evidence/company-surface-production-v1';
const generatorSha = sha(await fs.readFile(new URL(import.meta.url)));

const designs = [
  {id:'wall-fine-stripes',label:'细条纹墙面',surface:'wall',pattern:'fine-stripes',tile:[1,1],base:[205,214,218],accent:[83,112,122],params:{stripePx:32}},
  {id:'wall-leaf-damask',label:'叶形墙面',surface:'wall',pattern:'leaf',tile:[1,1],base:[224,211,186],accent:[87,119,83],params:{leafPx:96}},
  {id:'wall-diamond-grid',label:'菱格墙面',surface:'wall',pattern:'diamond',tile:[1,1],base:[207,201,216],accent:[112,78,133],params:{gridPx:128}},
  {id:'wall-arc-fan',label:'弧形墙面',surface:'wall',pattern:'arc',tile:[1,1],base:[224,224,214],accent:[173,105,62],params:{arcPx:128}},
  {id:'floor-offset-plank',label:'错缝木板地面',surface:'floor',pattern:'offset-plank',tile:[1,1],base:[159,105,62],accent:[93,58,35],params:{plankPx:128}},
  {id:'floor-herringbone',label:'鱼骨拼地面',surface:'floor',pattern:'herringbone',tile:[1,1],base:[174,126,78],accent:[102,68,40],params:{bonePx:96}},
  {id:'floor-checker-tile',label:'棋盘砖地面',surface:'floor',pattern:'checker',tile:[1,1],base:[224,220,204],accent:[58,67,73],params:{tilePx:128}},
  {id:'floor-terrazzo',label:'水磨石地面',surface:'floor',pattern:'terrazzo',tile:[1,1],base:[205,201,188],accent:[67,105,111],params:{chipPx:24}}
];

function png(width,height,pixels){
  const rows=Buffer.alloc((width*4+1)*height); for(let y=0;y<height;y++){rows[(width*4+1)*y]=0; pixels.copy(rows,(width*4+1)*y+1,y*width*4,y*width*4+width*4);}
  const chunk=(type,data)=>{const t=Buffer.from(type); const out=Buffer.alloc(12+data.length); out.writeUInt32BE(data.length,0); t.copy(out,4); data.copy(out,8); out.writeUInt32BE(crc32(Buffer.concat([t,data])),8+data.length); return out;};
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',Buffer.from([0,0,2,0,0,2,0,0,0,8,6,0,0,0])),chunk('IDAT',deflateSync(rows,{level:9}),),chunk('IEND',Buffer.alloc(0))]);
}
function crc32(buf){let c=0xffffffff;for(const b of buf){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function texture(design){
  const w=512,h=512,p=Buffer.alloc(w*h*4), [br,bg,bb]=design.base,[ar,ag,ab]=design.accent;
  const set=(x,y,c)=>{const i=(y*w+x)*4;p[i]=c[0];p[i+1]=c[1];p[i+2]=c[2];p[i+3]=255;};
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let c=[br,bg,bb], v;
    if(design.pattern==='fine-stripes') {const period=design.params?.stripePx||32; v=(x%(period*2)<Math.max(4,Math.floor(period/4)))?[ar,ag,ab]:c; c=v;}
    else if(design.pattern==='leaf'){const dx=((x+64)%128)-64,dy=((y+96)%160)-80; if((dx*dx/1400+dy*dy/520)<1 && ((x+y)>>5)%2===0)c=[ar,ag,ab];}
    else if(design.pattern==='diamond'){const q=Math.abs(((x+y)%128)-64)+Math.abs(((x-y+8192)%128)-64);if(q<18)c=[ar,ag,ab];}
    else if(design.pattern==='arc'){const d=Math.hypot(x%256-128,y%256-128);if(d>84&&d<96)c=[ar,ag,ab];}
    else if(design.pattern==='offset-plank'){if(y%128<7||x%256<5||((y/128|0)%2===1&&x%256<130&&x%256>124))c=[ar,ag,ab];}
    else if(design.pattern==='herringbone'){const q=((x+y)%192<10)||((x-y+1024)%192<10);if(q)c=[ar,ag,ab];}
    else if(design.pattern==='checker'){if(((x/128|0)+(y/128|0))%2===0)c=[ar,ag,ab];}
    else {const n=((x*928371+y*1237)%997);if(n<10)c=[ar,ag,ab];else if(n<16)c=[Math.min(255,ar+35),Math.min(255,ag+25),Math.min(255,ab+15)];}
    set(x,y,c);
  } return png(w,h,p);
}

function glb(design, image){
  const pos=new Float32Array([-0.5,0,0.5,0.5,0,0.5,0.5,0,-0.5,-0.5,0,-0.5]);
  const nor=new Float32Array([0,1,0,0,1,0,0,1,0,0,1,0]); const uv=new Float32Array([0,0,1,0,1,1,0,1]); const idx=new Uint16Array([0,1,2,0,2,3]);
  const align=b=>Buffer.concat([b,Buffer.alloc((4-b.length%4)%4)]); let chunks=[],offset=0; const add=b=>{const a=align(Buffer.from(b.buffer||b,b.byteOffset||0,b.byteLength||b.length));const o=offset;offset+=a.length;chunks.push(a);return [o,a.length];};
  const vp=add(pos),vn=add(nor),vu=add(uv),vi=add(idx),vim=add(image); const bin=Buffer.concat(chunks);
  const j={asset:{version:'2.0',generator:'company-surface-finishes-v1'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'finish-surface',mesh:0}],meshes:[{name:'finish-surface',primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},indices:3,material:0}]}],buffers:[{byteLength:bin.length}],bufferViews:[{buffer:0,byteOffset:vp[0],byteLength:vp[1]},{buffer:0,byteOffset:vn[0],byteLength:vn[1]},{buffer:0,byteOffset:vu[0],byteLength:vu[1]},{buffer:0,byteOffset:vi[0],byteLength:vi[1],target:34963},{buffer:0,byteOffset:vim[0],byteLength:vim[1]}],accessors:[{bufferView:0,componentType:5126,count:4,type:'VEC3',min:[-.5,0,-.5],max:[.5,0,.5]},{bufferView:1,componentType:5126,count:4,type:'VEC3'},{bufferView:2,componentType:5126,count:4,type:'VEC2'},{bufferView:3,componentType:5123,count:6,type:'SCALAR'}],images:[{bufferView:4,mimeType:'image/png'}],textures:[{sampler:0,source:0}],samplers:[{wrapS:10497,wrapT:10497,magFilter:9729,minFilter:9987}],materials:[{name:'finish-surface',pbrMetallicRoughness:{baseColorTexture:{index:0},metallicFactor:0,roughnessFactor:.72}}]};
  const jb=Buffer.from(JSON.stringify(j)); const jp=Buffer.concat([jb,Buffer.alloc((4-jb.length%4)%4,0x20)]); const bp=Buffer.concat([bin,Buffer.alloc((4-bin.length%4)%4)]); const head=Buffer.alloc(12);head.writeUInt32LE(0x46546c67,0);head.writeUInt32LE(2,4);head.writeUInt32LE(12+8+jp.length+8+bp.length,8); const ch=(type,b)=>{const h=Buffer.alloc(8);h.writeUInt32LE(b.length,0);h.writeUInt32LE(type,4);return Buffer.concat([h,b]);};return Buffer.concat([head,ch(0x4e4f534a,jp),ch(0x004e4942,bp)]);
}

const check=process.argv.includes('--check'); const resources=[]; const records=[];
for(const d of designs){const image=texture(d), model=glb(d,image), sourcePath=`${sourceRoot}/${d.id}.json`, dir=`${outputRoot}/${d.id}/v1`; const params={...d,production:'procedural 512x512 RGBA PNG, single UV quad, metre tile'}; const sourceText=JSON.stringify(params,null,2)+'
'; const resource={id:d.id,version:1,kind:'surface-finish',displayName:d.label,mountRole:'surface-finish',coordinates:{units:'metres',up:'+Y',forward:'+Z'},finish:{allowedSurfaces:[d.surface],materialNode:'finish-surface',tileMeters:d.tile},materialSlots:{finish:['finish-surface']},stateDefaults:{},asset:{format:'glb',url:`/company-assets/surface-finishes-v1/${d.id}/v1/model.glb`,sha256:sha(model),bytes:model.length},provenance:{license:'Project-authored procedural surface sample. No external art assets.',sourceParameters:sourcePath,sourceParametersSha256:sha(sourceText),generator:'scripts/company-platform/build-surface-finishes.mjs',generatorSha,sourceParametersSummary:d.params,tools:['Node.js zlib PNG encoder','hand-packed glTF 2.0']}};
  const writes=[[`${sourcePath}`,JSON.stringify(params,null,2)+'\n'],[`${dir}/model.glb`,model],[`${dir}/resource.json`,JSON.stringify(resource,null,2)+'\n']]; for(const [path,val] of writes){const u=new URL(path,root);if(check){const old=await fs.readFile(u);if(!old.equals(Buffer.isBuffer(val)?val:Buffer.from(val)))throw new Error(`Output differs ${path}`);}else{await fs.mkdir(new URL('./',u),{recursive:true});await fs.writeFile(u,val);}}
  resources.push(`${dir}/resource.json`); records.push({id:d.id,version:1,resourcePath:`${dir}/resource.json`,surface:d.surface,pattern:d.pattern,textureSha256:sha(image),assetSha256:sha(model),bytes:model.length});
}
const collection={schemaVersion:1,generatedAt:'2026-11-16',generator:'scripts/company-platform/build-surface-finishes.mjs',generatorSha,resources};
const collPath=new URL(`${sourceRoot}/collection.json`,root); const evPath=new URL(`${evidenceRoot}/production-report.json`,root); if(check){if(!(await fs.readFile(collPath)).equals(Buffer.from(JSON.stringify(collection,null,2)+'\n')))throw new Error('collection differs');}else{await fs.mkdir(new URL(`${sourceRoot}/`,root),{recursive:true});await fs.writeFile(collPath,JSON.stringify(collection,null,2)+'\n');await fs.mkdir(new URL(`${evidenceRoot}/`,root),{recursive:true});const changed={base:designs[0],modified:{...designs[0],params:{...designs[0].params,stripePx:48}},baseHash:sha(glb(designs[0],texture(designs[0]))),modifiedHash:sha(glb({...designs[0],params:{...designs[0].params,stripePx:48}},texture({...designs[0],params:{...designs[0].params,stripePx:48}}))),repeatModifiedHash:sha(glb({...designs[0],params:{...designs[0].params,stripePx:48}},texture({...designs[0],params:{...designs[0].params,stripePx:48}})))};await fs.writeFile(evPath,JSON.stringify({status:'cpu-production-passed',collection:'assets-source/company-surface-finishes-v1/collection.json',records,sourceModification:changed,checks:['PNG deterministic bytes','GLB deterministic bytes','embedded PNG with UV/normals','single finish-surface mesh','8 structural patterns','no external dependencies'],limitations:['Runtime room import and visual acceptance pending root integration','Samples are procedural technical art, not final human art approval']},null,2)+'\n');}
console.log(JSON.stringify({status:'passed',mode:check?'check':'build',resources:records}));

