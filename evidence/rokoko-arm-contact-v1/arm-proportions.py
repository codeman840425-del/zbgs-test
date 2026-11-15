import importlib.util, pathlib,json,gzip,numpy as np,hashlib
def qmul(a,b):
 x,y,z,w=a;X,Y,Z,W=b;return np.array([w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z])
def qinv(a):a=np.array(a);return np.r_[-a[:3],a[3]]/np.dot(a,a)
def rot(q,v):q=np.array(q)/np.linalg.norm(q);u=q[:3];v=np.array(v);return v+2*np.cross(u,np.cross(u,v)+q[3]*v)
def matrix(q,p,scale=(1,1,1)):
 m=np.eye(4);m[:3,:3]=np.column_stack([rot(q,np.eye(3)[j])*scale[j]for j in range(3)]);m[:3,3]=p;return m
def fk(bones,qs,hip):
 world={}
 for k in SEM:
  bone=bones[k];p=bone['parentSemantic'];parent=world[p]if p else np.array(bone['actualParentWorldMatrix']).reshape(4,4).T
  world[k]=parent@matrix(qs[k],hip if k=='hips'else bone['localPosition'],bone['localScale'])
 return {k:m[:3,3].copy()for k,m in world.items()},world

O=pathlib.Path(__file__).resolve().parent
bundle=json.loads(gzip.decompress((O/'arm-inputs.json.gz').read_bytes()));source=bundle['source']
SEM=['hips','spine','chest','upperChest','neck','head']+[s+b for s in ['left','right']for b in ['Shoulder','UpperArm','LowerArm','Hand']]
sr={k:np.array(v['p'])for k,v in source['rest'].items()}
result={'scope':'Bone origins/rest proportions, not source skin collision. No adaptation.','inputFiles':bundle['inputFiles'],'targets':{}}
for b in ['female','male']:
 rig=bundle['targets'][b]['rig'];clip=bundle['targets'][b]['clip'];cap=json.load(gzip.open(O/f'{b}-actual.json.gz','rt'));bones=rig['normalizedBones'];tr={t['name']:t for t in clip['clip']['tracks']};rest,_=fk(bones,{k:bones[k]['localQuaternion']for k in SEM},bones['hips']['localPosition']);factor=rest['hips'][1]/sr['hips'][1];row={'hipHeightScale':factor,'rest':{},'samples':[]}
 for s in ['left','right']:
  chain=['upperChest',s+'Shoulder',s+'UpperArm',s+'LowerArm',s+'Hand'];row['rest'][s]={}
  for start,end in zip(chain,chain[1:]):
   sl=float(np.linalg.norm(sr[end]-sr[start])*factor);tl=float(np.linalg.norm(rest[end]-rest[start]));row['rest'][s][start+'->'+end]={'scaledSourceM':sl,'targetM':tl,'targetOverReference':tl/sl,'restVectorAngleDegrees':float(np.degrees(np.arccos(np.clip(np.dot(sr[end]-sr[start],rest[end]-rest[start])/np.linalg.norm(sr[end]-sr[start])/tl,-1,1))))}
 row['rest']['upperArmOriginWidth']={'scaledSourceM':float(np.linalg.norm(sr['leftUpperArm']-sr['rightUpperArm'])*factor),'targetM':float(np.linalg.norm(rest['leftUpperArm']-rest['rightUpperArm']))}
 for r in cap['rows']:
  i=round(r['requestedTime']*30);qs={k:np.array(tr[k+'.quaternion']['values']).reshape(-1,4)[i]for k in SEM};hp=np.array(tr['hips.position']['values']).reshape(-1,3)[i];pos,_=fk(bones,qs,hp);src=source['samples'][str(i)]['bones'];sample={'time':r['requestedTime'],'actualVsClipRelativeHipMaxM':max(float(np.linalg.norm((np.array(r['bones'][k]['p'])-r['bones']['hips']['p'])-(pos[k]-pos['hips'])))for k in SEM),'arms':{}}
  for s in ['left','right']:
   sample['arms'][s]={}
   for part in ['UpperArm','LowerArm','Hand']:
    k=s+part;sourceRel=(np.array(src[k]['p'])-src['upperChest']['p'])*factor;targetRel=pos[k]-pos['upperChest'];sample['arms'][s][part]={'sourceRelativeUpperChestM':sourceRel.tolist(),'targetRelativeUpperChestM':targetRel.tolist(),'vectorDifferenceM':float(np.linalg.norm(targetRel-sourceRel))}
  def segdist(p1,q1,p2,q2):
   # bounded least squares between bone centerlines, not skin clearance
   from scipy.optimize import lsq_linear
   u=q1-p1;v=q2-p2;r0=p2-p1;x=lsq_linear(np.column_stack([u,-v]),r0,bounds=(0,1)).x;return float(np.linalg.norm(p1+x[0]*u-p2-x[1]*v))
  sample['forearmCenterlineSeparationM']={'source':segdist(*(np.array(src[k]['p'])*factor for k in ['leftLowerArm','leftHand','rightLowerArm','rightHand'])),'target':segdist(*(pos[k]for k in ['leftLowerArm','leftHand','rightLowerArm','rightHand']))}
  row['samples'].append(sample)
 result['targets'][b]=row
(O/'arm-proportions.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps({b:{'rest':r['rest'],'actualFkError':max(x['actualVsClipRelativeHipMaxM']for x in r['samples']),'t3':r['samples'][0]['forearmCenterlineSeparationM'],'wristDiffs':[(x['time'],x['arms']['right']['Hand']['vectorDifferenceM'])for x in r['samples']]}for b,r in result['targets'].items()},indent=2))
