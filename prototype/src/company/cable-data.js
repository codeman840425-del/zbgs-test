// Bounded display connections. No electrical simulation, actor tasks or physics.
export const CABLE_IDS=['single-sleeve','dual-sleeve','braided-loop','flat-ribbon'].map(x=>`cable-route-${x}`);
export const CABLE_CONNECTION={profile:'desk-collinear-v1',connector:'usb-c-visual-v1',spanRange:[.14,.7],unplugDistance:.025};
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const norm=v=>Array.isArray(v)?v.map(norm):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,norm(v[k])])):v;
const same=(a,b)=>JSON.stringify(norm(a))===JSON.stringify(norm(b));
const EPS=1e-5;
export function validateCableResource(r,fail,path=r.id){
  if(r.cablePorts!==undefined||r.cablePortNodes!==undefined){
    const ports=r.cablePorts;
    const isPowerStrip=r.mountRole==='power-strip'&&r.productionBranch==='power-strip';
    const expectedPortIds=isPowerStrip?['usb-1','usb-2','usb-3','usb-4']:['usb'];
    if(r.mount!=='desk-surface'||!Array.isArray(ports)||ports.length!==expectedPortIds.length||!object(r.cablePortNodes))fail('invalid-cable-ports',path,isPowerStrip?'Power strips require four explicit visual connectors':'Static desk devices require one explicit visual connector');
    for(const p of ports){
      const validId=isPowerStrip?expectedPortIds.includes(p?.id):p?.id==='usb';
      const expectedY=.014;
      if(!object(p)||Object.keys(p).some(k=>!['id','connector','position','direction'].includes(k))||!validId||p.connector!=='usb-c-visual-v1'||!vector(p.position)||!vector(p.direction)||
        p.position.some(v=>Math.abs(v)>1)||Math.abs(p.position[1]-expectedY)>EPS||p.direction[1]!==0||Math.abs(p.direction[0])+Math.abs(p.direction[2])!==1||!p.direction.every(v=>[-1,0,1].includes(v)))
        fail('invalid-cable-ports',path,isPowerStrip?'Expected four fixed horizontal visual power-strip connectors':'Expected the fixed horizontal visual USB connector contract');
      const binding=r.cablePortNodes[p.id];
      if(!object(binding)||!Array.isArray(binding.frame)||binding.frame.length!==4||new Set(binding.frame).size!==4||binding.frame.some(n=>typeof n!=='string'||!n)||typeof binding.backing!=='string'||!binding.backing)
        fail('invalid-cable-ports',path,'A connector requires four real frame meshes and a backing mesh');
    }
    if(JSON.stringify(Object.keys(r.cablePortNodes).sort())!==JSON.stringify(expectedPortIds)||r.movingParts)fail('invalid-cable-ports',path,'Connector mappings must match the fixed port list and remain static');
  }
  const isCable=r.mount==='parent-device-endpoints'||r.mountRole==='cable-route'||r.cableConnection!==undefined;
  if(!isCable)return;
  if(r.category!=='decor'||r.mountRole!=='cable-route'||r.productionBranch!=='cable-route'||r.mount!=='parent-device-endpoints'||
    !same(r.cableConnection,CABLE_CONNECTION)||!same(r.stateDefaults,{connected:true})||!same(r.stateSchema,{connected:{type:'boolean'}})||
    !same(r.stateSemantics,{connected:'both-device-ports-connected-or-B-unplugged'})||!same(r.usePoints,[])||r.footprint?.blocking||r.mounting||r.surface||r.supportSurfaces||r.movingParts||r.cablePorts||
    r.geometry?.profile!=='company-cable-route-v1'||!same(r.geometry.endpointA,[-.7,0,0])||!same(r.geometry.endpointB,[.7,0,0]))
    fail('invalid-cable-contract',path,'Expected a bounded desk cable with explicit connection state');
}
function rotate(p,yaw){const c=Math.cos(yaw),s=Math.sin(yaw);return [p[0]*c+p[2]*s,p[1],-p[0]*s+p[2]*c];}
function portInParent(f,port){return {position:rotate(port.position,f.node.transform.yaw).map((v,i)=>v+f.node.transform.position[i]),direction:rotate(port.direction,f.node.transform.yaw)};}
export function deriveCableConnections({nodes,facilities},fail){
  const byId=new Map(facilities.map(f=>[f.id,f])), routes=new Map(), claimed=new Set();
  for(const f of facilities){
    const link=f.node.cableLink;
    if(f.resource.mount!=='parent-device-endpoints'){
      if(link!==undefined)fail('unexpected-cable-link',f.id,'Only a cable instance can bind device ports');
      continue;
    }
    if(!object(link)||Object.keys(link).sort().join(',')!=='a,b'||!same(f.node.transform,{position:[0,0,0],yaw:0})||f.node.attachment)
      fail('invalid-cable-link',f.id,'Cable transform is derived from its two device ports; retain identity transform');
    const parent=byId.get(f.node.parentId),surface=parent?.resource.surface;
    if(!surface||parent.resource.movingParts)fail('invalid-cable-parent',f.id,'Cable and both devices require the same static desk');
    const ends=[];
    for(const label of ['a','b']){
      const ref=link[label];
      if(!object(ref)||Object.keys(ref).sort().join(',')!=='deviceId,portId'||typeof ref.deviceId!=='string'||typeof ref.portId!=='string')fail('invalid-cable-link',f.id,'Expected deviceId and portId on each endpoint');
      const device=byId.get(ref.deviceId),port=device?.resource.cablePorts?.find(p=>p.id===ref.portId);
      if(!device||!port||device.node.parentId!==f.node.parentId||port.connector!==f.resource.cableConnection.connector)
        fail('missing-cable-endpoint',f.id,`No compatible same-desk port at ${ref.deviceId}/${ref.portId}`);
      const claim=`${ref.deviceId}#${ref.portId}`;
      // A disconnected B remains reserved as the reconnect target; old locks are not actor leases.
      if(claimed.has(claim))fail('cable-port-in-use',f.id,`Port ${claim} already belongs to a cable`);
      claimed.add(claim);ends.push(portInParent(device,port));
    }
    const [a,b]=ends,d=b.position.map((v,i)=>v-a.position[i]);
    const span=d.reduce((sum,v,i)=>sum+v*a.direction[i],0);
    if(span<.14-EPS||span>.7+EPS||d.some((v,i)=>Math.abs(v-span*a.direction[i])>EPS)||b.direction.some((v,i)=>Math.abs(v+a.direction[i])>EPS))
      fail('unsupported-cable-route',f.id,'Use facing, collinear ports at equal height, .14–.70m apart');
    const length=span-(f.state.connected?0:.025),end=a.position.map((v,i)=>v+a.direction[i]*length);
    for(const p of [a.position,b.position]){
      if(p[1]-.006<surface.topY-EPS||Math.abs(p[0])+.015>surface.halfSize[0]+EPS||Math.abs(p[2])+.015>surface.halfSize[1]+EPS)
        fail('cable-outside-desk',f.id,'The complete cable corridor must fit above the supporting desk');
    }
    routes.set(f.id,{id:f.id,parentId:f.node.parentId,a:a.position,b:b.position,end,direction:a.direction,span,length,connected:f.state.connected});
  }
  return routes;
}
