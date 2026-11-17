const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
export function validateMirrorResource(r,fail,path=r.id) {
  if(r.mirrorSurface===undefined) {
    if(r.mirrorNodes!==undefined||r.mirrorShape!==undefined)fail('invalid-mirror-contract',path,'Mirror mappings require a fixed reflection contract');
    return;
  }
  const s=r.mirrorSurface,m=r.mounting,floor=r.mountRole==='floor-mirror';
  if(!r.asset||r.mount!==(floor?'floor-surface':'wall')||r.mountRole!==(floor?'floor-mirror':'mirror')||r.category!=='decor'||
    !exact(s,['schema','profile','position'])||s.schema!=='planar-mirror-v1'||s.profile!=='single-512-v1'||JSON.stringify(s.position)!==(floor?'[0,0.92,0.026]':'[0,0,0.026]')||
    !exact(m,['origin','width','height','depth'])||m.origin!==(floor?'bottom':'center')||m.width!==.8||m.height!==1.8||m.depth!==(floor?.6:.04)||
    !exact(r.mirrorNodes,floor?['face','back','base','post']:['face'])||r.mirrorNodes.face!=='mirror-surface'||!exact(r.mirrorShape,['polygons'])||
    !exact(r.stateDefaults,[])||r.stateSchema!==undefined||r.stateSemantics!==undefined||r.usePoints?.length||(!floor&&r.footprint?.blocking)||
    r.light||r.clockDisplay||r.informationSurface||r.informationContent||r.display||r.movingParts||r.supportSurfaces||r.surface)
    fail('invalid-mirror-contract',path,'Expected a fixed wall/floor mirror with the planar-mirror-v1 / single-512-v1 contract');
  if(floor&&(!exact(r.footprint,['center','halfSize','blocking'])||JSON.stringify(r.footprint.center)!=='[0,0]'||JSON.stringify(r.footprint.halfSize)!=='[0.4,0.3]'||r.footprint.blocking!==true||r.mirrorNodes.back!=='mirror-back'||r.mirrorNodes.base!=='mirror-base'||r.mirrorNodes.post!=='mirror-post'))
    fail('invalid-mirror-contract',path,'Floor mirror requires its fixed blocking footprint and actual back/base/post mappings');
  const polygons=r.mirrorShape?.polygons;
  if(!Array.isArray(polygons)||!polygons.length||polygons.length>16)fail('invalid-mirror-shape',path,'Expected 1 to 16 bounded convex mirror polygons');
  for(const polygon of polygons) {
    if(!Array.isArray(polygon)||polygon.length<3||polygon.length>128||polygon.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>.4||p[1]<(floor?0:-.9)||p[1]>(floor?1.8:.9)))
      fail('invalid-mirror-shape',path,'Mirror polygon coordinates must be finite and inside the installation envelope');
    for(let i=0;i<polygon.length;i++) {
      const a=polygon[i],b=polygon[(i+1)%polygon.length],c=polygon[(i+2)%polygon.length];
      if((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0])<=1e-10)
        fail('invalid-mirror-shape',path,'Mirror polygons must be strictly convex, counterclockwise and without duplicate points');
    }
  }
}
