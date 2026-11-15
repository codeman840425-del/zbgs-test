"""Bounded actual-surface diagnosis, no fitting or generation."""
from pathlib import Path
import gzip,json,struct,sys
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';G=S/(sys.argv[sys.argv.index('--candidate-dir')+1] if '--candidate-dir'in sys.argv else 'generated-v2')
cap=json.loads(gzip.decompress((S/'input-269/four-poses.json.gz').read_bytes()));geo=json.loads(gzip.decompress((G/'four-pose-geometry.json.gz').read_bytes()));gate=json.loads((G/'four-pose-gate.json').read_text(encoding='utf-8'));frame=cap['frames'][0];row=gate['poses'][0]
raw=(R/'prototype/public/assets/foundation/base-female-roundtrip.vrm').read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);binary=raw[28+n:]
def read(index):
 a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];width={'SCALAR':1,'VEC4':4}[a['type']];dtype=np.dtype({5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]);return np.ndarray((a['count'],width),dtype=dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',width*dtype.itemsize),dtype.itemsize)).copy()
primitive=doc['meshes'][0]['primitives'][0];raw_faces=read(primitive['indices']).reshape(-1,3);joints=read(primitive['attributes']['JOINTS_0']);weights=read(primitive['attributes']['WEIGHTS_0']);names=[doc['nodes'][i]['name']for i in doc['skins'][0]['joints']]
def region(face):
 totals={}
 for vertex in raw_faces[face]:
  for joint,w in zip(joints[vertex],weights[vertex]):totals[names[joint]]=totals.get(names[joint],0)+float(w)
 return max(totals,key=totals.get)
body=next(x for x in frame['colliders']if x['name']=='Bodybaked');bp=np.array(body['positions']).reshape(-1,3);bf=np.array(body['triangles']).reshape(-1,3);tree=BVHTree.FromPolygons(bp.tolist(),bf.tolist(),all_triangles=True)
inverse=np.linalg.inv(np.array(frame['bones']['J_Bip_C_Hips']).reshape(4,4).T);records=[]
for i,p in enumerate(geo['poses'][0]):
 q,normal,face,distance=tree.find_nearest(Vector(p));signed=float((Vector(p)-q).dot(normal))
 if signed<-.0001:
  records.append({'candidateVertex':i,'sourceRow':i//121,'world':p,'hipsLocal':(inverse@np.r_[p,1])[:3].tolist(),'bodyFace':face,'bodyDominantBone':region(face),'nearestActualSurface':list(q),'signedNearestNormalMetres':signed,'nearestDistanceMetres':distance,'bodyTriangleWorld':bp[bf[face]].tolist()})
records.sort(key=lambda r:r['signedNearestNormalMetres']);categories={}
for r in records:
 cat=r['bodyDominantBone'];v=categories.setdefault(cat,{'negativeSamples':0,'minimumSignedNormalMetres':0});v['negativeSamples']+=1;v['minimumSignedNormalMetres']=min(v['minimumSignedNormalMetres'],r['signedNearestNormalMetres'])
hits=next(c for c in row['collisions']if c['name']=='Bodybaked');faces=sorted(set(b for a,b in hits['candidatePairs']));regions={}
for f in faces:regions[region(f)]=regions.get(region(f),0)+1
top=next(c for c in row['collisions']if c['name']=='m1-uniform-top_1')
diagnosis=json.loads((S/'bind-and-waist-weight-diagnosis.json').read_text(encoding='utf-8'))['waistWeightDiagnostic'][0]
waist_comparison=[]
for index,(a,b)in enumerate(zip(diagnosis['originalWeightedWorld'],diagnosis['hipsOnlyWorld'])):
    values=[]
    for point in [a,b]:
        nearest,n,face,distance=tree.find_nearest(Vector(point));values.append({'signedNearestNormalMetres':float((Vector(point)-nearest).dot(n)),'bodyFace':face,'point':point,'nearest':list(nearest)})
    waist_comparison.append({'sourceWaistPoint':index,'originalSourceWeights':values[0],'candidateHipsOnly':values[1]})
out={'sameSourceWaistPointWeightCounterfactual':waist_comparison,'build':'269a73423c97','candidateSha256':geo['candidateSha256'],'pose':'standing','bodyPairCount':len(hits['candidatePairs']),'bodyUniqueFacesByDominantBone':regions,'vertexSignedSamples':categories,'representativeNegativeSamples':records[:12],'waistRepresentatives':sorted([r for r in records if r['sourceRow']<4],key=lambda r:r['signedNearestNormalMetres'])[:4],'top':{'allPairs':top['candidatePairCount'],'knownOriginalCapPairs':len(top['knownOriginalTopCapPairs']),'otherPairs':len(top['otherPairs'])},'limits':['Nearest-triangle oriented distance is a representative local sample, not watertight volume penetration or CCD.','All source skin retained. Alpha/exposure not inferred from pair counts.','Dominant skin bone is a coarse anatomical label, not an artist region boundary.']}
(G/'standing-classification.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf-8');print(json.dumps({k:v for k,v in out.items()if k not in ['representativeNegativeSamples','waistRepresentatives','sameSourceWaistPointWeightCounterfactual']},indent=2))
