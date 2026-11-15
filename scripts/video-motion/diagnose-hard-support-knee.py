"""Read-only cause check for the frozen failed170->171 knee jump; stdlib only."""
from pathlib import Path
import json,math
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets-source/video-dance-hard-support-v5'
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
def dot(a,b):return sum(x*y for x,y in zip(a,b))
def sub(a,b):return [x-y for x,y in zip(a,b)]
def length(a):return math.sqrt(dot(a,a))
def unit(a):return [x/length(a) for x in a]
def angle(a,b):return math.degrees(math.acos(max(-1,min(1,dot(a,b)/length(a)/length(b)))))
def mult(A,B):return [[sum(A[i][k]*B[k][j] for k in range(4)) for j in range(4)] for i in range(4)]
def transposed(flat):return [[flat[j*4+i] for j in range(4)] for i in range(4)]
def pos(W):return [W[j][3] for j in range(3)]
def localvec(M,v):return [sum(M[j][i]*v[j] for j in range(3)) for i in range(3)]
def slerp(a,b,t):
 d=dot(a,b)
 if d<0:b=[-x for x in b];d=-d
 if d>.999999:return unit([(1-t)*x+t*y for x,y in zip(a,b)])
 theta=math.acos(max(-1,min(1,d)));return [(math.sin((1-t)*theta)*x+math.sin(t*theta)*y)/math.sin(theta) for x,y in zip(a,b)]
def matrix(q,p):
 x,y,z,w=q
 return [[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),p[0]],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),p[1]],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y),p[2]],[0,0,0,1]]
results=[]
for body in ('female','male'):
 rig=read(ROOT/f'assets-source/video-target-adaptation-v1/{body}-normalized-rig.json');bones=rig['normalizedBones'];asset=read(ROOT/f'assets-source/video-dance-forefoot-v4/{body}-dance-forefoot-v4.json');target=read(OUT/f'{body}-world-reference.json');idx={s:i for i,s in enumerate(target['names'])};tracks={t['name']:t['values'] for t in asset['clip']['tracks']};rootParent=transposed(bones['hips']['actualParentWorldMatrix']);rows=[]
 for f in [170,170.25,170.5,170.75,171]:
  k=int(math.floor(f))-138;t=f-math.floor(f);base={}
  def calc(s):
   if s in base:return base[s]
   vals=tracks[s+'.quaternion'];q=vals[k*4:k*4+4] if t==0 else slerp(vals[k*4:k*4+4],vals[(k+1)*4:(k+1)*4+4],t)
   if s=='hips':v=tracks['hips.position'];p=[(1-t)*v[k*3+i]+t*v[min(k+1,72)*3+i] for i in range(3)]
   else:p=bones[s]['localPosition']
   parent=bones[s]['parentSemantic'];base[s]=mult(calc(parent) if parent else rootParent,matrix(q,p));return base[s]
  for s in bones:calc(s)
  nw=target['world'][round((f-138)*4)];H=pos(nw[idx['leftUpperLeg']]);K=pos(nw[idx['leftLowerLeg']]);A=pos(nw[idx['leftFoot']]);oldH,oldK,oldA=[pos(base[s]) for s in ('leftUpperLeg','leftLowerLeg','leftFoot')]
  axis=unit(sub(A,H));b=sub(oldK,oldH);projection=[x-dot(b,axis)*a for x,a in zip(b,axis)]
  oldAxis=unit(sub(oldA,oldH));oldBend=[x-dot(b,oldAxis)*a for x,a in zip(b,oldAxis)]
  newB=sub(K,H);newBend=[x-dot(newB,axis)*a for x,a in zip(newB,axis)]
  rows.append({'sourceFrameFraction':f,'originalKneePlaneRadiusM':length(oldBend),'newKneePlaneRadiusM':length(newBend),'projectedReferenceVectorLengthM':length(projection),'oldPlaneInHipLocal':unit(localvec(base['hips'],oldBend)),'chosenPlaneInHipLocal':unit(localvec(base['hips'],projection)),'originalKneeFlexionDeg':angle(sub(oldK,oldH),sub(oldA,oldK)),'newKneeFlexionDeg':angle(sub(K,H),sub(A,K)),'oldKneeWorld':oldK,'newKneeWorld':K,'newRootY':pos(nw[idx['hips']])[1],'rootDeltaY':pos(nw[idx['hips']])[1]-pos(base['hips'])[1]})
 for i,row in enumerate(rows):
  if i:row['chosenPlaneChangeFromPreviousDeg']=angle(rows[i-1]['chosenPlaneInHipLocal'],row['chosenPlaneInHipLocal']);row['originalPlaneChangeFromPreviousDeg']=angle(rows[i-1]['oldPlaneInHipLocal'],row['oldPlaneInHipLocal'])
 results.append({'body':body,'rows':rows,'originalHipLocalKneePlane170to171Deg':angle(rows[0]['oldPlaneInHipLocal'],rows[-1]['oldPlaneInHipLocal']),'chosenHipLocalKneePlane170to171Deg':angle(rows[0]['chosenPlaneInHipLocal'],rows[-1]['chosenPlaneInHipLocal']),'minimumReferenceProjectionLengthM':min(r['projectedReferenceVectorLengthM'] for r in rows),'originalKneeDisplacement170to171M':length(sub(rows[-1]['oldKneeWorld'],rows[0]['oldKneeWorld'])),'newKneeDisplacement170to171M':length(sub(rows[-1]['newKneeWorld'],rows[0]['newKneeWorld']))})
result={'scope':'Read-only frozen failedv5. No solver rerun, new weights/nodes, branch patch or new motion.','findings':['IK projected-reference vector does not approach its1e-10 zero guard at the sampled critical quarter times; not evidence of division-by-zero or an antipodal swing branch.','Original v4 hip-relative knee bend-plane changes sharply across170->171. The per-time IK copied/reprojected that direction, without a temporal/anatomical branch constraint. Greater knee flexion from a147mm root depression amplifies the knee travel and quaternion jump.','The minimum-curvature objective with only1e-8 displacement regularization permits a deep middle-interval root sag. This is an underconstrained objective/pose-prior failure, not proof the hard support positions are mathematically incompatible.','A different model would need joint-space knee-plane continuity/angle bounds within the solve and meaningful bounds or prioritization of root displacement; adding weights until a single bad frame looks good is not authorized.'], 'results':results}
(OUT/'knee-cause-diagnosis.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps([{k:v for k,v in x.items() if k!='rows'} for x in results],indent=2))
