import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
const dir=path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const main=fs.readFileSync(path.resolve(dir,'../../prototype/src/main.js'),'utf8');
const extract=(start,end)=>main.slice(main.indexOf(start),main.indexOf(end,main.indexOf(start)));
const fn=extract('async function switchFoundationBody(bodyType)', 'function populateDanceSelect(');
const sync=extract('function syncFoundationControls(a)', 'function bindFoundationControls(a)');
fs.mkdirSync(path.join(dir,'source-tested'),{recursive:true});
fs.writeFileSync(path.join(dir,'source-tested/switch-and-sync.js'),sync+'\n'+fn);
const noop=()=>{};
class V { constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});} clone(){return new V(this.x,this.y,this.z);} copy(v){return Object.assign(this,v);} fromArray(a){[this.x,this.y,this.z]=a;return this;} }
function fixture(fault){
 const world={children:new Set(),add(root){root.parent=this;this.children.add(root);}};
 const makeAvatar=(id)=>{const a={id,disposed:false,profile:{bodyType:id,sha256:id,motion:{}},config:{outfits:[{index:0,role:'pants'},...(id==='old'?[{index:1,role:'skirt'}]:[])],ids:{},pantsLabel:'pants',label:id},vrm:{},root:{position:new V(2,0,3),rotation:{y:0},updateMatrixWorld:noop,removeFromParent(){this.parent?.children.delete(this);this.parent=null;}},appearance:{getState:()=>({availableStyles:['original'],hairStyle:'original'}),set:async()=>({applied:true})},setOutfit(n){this.outfit=n;},setDebugBody:noop,setDynamics:noop,update(){if(id==='new'&&fault==='avatar-update')throw Error('injected avatar update');},resetSecondary:noop,updateGarment(){if(id==='new'&&fault==='garment')throw Error('injected garment');},dispose(){this.disposed=true;this.root.removeFromParent();}};return a;};
 const old=makeAvatar('old'),next=makeAvatar('new');world.add(old.root);
 const makeRig=(id)=>({id,disposed:false,setCorrections:noop,reset:noop,setAction:noop,update(){if(id==='new'&&fault==='motion-update')throw Error('injected motion update');},getDance:()=>({id:'dance'}),getDances:()=>[{id:'dance'}],setDance:noop,dispose(){this.disposed=true;}});
 const oldRig=makeRig('old'),newRig=makeRig('new');
 const elements=new Map();const element=(s)=>{if(!elements.has(s))elements.set(s,{textContent:'',hidden:false,querySelector:()=>element(s+' b'),pressed:s==='[data-outfit="1"]'?'true':'false'});return elements.get(s);};
 element('[data-outfit="0"]');element('[data-outfit="1"]');
 const c={outfit:1,yaw:.2,maxSpeed:.8,paused:true,playbackRate:.25,simulationTime:4,mode:'idle',seatAlign:false,behaviorTasks:{active:()=>null,pending:()=>[],cancel:noop},cancelSequence:noop,reset(){this.resetCalled=true;},turnPolicy:{reset:noop},setSpeed:noop,setPlaybackRate:noop,setPaused:noop};
 const ctx={ready:true,avatar:old,motion:oldRig,bodySelectionGeneration:0,bodySelection:{},world,renderer:{},loadFoundationAvatar:async()=>next,loadRetargetedMotions:async()=>{if(fault==='load')throw Error('injected load');return {};},createMotion:()=>newRig,controller:c,inspection:{bodyMode:'full',dynamics:true,corrections:'full'},correctionLayers:{full:{}},cameraMode:'close',camera:{position:new V()},controls:{target:new V()},chairBounds:[],seatTargets:()=>({approach:[0,0,0]}),document:{querySelector:element},populateDanceSelect(){if(fault==='ui')throw Error('injected UI');},createDebugHelpers:noop,syncInspectionUI:noop,fixedViews:new Set(),cameraTween:null,followPosition:new V(),updateFixedCamera:noop,syncViewButtons:noop,location:{href:'http://localhost/?body=old'},history:{state:{},replaceState:noop},refreshUI:noop,URL};
 vm.createContext(ctx);vm.runInContext(sync+'\n'+fn,ctx);
 return {ctx,old,next,oldRig,newRig,world,elements,c};
}
const results=[];
for(const fault of ['load','motion-update','avatar-update','garment','ui',null]){
 const f=fixture(fault),result=await f.ctx.switchFoundationBody('new');
 results.push({fault,result,currentAvatar:f.ctx.avatar.id,currentRig:f.ctx.motion.id,oldVisible:f.world.children.has(f.old.root),newVisible:f.world.children.has(f.next.root),oldDisposed:f.old.disposed,newDisposed:f.next.disposed,oldReset:!!f.c.resetCalled,controllerOutfit:f.c.outfit,pantsPressed:f.elements.get('[data-outfit="0"]').pressed,skirtPressed:f.elements.get('[data-outfit="1"]').pressed,skirtHidden:f.elements.get('[data-outfit="1"]').hidden});
}
const report={scope:'CPU execution of extracted actual switch/sync functions; stub scene and controller dependencies; injected exceptions are not claimed observed GPU failures.',sourceSha256:crypto.createHash('sha256').update(main).digest('hex'),results};
fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
