"""Isolated profile derivative: measured axial end extension, no spherical cap."""
import importlib.util,json,pathlib,numpy as np
R=pathlib.Path(__file__).resolve().parents[3];W=R
spec=importlib.util.spec_from_file_location('source',R/'scripts/m1-assets/build-forearm-collision-profile.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
O=pathlib.Path(__file__).resolve().parents[1];O.mkdir(parents=True,exist_ok=True)
for sex in ['female','male']:
 d=json.loads((R/f'assets-source/forearm-collision-v1/{sex}.json').read_text());src=g.load(sex)
 assert d['bodySHA256']==src['sha'],'Source body changed: regenerate/requalify profile instead of mixing identities'
 for p in d['profiles']:
  _,a,b,axis,length,weights,faces,ids,u,rad=g.prepare(src,p['side']);lo=float(u[ids].min());hi=float(u[ids].max());knots=np.array([lo,lo/2,0,.2,.4,.6,.8,1,(1+hi)/2,hi]);bands=[]
  for start,end in zip(knots[:-1],knots[1:]):
   points=[]
   for t in src['tri'][faces]:
    if max(u[t])<start or min(u[t])>end:continue
    clipped=g.clip(src['pos'][t],a,axis,start*length,False)
    if len(clipped):clipped=g.clip(clipped,a,axis,end*length,True)
    if len(clipped):points.extend(clipped)
   points=np.array(points);delta=points-a;ax=delta@axis;bands.append(float(np.linalg.norm(delta-ax[:,None]*axis,axis=1).max()))
  radii=[bands[0]]+[max(bands[i-1:i+1])for i in range(1,len(bands))]+[bands[-1]]
  p['extendedKnots']=[{'t':float(t),'radius':r}for t,r in zip(knots,radii)]
  p['extendedScope']='Axis-aligned measured boundary in bind only; mixed elbow deformation requires actual posed verification. No full-radius elbow sphere.'
 d['railCandidate']='v2 measured axial extension,8circumferential rails+end diameters; finite contours do not guarantee coverage of every small triangle'
 (O/(sex+'.json')).write_text(json.dumps(d,indent=2),encoding='utf8')
 print(sex,[(p['side'],p['extendedKnots'][0],p['extendedKnots'][-1])for p in d['profiles']])
