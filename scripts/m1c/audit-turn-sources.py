"""Read-only audit of every pinned UAL clip; no runtime or animation edits."""
import hashlib, importlib.util, io, json, pathlib, zipfile
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('ual_source', ROOT/'scripts/qa-m1c-source.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
data = (ROOT/'analysis/assets/UAL-Standard.zip').read_bytes()
assert hashlib.sha256(data).hexdigest() == m.ZIP_SHA
archive = zipfile.ZipFile(io.BytesIO(data))
prefix = 'Universal Animation Library[Standard]/'
models = {}
for key, suffix in [('plain',''),('rm','_RM')]:
    b = archive.read(prefix+'Unreal-Godot/UAL1_Standard'+suffix+'.glb')
    assert hashlib.sha256(b).hexdigest() == m.SHAS[key]
    models[key] = m.GLB(b)
g = models['plain']; surfaces = g.foot_surfaces()
def position(w, name): return w[:,g.byname[name],:3,3]
def heading(w):
    lateral = position(w,'thigh_l')-position(w,'thigh_r')
    forward = np.cross(lateral, [0,1,0])
    return np.unwrap(np.arctan2(forward[:,0],forward[:,2]))*180/np.pi
def clean(x):
    if isinstance(x,np.ndarray):return x.tolist()
    if isinstance(x,np.generic):return x.item()
    raise TypeError(type(x))
rest,_,_=g.evaluate(None,np.array([0.]))
report = {'archiveSha256':m.ZIP_SHA,'glbSha256':m.SHAS,'license':archive.read(prefix+'License.txt').decode(),
 'method':'60 Hz including endpoints; full ancestor TRS and shortest quaternion slerp; foot skin selected by >=0.5 same-side foot/toe weights. Hip heading uses left-right thigh line cross world +Y, NOT local pelvis Euler. World RM evaluated separately.',
 'limits':['Offline source qualification only, not target-avatar or visual acceptance.','Foot near-floor intervals are geometric estimates, not force/author contact tags.','Pelvis/thigh facing in leaning/combat poses is not necessarily intended travel direction.'],
 'rest':{'hip':position(rest,'pelvis')[0],'headingDeg':heading(rest)[0],'root':g.nodes[g.byname['root']], 'footVertices':{s:sum(len(p['indices'])for p in surfaces[s])for s in surfaces}},'clips':{}}
traces={}
for a in g.j['animations']:
    name=a['name']; duration=g.duration(name); times=np.linspace(0,duration,max(2,round(duration*60)+1))
    w,_,_=g.evaluate(name,times); rw,_,_=models['rm'].evaluate(name,times)
    hip=position(w,'pelvis'); h=heading(w); rh=heading(rw); root=position(rw,'root')
    item={'duration':duration,'hipHeadingRangeDeg':[h.min(),h.max()],'headingNetDeg':h[-1]-h[0],
          'rmHeadingRangeDeg':[rh.min(),rh.max()],'rmHeadingNetDeg':rh[-1]-rh[0],
          'rmRootDelta':root[-1]-root[0],'hipRangeXYZ':np.ptp(hip,axis=0),'feet':{}}
    for side in ['l','r']:
        foot=position(w,'foot_'+side); rfoot=position(rw,'foot_'+side)
        mesh=g.skin(w,surfaces[side]); low=mesh[:,:,1].min(axis=1)
        item['feet'][side]={'ankleRangeXYZ':np.ptp(foot,axis=0),'ankleNetXYZ':foot[-1]-foot[0],
          'rmAnkleNetXYZ':rfoot[-1]-rfoot[0],'soleMinimumYRange':[low.min(),low.max()],
          'nearFloorFraction20mm':np.mean(low<.02)}
        if name in ['Idle_Loop','Walk_Loop','Walk_Formal_Loop','Dance_Loop','Interact','Punch_Cross','Sword_Attack','Sword_Idle']:
            traces[name+'_'+side+'_ankle']=foot;traces[name+'_'+side+'_rmAnkle']=rfoot;traces[name+'_'+side+'_soleMinY']=low
    report['clips'][name]=item
    if name+'_l_ankle' in traces:traces[name+'_time']=times;traces[name+'_hip']=hip;traces[name+'_heading']=h
out=ROOT/'assets-source/m1c-turn';out.mkdir(parents=True,exist_ok=True)
(out/'ual-source-audit.json').write_text(json.dumps(report,default=clean,indent=2),encoding='utf8')
np.savez_compressed(out/'ual-source-trajectories.npz',**traces)
for name,x in report['clips'].items():
    print(name, 'duration',round(x['duration'],3),'headingRange',np.round(x['hipHeadingRangeDeg'],1),'net',round(float(x['rmHeadingNetDeg']),1),'rootDelta',np.round(x['rmRootDelta'],3),'feetXZ',*[np.round(x['feet'][s]['ankleRangeXYZ'][[0,2]],3).tolist()for s in ['l','r']])
