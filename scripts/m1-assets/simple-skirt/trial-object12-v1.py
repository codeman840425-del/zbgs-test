"""One object-distance-only comparison against self025 moving; no further scan."""
from pathlib import Path
import os,json,hashlib
os.environ['SKIRT_OBSERVATION']='moving'
R=Path(__file__).resolve().parents[3];adapter=R/'scripts/m1-assets/simple-skirt/trial-self025-v1.py';wrapper=adapter.read_text(encoding='utf-8')
# Rename the nested observer's moving output before any output write.
wrapper=wrapper.replace("wrapper=wrapper.replace('native-full-observation-v1','native-self025-moving-v1')","wrapper=wrapper.replace('native-full-observation-v1','native-self025-object12-moving-v1')")
end="exec(compile(text,str(source),'exec'),globals())";assert wrapper.endswith(end+'\n');wrapper=wrapper[:-len(end+'\n')];exec(compile(wrapper,str(adapter),'exec'),globals())
replace("'clothDistanceAuthoring':.002","'clothDistanceAuthoring':.011")
replace("cc.distance_min=.002","cc.distance_min=.011")
(O/'trial-adapter.json').write_text(json.dumps({'sourceSha256':'02950240c98021c63ae78be5058d248709e7a12a4449782ecb03dd43663f9bc7','compiledTrialSha256':hashlib.sha256(text.encode()).hexdigest(),'changes':changes,'directBaseline':'native-self025-moving-v1','directBaselinePhysicsChangeOnly':{'clothDistanceAuthoring':{'old':.002,'new':.011},'colliderAuthoring':.001,'worldObjectTotalOld':.0003,'worldObjectTotalNew':.0012},'selfDistanceAuthoringUnchanged':.0025,'sourceUnchanged':True,'admissionUnchanged':True,'purpose':'One independent object thickness diagnostic; not intended to repair unsewn free return'},indent=2)+'\n',encoding='utf-8')
exec(compile(text,str(source),'exec'),globals())
