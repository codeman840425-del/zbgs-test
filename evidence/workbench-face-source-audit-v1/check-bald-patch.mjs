// CPU mock control-flow check of exact review patch; no product writes/WebGL.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const out=path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?=[A-Z]:)/,''));
const root=path.resolve(out,'../..');
const patch=fs.readFileSync(path.join(out,'bald.patch'),'utf8');
const candidate={};
for(const section of patch.split(/(?=^--- )/m).filter(s=>s.startsWith('--- '))){
 const lines=section.trimEnd().split('\n');const file=lines[1].slice(6);const old=lines[0]==='--- /dev/null'?'':fs.readFileSync(path.join(root,file),'utf8').replaceAll('\r\n','\n');
 const before=old.split('\n');let cursor=0,result=[];
 for(let i=2;i<lines.length;){
  const m=lines[i++].match(/^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/);assert(m);const start=Number(m[1])-(Number(m[1])?1:0);result.push(...before.slice(cursor,start));cursor=start;
  while(i<lines.length&&!lines[i].startsWith('@@')){const line=lines[i++];if(line[0]===' '||line[0]==='-'){assert.equal(before[cursor++],line.slice(1));}if(line[0]===' '||line[0]==='+')result.push(line.slice(1));}
 }
 result.push(...before.slice(cursor));candidate[file]=result.join('\n');
}
const catalog=new Function(candidate['prototype/src/no-hair-bodies.js'].replace('export const','const')+';return NO_HAIR_BODIES;')();
const first=catalog[0].sha256, second=catalog[1].sha256;
const material=name=>({name,clone(){return material(name)},dispose(){this.disposed=true;}});
const mesh=name=>({isMesh:true,visible:true,material:material(name),geometry:{clearGroups(){},addGroup(){},index:{count:3},dispose(){}},userData:{}});
function scene(meshes){return {visible:true,traverse(fn){meshes.forEach(fn)},removeFromParent(){this.removed=true}};}
let parseCount=0;
class Loader{async parseAsync(){parseCount++;return {scene:scene([mesh('replacement')])};}}
const factory=new Function('THREE','GLTFLoader','createFacialPalette','EYE_COLORS','LIP_COLORS','HAIRSTYLES','NO_HAIR_BODIES',candidate['prototype/src/character-appearance.js'].replace(/^import .*;\n/gm,'').replaceAll('export ','')+';return createCharacterAppearance;')({},Loader,()=>({set:async()=>({applied:true}),getState:()=>({}),dispose(){}}),{original:null},{original:null},[{id:'test',manifestUrl:'/test.json',compatibleBodies:[first,second]}],catalog);
function actor(sha=first,mixed=false){const hair=mesh('F_HAIR'),brow=mesh('F_FaceBrow_00'),lash=mesh('F_FaceEyelash_00'),skin=mesh('F_Face_00_SKIN');const attachments=[];if(mixed)hair.material=[hair.material,skin.material];const vrm={scene:scene([hair,brow,lash,skin]),humanoid:{getRawBoneNode:()=>({add:s=>attachments.push(s)})}};return {a:factory({vrm,avatarSha256:sha}),hair,brow,lash,skin,attachments};}
const bytes=new Uint8Array([1,2,3]).buffer;
const sha=crypto.createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
let fetches=0,release,rejectAsset;
function network(deferred=false){const asset=deferred?new Promise((resolve,reject)=>{release=resolve;rejectAsset=reject}):Promise.resolve({ok:true,arrayBuffer:async()=>bytes});globalThis.fetch=async url=>{fetches++;return url==='/test.json'?{ok:true,json:async()=>({schema:'character-hairstyle-v1',id:'test',mount:'head',headLocal:true,compatibleBodies:[first,second],sourceMaterial:'F_HAIR',url:'/hair.glb',sha256:sha})}:asset;};}
const cases=[];async function test(name,fn){await fn();cases.push({name,passed:true});}
for(const row of catalog)await test(`none admission ${row.id}`,async()=>{const x=actor(row.sha256);assert((await x.a.set({hairStyle:'none'})).applied);assert(!x.hair.visible&&x.brow.visible&&x.lash.visible&&x.skin.visible);assert.equal(x.a.getState().replacementSHA256,null);await x.a.set({hairStyle:'original'});assert(x.hair.visible);x.a.dispose();});
await test('unknown identity and mixed primitive fail closed',async()=>{for(const x of [actor('bad'),actor(first,true)]){assert(!(await x.a.set({hairStyle:'none'})).applied);assert(!x.a.setBodyMode('base').applied);assert(x.hair.visible);x.a.dispose();}});
await test('replacement cached; base mode preserves choice; no overlapping hair',async()=>{network();const x=actor();await x.a.set({hairStyle:'test'});assert(!x.hair.visible&&x.attachments[0].visible);const count=fetches;x.a.setBodyMode('base');assert.equal(x.a.getState().hairStyle,'test');assert.equal(x.a.getState().effectiveHairStyle,'none');assert(!x.attachments[0].visible);x.a.setBodyMode('dressed');assert(x.attachments[0].visible&&!x.hair.visible);await x.a.set({hairStyle:'none'});assert(!x.attachments[0].visible);assert.equal(x.a.getState().replacementSHA256,null);await x.a.set({hairStyle:'test'});assert.equal(fetches,count);assert(x.attachments[0].visible);x.a.dispose();});
await test('none cancels late success; cached completion stays hidden',async()=>{network(true);const x=actor();const pending=x.a.set({hairStyle:'test'});await x.a.set({hairStyle:'none'});release({ok:true,arrayBuffer:async()=>bytes});assert((await pending).cancelled);assert.equal(x.a.getState().hairStyle,'none');assert(!x.hair.visible&&!x.attachments[0].visible);x.a.dispose();});
await test('base entered during load suppresses completion but retains selected intent',async()=>{network(true);const x=actor();const pending=x.a.set({hairStyle:'test'});x.a.setBodyMode('base');release({ok:true,arrayBuffer:async()=>bytes});assert((await pending).applied);assert.equal(x.a.getState().hairStyle,'test');assert(!x.attachments[0].visible);x.a.setBodyMode('dressed');assert(x.attachments[0].visible);x.a.dispose();});
await test('late failure after none is cancellation, no current error',async()=>{network(true);const x=actor();const pending=x.a.set({hairStyle:'test'});await x.a.set({hairStyle:'none'});rejectAsset(new Error('controlled late failure'));assert((await pending).cancelled);assert.equal(x.a.getState().error,null);x.a.dispose();});
await test('dispose while loading releases late object; no attachment',async()=>{network(true);const x=actor();const pending=x.a.set({hairStyle:'test'});x.a.dispose();release({ok:true,arrayBuffer:async()=>bytes});assert((await pending).cancelled);assert.equal(x.attachments.length,0);assert(!(await x.a.set({hairStyle:'none'})).applied);});
await test('two instances and reset inside base preserve mode semantics',async()=>{const a=actor(),b=actor(second);await a.a.set({hairStyle:'none'});assert(b.hair.visible);a.a.setBodyMode('base');await a.a.set({reset:true});assert.equal(a.a.getState().hairStyle,'original');assert(!a.hair.visible);a.a.setBodyMode('dressed');assert(a.hair.visible);a.a.dispose();b.a.dispose();});
const result={scope:'Patched source executed with mock VRM/materials/network/loader; CPU state and cancellation checks only, not real loader/geometry/WebGL.',patchSHA256:crypto.createHash('sha256').update(patch).digest('hex'),node:process.version,passed:cases.length,cases,parseCount,fetches};
fs.writeFileSync(path.join(out,'bald-cpu-result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
