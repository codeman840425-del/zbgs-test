"""Actual triangle source audit, run in Blender for BVH/mathutils. No new fit."""
from pathlib import Path
import argparse,hashlib,importlib.util,json,sys
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/m2-outer-panels-v2'
ap=argparse.ArgumentParser();ap.add_argument('--out',default='generated');args=ap.parse_args(sys.argv[sys.argv.index('--')+1:]if '--'in sys.argv else [])
OUT=(BASE/args.out).resolve();assert OUT.is_relative_to(BASE) and OUT!=BASE
mod=importlib.util.spec_from_file_location('glb',ROOT/'scripts/m2-male-face-v1/glb.py');g=importlib.util.module_from_spec(mod);mod.loader.exec_module(g)
GLB=g.GLB;sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();S=json.loads((BASE/'spec.json').read_text(encoding='utf-8'))
def surface(path,select=lambda name:True):
 b=GLB(path);positions=[];faces=[];labels=[]
 for mesh in b.doc['meshes']:
  for p in mesh['primitives']:
   name=b.doc['materials'][p['material']]['name']
   if not select(name):continue
   pts=b.acc(p['attributes']['POSITION']);tri=b.acc(p['indices']).reshape(-1,3)
   labels.extend([name]*len(tri));faces.extend(tri+len(positions));positions.extend(pts)
 return np.array(positions),np.array(faces),labels
vp,vf,_=surface(OUT/'author-export.glb');tree=BVHTree.FromPolygons(vp.tolist(),vf.tolist(),all_triangles=True,epsilon=0.)
cross=np.cross(vp[vf[:,1]]-vp[vf[:,0]],vp[vf[:,2]]-vp[vf[:,0]]);areas=np.linalg.norm(cross,axis=1)/2
surfaces={
 'body':(ROOT/'prototype/public/assets/foundation/base-male-roundtrip.vrm',lambda n:'_Body_00_SKIN'in n),
 'topAndTie':(ROOT/S['parentTop'],lambda n:True),
 'pants':(ROOT/'prototype/public/assets/m1b/m1b-uniform-pants.glb',lambda n:True),
 'shorts':(ROOT/'prototype/public/assets/m1b/m1b-uniform-shorts-v1.glb',lambda n:True)}
contacts={}
for name,(path,selector)in surfaces.items():
 p,f,labels=surface(path,selector);bt=BVHTree.FromPolygons(p.tolist(),f.tolist(),all_triangles=True,epsilon=0.)
 pairs=tree.overlap(bt);dist=[]
 for v in vp:
  hit=bt.find_nearest(Vector(v));dist.append(hit[3])
 contacts[name]={'sha256':sha(path),'trianglePairs':pairs,'pairCount':len(pairs),'minimumVertexToSurfaceM':min(dist),'pointDistanceIsNotFullTriangleClearance':True,
                 'firstPairMaterials':[labels[b]for a,b in pairs[:20]]}
# Ignore topological adjacency including duplicated UV seam vertices.
weld={};ids=[]
for p in vp:
 key=tuple(np.round(p,6));weld.setdefault(key,len(weld));ids.append(weld[key])
selfpairs=[(a,b)for a,b in tree.overlap(tree)if a<b and not(set(ids[i]for i in vf[a])&set(ids[i]for i in vf[b]))]
patternP,patternF,_=surface(OUT/(S['id']+'.glb'))
from mathutils.kdtree import KDTree
kd=KDTree(len(patternP))
for i,p in enumerate(patternP):kd.insert(p,i)
kd.balance();mapping=[kd.find(p)for p in vp];maxdelta=max(x[2]for x in mapping)
r={'sourcePose':'original raw-bind T pose; no actual animation claim','assetSha256':sha(OUT/'author-export.glb'),'vertices':len(vp),'triangles':len(vf),
   'minimumTriangleAreaM2':float(areas.min()),'degenerateFaces':np.flatnonzero(areas<1e-12).tolist(),'selfNonAdjacentPairs':selfpairs,'contacts':contacts,
   'editableExportToPatternNearestPositionMaxM':maxdelta,'passedNoInitialIntersections':not selfpairs and all(not x['pairCount']for x in contacts.values()),
   'limits':['BVH triangle overlap at rest only, not continuous collision or animation admission.','No source/body/cloth visibility masks changed.','Nearest vertex distances are diagnostic, not full surface separation bounds.']}
(OUT/'source-audit.json').write_text(json.dumps(r,indent=2)+'\n',encoding='utf-8');print(json.dumps({k:v for k,v in r.items()if k not in ['contacts','selfNonAdjacentPairs']}));print('CONTACT_COUNTS',json.dumps({k:v['pairCount']for k,v in contacts.items()}),'SELF',len(selfpairs))
