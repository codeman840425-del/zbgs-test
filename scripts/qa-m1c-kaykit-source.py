"""Offline numerical qualification of official KayKit CC0 movement sources."""
import hashlib, importlib.util, json, math, pathlib, zipfile
import numpy as np
ROOT=pathlib.Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('m1c_source',ROOT/'scripts/qa-m1c-source.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
archive=ROOT/'analysis/assets/KayKit-Character-Animations-Free-1.1.zip';data=archive.read_bytes();sha=hashlib.sha256(data).hexdigest();assert sha=='65882f31f905ad2e953819648a59287cdeab8f623908d5ef701971d3758be20f'
z=zipfile.ZipFile(archive);member='KayKit_Character_Animations_1.1/Animations/gltf/Rig_Medium/Rig_Medium_MovementBasic.glb';data=z.read(member);g=m.GLB(data)
out=ROOT/'output/playwright/m1c-source/kaykit';out.mkdir(parents=True,exist_ok=True);(out/'Rig_Medium_MovementBasic.glb').write_bytes(data);(out/'LICENSE.txt').write_bytes(z.read('KayKit_Character_Animations_1.1/License.txt'))
rest,_,_=g.evaluate(None,np.array([0.]));pos=lambda w,n:w[:,g.byname[n],:3,3];hip=pos(rest,'hips')[0,1];sur=g.foot_surfaces({'l':['foot.l','toes.l'],'r':['foot.r','toes.r']})
target=json.loads((out.parent/'source-analysis.json').read_text())['currentBodyRestRatios']
report={'sourcePage':'https://kaylousberg.itch.io/kaykit-character-animations','author':'Kay Lousberg','license':'CC0-1.0, original archive License.txt preserved','archiveSha256':sha,'glbSha256':hashlib.sha256(data).hexdigest(),'member':member,'sourceRestHipY':hip,'targetRatios':{body:v['targetHipWorldY']/hip for body,v in target.items()},'root':g.nodes[g.byname['root']],'rig':g.nodes[-1],'footVertexCounts':{s:sum(len(x['indices'])for x in v)for s,v in sur.items()},'clips':{},'caution':'Geometric near-floor motion only. This in-place pack contains no author root-speed reference; inferred contact speed is not authored RM. Character proportions differ materially from target. No live retarget or visual acceptance.'}
for name in ['Walking_A','Walking_B','Running_A','Running_B','Jump_Full_Short']:
 duration=g.duration(name);n=math.ceil(duration*240);times=np.linspace(0,duration,n+1);w,_,_=g.evaluate(name,times);feet={};heights={}
 for side in ['l','r']:
  mesh=g.skin(w,sur[side]);low=mesh[:,:,1].min(axis=1);heights[side]=low;ids=mesh[1:,:,1].argmin(axis=1);ix=np.arange(n);vel=(mesh[1:][ix,ids]-mesh[:-1][ix,ids])/(duration/n);feet[side]={'surfaceMinYRange':[low.min(),low.max()],'contacts':{},'fittedSpeed':{}}
  for threshold in [.005,.01,.02]:
   contacts=m.intervals(low[:-1]<=threshold,duration);feet[side]['contacts'][str(threshold)]=contacts
   if not contacts:continue
   event=max(contacts,key=lambda x:x['duration']);phase=(np.arange(n)/n-event['startPhase'])%1;length=event['duration']/duration;select=(phase>=length*.25)&(phase<=length*.75)&(low[:-1]<=threshold)&(low[1:]<=threshold)
   if not select.any():continue
   forward=-vel[select,2];speed=float(np.median(forward));residual=vel[select][:,[0,2]].copy();residual[:,1]+=speed
   feet[side]['fittedSpeed'][str(threshold)]={'samples':int(select.sum()),'nativeMedian':speed,'nativeP10P90':np.quantile(forward,[.1,.9]),'impliedNativeCycleDistance':speed*duration,'residualHorizontalMedian':np.median(np.linalg.norm(residual,axis=1)),'targetNativeSpeed':{body:speed*ratio for body,ratio in report['targetRatios'].items()}}
 report['clips'][name]={'duration':duration,'cadenceStepsPerMinute':120/duration,'rootRange':np.ptp(pos(w,'root'),axis=0),'hipRange':np.ptp(pos(w,'hips'),axis=0),'targetHipYRange':{body:float(np.ptp(pos(w,'hips')[:,1])*ratio)for body,ratio in report['targetRatios'].items()},'feet':feet,'doubleAirByThreshold':{str(h):m.intervals((heights['l'][:-1]>h)&(heights['r'][:-1]>h),duration)for h in [.005,.01,.02]},'loopSeam':{bone:float(np.linalg.norm(pos(w,bone)[0]-pos(w,bone)[-1]))for bone in ['hips','hand.l','hand.r','foot.l','foot.r']}}
def enc(v):
 if isinstance(v,np.ndarray):return v.tolist()
 if isinstance(v,np.generic):return v.item()
 raise TypeError(type(v))
(out/'analysis.json').write_text(json.dumps(report,default=enc,indent=2),encoding='utf8')
print(json.dumps({'sourceRestHipY':hip,'ratios':report['targetRatios'],'clips':{name:{'duration':v['duration'],'hipRange':v['hipRange'],'targetHipYRange':v['targetHipYRange'],'speeds10mm':{side:d['fittedSpeed'].get('0.01')for side,d in v['feet'].items()}}for name,v in report['clips'].items()}},default=enc,indent=2))
