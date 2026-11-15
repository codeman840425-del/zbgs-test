"""One verified author-unit linear stiffness correction; same ring map baseline."""
from pathlib import Path
import hashlib,json
R=Path(__file__).resolve().parents[3];adapter=R/'scripts/m1-assets/simple-skirt/trial-single-layer-v1.py';wrapper=adapter.read_text(encoding='utf-8').replace('native-single-layer-moving-v1','native-linear-scale-moving-v1').replace('native-single-layer-static-v1','native-linear-scale-static-v1');end="exec(compile(text,str(source),'exec'),globals())";assert wrapper.endswith(end+'\n');wrapper=wrapper[:-len(end+'\n')];exec(compile(wrapper,str(adapter),'exec'),globals())
start=text.index('def rebuildRender(q):');stop=text.index('assert np.max(np.linalg.norm(rebuildRender',start);old=text[start:stop]
new=r"""ringPath=A/'ring-frame-reconstruction-v1/mapping.json';ringMap=json.loads(ringPath.read_text());assert ringMap['sourceSha256']==hashlib.sha256(raw).hexdigest()
def rebuildRender(q):
    full=np.empty((len(points),3));full[authorKeep]=q
    for rec in ringMap['records']:
        b,u,prev,nxt=rec['frameOldSim'];up=full[u]-full[b];un=np.linalg.norm(up);assert un>1e-9,'Degenerate ring up';up/=un;t=full[nxt]-full[prev];t-=up*np.dot(up,t);tn=np.linalg.norm(t);assert tn>1e-9,'Degenerate ring tangent';t/=tn;n=np.cross(up,t);full[rec['innerOldSim']]=full[b]+np.stack([up,t,n],axis=1)@np.array(rec['coeffUpTangentNormalMetres'])
    return full
"""
replace(old,new)
replace('s.tension_stiffness=15;s.compression_stiffness=15;s.shear_stiffness=8;', 's.tension_stiffness=150;s.compression_stiffness=150;s.shear_stiffness=80;')
replace("'authorMappingSha256':hashlib.sha256(mappingPath.read_bytes()).hexdigest()", "'renderReturnMappingSha256':hashlib.sha256(ringPath.read_bytes()).hexdigest(),'authorMappingSha256':hashlib.sha256(mappingPath.read_bytes()).hexdigest()")
replace("'self':cc.self_distance_min}", "'self':cc.self_distance_min},'actualBlenderMaterial':{'tension':s.tension_stiffness,'compression':s.compression_stiffness,'shear':s.shear_stiffness,'bending':s.bending_stiffness,'mass':s.mass,'airDamping':s.air_damping,'quality':s.quality,'collisionQuality':cc.collision_quality},'normalizedLinearBaseAtScale1':{'tension':s.tension_stiffness/scale,'compression':s.compression_stiffness/scale,'shear':s.shear_stiffness/scale}")
(O/'trial-adapter.json').write_text(json.dumps({'sourceSha256':'02950240c98021c63ae78be5058d248709e7a12a4449782ecb03dd43663f9bc7','compiledTrialSha256':hashlib.sha256(text.encode()).hexdigest(),'changes':changes,'sameMappingOldParameterBaseline':'ring-frame-'+mode+'-v1','authorMeshUnchangedFromSingleLayer':True,'physicsOnlyChange':{'tension':[15,150],'compression':[15,150],'shear':[8,80]},'bendingUnchanged':.6,'selfAuthoringUnchanged':.0025,'objectAuthoringUnchanged':[.011,.001],'reason':'Verified avg_spring_len scale normalization: author units10 require linearbase10. Not parameter search.','admissionUnchanged':True,'mode':mode},indent=2)+'\n',encoding='utf-8')
exec(compile(text,str(source),'exec'),globals())
