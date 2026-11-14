// Read-only reproduction against the pinned release, not reconstructed source.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pack = path.join(root, 'baseline/packs/present_motion_v1_1111_MT');
const source = fs.readFileSync(path.join(pack, 'assets/present_motion_v1_1111_MT-DBfKYVCQ.js'), 'utf8');
const rigText = source.split('var un=')[1]?.split(',dn=')[0];
assert(rigText, 'Pinned female skeleton literal must exist');
const rig = vm.runInNewContext(`(${rigText})`, {}, { timeout: 1000 });
const start = source.indexOf('"sit_idle":') + '"sit_idle":'.length;
assert(start > '"sit_idle":'.length);
let depth = 0, end = start;
for (; end < source.length; end++) {
  if (source[end] === '{') depth++;
  if (source[end] === '}' && --depth === 0) break;
}
const clip = JSON.parse(source.slice(start, end + 1));
const frame = clip.frames[0];
const thigh = rig.bones.find(b => b.name === 'thigh_r');
const shin = rig.bones.find(b => b.name === 'shin_r');
const angle = thigh.restRot + frame.bones.thigh_r.rot;
const sx = frame.bones.thigh_r.sx ?? 1;
const sy = frame.bones.thigh_r.sy ?? 1;
const legacy = (x, y, r, sx, sy) => [(x*Math.cos(r)-y*Math.sin(r))*sx, (x*Math.sin(r)+y*Math.cos(r))*sy];
const image = (x, y, r, sx, sy) => [x*sx*Math.cos(r)-y*sy*Math.sin(r), x*sx*Math.sin(r)+y*sy*Math.cos(r)];
const a = legacy(shin.x, shin.y, angle, sx, sy);
const b = image(shin.x, shin.y, angle, sx, sy);
const error = Math.hypot(a[0]-b[0], a[1]-b[1]);
assert(Math.abs(error-16.93232697617955) < 1e-8);
let comparisonPatch = {status:'not generated'};
const fixedPath = path.join(root,'comparison-fixed/assets/present_motion_v1_1111_MT-DBfKYVCQ.js');
if(fs.existsSync(fixedPath)) {
  const fixedSource=fs.readFileSync(fixedPath,'utf8');
  const expression=fixedSource.match(/f=s\.x\+c\.dx,p=s\.y\+c\.dy,(m=.*?);this\.world\.set/)[1];
  const run=vm.runInNewContext(`(f,p,i,a,o)=>{let n=0,r=0,u=Math.cos(i),d=Math.sin(i),${expression};return [m,h]}`,{}, {timeout:1000});
  const fixed=run(shin.x,shin.y,angle,sx,sy);
  const fixedError=Math.hypot(fixed[0]-b[0],fixed[1]-b[1]);
  assert(fixedError<1e-10);
  for(const rotation of [-1,-.25,0,.25,1]) for(const scaleX of [.42,1,2]) for(const scaleY of [.42,1,2]) {
    const actual=run(17,118,rotation,scaleX,scaleY), expected=image(17,118,rotation,scaleX,scaleY);
    assert(Math.hypot(actual[0]-expected[0],actual[1]-expected[1])<1e-10);
  }
  comparisonPatch={status:'passed 45 nonuniform/uniform rotation cases',offset:fixed,errorModelUnits:fixedError,scope:'Parent image endpoint vs immediate child translation only; not a complete affine hierarchy test'};
}
// Sanity controls: order commutes for uniform scaling or zero rotation.
for (const [r, x, y] of [[angle, 0.42, 0.42], [0, 1, 0.42]]) {
  const c=legacy(0,118,r,x,y), d=image(0,118,r,x,y);
  assert(Math.hypot(c[0]-d[0],c[1]-d[1])<1e-10);
}
const views = {};
for (const relative of ['parts/W1/parts_manifest_v1.json','parts/W3/parts_manifest_v1.json','lookpacks/dir2v1r3_1111/parts_manifest_v1.json']) {
  const m = JSON.parse(fs.readFileSync(path.join(pack,relative),'utf8'));
  views[relative] = {partSchema:m.partSchema, parts:m.parts.length, views:[...new Set(m.parts.map(p=>p.view))], projection:m.viewProjection??null};
}
let count=0, pixelBytes=0;
const unique=new Set();
for (const filename of fs.readdirSync(path.join(pack,'atlases')).filter(f=>f.endsWith('.json'))) {
  const atlas=JSON.parse(fs.readFileSync(path.join(pack,'atlases',filename),'utf8'));
  for (const [key,item] of Object.entries(atlas.frames)) {
    if(unique.has(key))continue;
    unique.add(key); count++; pixelBytes+=item.frame.w*item.frame.h*4;
  }
}
console.log(JSON.stringify({baselineCommit:'92c1ee2b666288526e4ca974187f8b4fc5efb376',case:'female sit_idle frame 0 thigh_r → shin_r',angle,sx,sy,offset:[shin.x,shin.y],legacyChildOffset:a,imageEndpointOffset:b,errorModelUnits:error,comparisonPatch,controls:'passed',views,atlasFrameUpperBound:{uniqueFrames:count,rgbaBytes:pixelBytes,note:'Static potential copied pixels; not measured GPU/heap memory or rendered-frame cost.'}},null,2));
