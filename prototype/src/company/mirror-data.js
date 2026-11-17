const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
export function validateMirrorResource(r,fail,path=r.id) {
  if(r.mirrorSurface===undefined) {
    if(r.mirrorNodes!==undefined||r.mirrorShape!==undefined)fail('invalid-mirror-contract',path,'Mirror mappings require a fixed reflection contract');
    return;
  }
  const s=r.mirrorSurface,m=r.mounting;
  if(!r.asset||r.mount!=='wall'||r.mountRole!=='mirror'||r.category!=='decor'||
    !exact(s,['schema','profile','position'])||s.schema!=='planar-mirror-v1'||s.profile!=='single-512-v1'||JSON.stringify(s.position)!=='[0,0,0.026]'||
    !exact(m,['origin','width','height','depth'])||m.origin!=='center'||m.width!==.8||m.height!==1.8||m.depth!==.04||
    !exact(r.mirrorNodes,['face'])||r.mirrorNodes.face!=='mirror-surface'||!exact(r.mirrorShape,['polygons'])||
    !exact(r.stateDefaults,[])||r.stateSchema!==undefined||r.stateSemantics!==undefined||r.usePoints?.length||r.footprint?.blocking||
    r.light||r.clockDisplay||r.informationSurface||r.informationContent||r.display||r.movingParts||r.supportSurfaces||r.surface)
    fail('invalid-mirror-contract',path,'Expected a static wall mirror with the planar-mirror-v1 / single-512-v1 contract');
  const polygons=r.mirrorShape?.polygons;
  if(!Array.isArray(polygons)||!polygons.length||polygons.length>16)fail('invalid-mirror-shape',path,'Expected 1 to 16 bounded convex mirror polygons');
  for(const polygon of polygons) {
    if(!Array.isArray(polygon)||polygon.length<3||polygon.length>128||polygon.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>.4||Math.abs(p[1])>.9))
      fail('invalid-mirror-shape',path,'Mirror polygon coordinates must be finite and inside the installation envelope');
    for(let i=0;i<polygon.length;i++) {
      const a=polygon[i],b=polygon[(i+1)%polygon.length],c=polygon[(i+2)%polygon.length];
      if((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0])<=1e-10)
        fail('invalid-mirror-shape',path,'Mirror polygons must be strictly convex, counterclockwise and without duplicate points');
    }
  }
}
