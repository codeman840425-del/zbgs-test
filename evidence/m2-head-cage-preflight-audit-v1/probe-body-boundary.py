"""CPU body-factor equivalence and head weight support using actual source endpoints."""
import ast,hashlib,importlib.util,json,sys,types
from pathlib import Path
sys.dont_write_bytecode=True
import numpy as np
from scipy.spatial import cKDTree
ROOT=Path('F:/gamemake-representative-head-cage');OUT=Path(__file__).resolve().parent
BASE=ROOT/'assets-source/m2-representative-head-cage-v1'
path=ROOT/'scripts/m2-representative-head-cage-v1/body.py'
module_spec=importlib.util.spec_from_file_location('head_trial_body',path)
body=importlib.util.module_from_spec(module_spec);module_spec.loader.exec_module(body)
sys.path.insert(0,str(ROOT/'scripts/production'))
from flow import GLB
spec=json.loads((BASE/'spec.json').read_bytes());rows=[]
assert spec['requests']==json.loads((ROOT/spec['sourceSpec']['path']).read_bytes())['variants']
head_path=ROOT/'scripts/m2-representative-head-cage-v1/head.py'
cls=next(n for n in ast.parse(head_path.read_bytes()).body if isinstance(n,ast.ClassDef) and n.name=='Head')
weights_node=next(n for n in cls.body if isinstance(n,ast.FunctionDef) and n.name=='weights')
namespace={'np':np,'legacy':body.legacy};exec(compile(ast.Module([weights_node],[]),str(head_path),'exec'),namespace)
class NearestAnchors:
    def __init__(self,points):self.points=points;self.tree=cKDTree(points)
    def find(self,point):
        distance,index=self.tree.query(point)
        return self.points[index],int(index),float(distance)
reference=body.reference_body()
for sex,source in spec['sources'].items():
    g=GLB((ROOT/source['body']['path']).read_bytes());context=body.legacy.source_context(g)
    groups={}
    for mesh in g.doc['meshes']:
        for p in mesh['primitives']:groups.setdefault(p['attributes']['POSITION'],[]).append(p)
    endpoints={};eyes=[];hair=[]
    for accessor,primitives in groups.items():
        P=np.asarray(g.accessor(accessor),float)
        ends=[P]+[P+np.asarray(g.accessor(t['POSITION']),float) for t in primitives[0].get('targets',[])]
        endpoints[accessor]=ends
        for p in primitives:
            name=g.doc['materials'][p['material']]['name']
            dest=eyes if any(t in name for t in ['_EYE','Eyeline','Eyelash']) else hair if 'HAIR' in name else None
            if dest is not None:
                ids=np.unique(g.accessor(p['indices']));dest.extend(E[ids] for E in ends)
    checks=[];extremities=body.extremity_indices(g)
    for request in [r for r in spec['requests'] if r['sex']==sex]:
        error=0.;distal=0.;count=0
        for accessor,ends in endpoints.items():
            for E in ends:
                D=body.body_displacement(E,request['parameters'],context)
                error=max(error,float(np.max(abs(E+D-reference(E,request['parameters'],context)))))
                distal=max(distal,float(np.linalg.norm(D[extremities[accessor]],axis=1).max(initial=0)))
                count+=len(E)
        assert error==0 and distal==0
        checks.append({'id':request['basePresetId'],'pointEndpointSamples':count,'bodyComponentErrorM':error,'distalComponentMaximumDisplacementM':distal})
    eyes=np.unique(np.concatenate(eyes).astype(np.float32),axis=0);hair=np.unique(np.concatenate(hair).astype(np.float32),axis=0)
    face=next(p for ps in groups.values() for p in ps if 'Face_00_SKIN' in g.doc['materials'][p['material']]['name'])
    faceP=np.asarray(g.accessor(face['attributes']['POSITION']),float);head=context['joints']['head']
    face_lo=float(faceP[np.unique(g.accessor(face['indices'])),1].min()-head[1])
    neck_start=context['joints']['neck'][1]-head[1]-.005;neck_end=face_lo-.01
    upper_start=float(eyes[:,1].min()-head[1]+.012)
    lower_hair=hair[hair[:,1]-head[1]<.025]
    self=types.SimpleNamespace(H=head,neck_start=neck_start,neck_end=neck_end,upper_start=upper_start,upper_end=upper_start+.03,
        rear_end=float(lower_hair[:,2].min()-head[2]-.001),anchors=NearestAnchors(np.unique(np.concatenate([eyes,hair]),axis=0)),setup=spec['setup'])
    weight=lambda P:namespace['weights'](self,P)
    assert np.max(weight(eyes))==np.max(weight(hair))==0
    skin=next(p for ps in groups.values() for p in ps if 'Body_00_SKIN' in g.doc['materials'][p['material']]['name'])
    P=np.asarray(g.accessor(skin['attributes']['POSITION']),float);used=np.unique(g.accessor(skin['indices']))
    active=used[(abs(P[used,0]-head[0])>.15)&(weight(P.astype(np.float32))[used]>0)]
    assert len(active)==0
    pair_weights=None
    if sex=='male':
        ids=[150,154,155,1375,1370,1372]
        E=endpoints[face['attributes']['POSITION']][1]
        pair_weights=weight(E.astype(np.float32))[ids].tolist();assert pair_weights==[1]*6
    rows.append({'sex':sex,'bodyOnlyChecks':checks,'bodyReferenceScope':'Actual v2 Mapper.field statements before its face source variable. Full original parameters retained. No face_curve call or face-zero bypass.','endpointArrays':sum(map(len,endpoints.values())),
        'weightSupport':{'neckStartHeadLocalY':float(neck_start),'neckEndHeadLocalY':neck_end,'upperStartHeadLocalY':upper_start,'upperEndHeadLocalY':upper_start+.03,'rearEndHeadLocalZ':self.rear_end,
            'eyeAnchorPoints':len(eyes),'hairAnchorPoints':len(hair),'eyeAndHairAnchorMaximumWeight':0,'referencedBodySkinOutsideX15cmWithPositiveHeadWeight':len(active),'failurePairWeights':pair_weights},
        'weightCheckScope':'Actual Head.weights AST with cKDTree nearest distances on actual float32 source endpoint anchors. Checks support and saturated/zero weights, not bitwise reproduction of mathutils KDTree or Blender modifier.'})
(OUT/'body-boundary-probe.json').write_bytes((json.dumps({'sources':rows,'blenderExecuted':False},indent=2)+'\n').encode())
print(json.dumps({'bodyRequests':sum(len(r['bodyOnlyChecks']) for r in rows),'bodyError':0,'distalError':0,'eyesHairAnchorWeights':0,'malePairWeights':rows[1]['weightSupport']['failurePairWeights']}))
