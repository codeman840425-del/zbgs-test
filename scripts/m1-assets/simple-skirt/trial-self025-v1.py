"""One matched self-contact thickness comparison on frozen029 source."""
from pathlib import Path
import hashlib,json
R=Path(__file__).resolve().parents[3]
observer=R/'scripts/m1-assets/simple-skirt/trial-two-quad-observation-v1.py';wrapper=observer.read_text(encoding='utf-8')
wrapper=wrapper.replace('native-full-observation-v1','native-self025-moving-v1').replace('native-static-control-v1','native-self025-static-v1')
wrapper=wrapper.replace("        assert equal,'First18 changed: stop without retry'", "        # Controlled physical setting differs; record actual old/new positions, do not assert equality.")
end="exec(compile(text,str(source),'exec'),globals())";assert wrapper.endswith(end+'\n');wrapper=wrapper[:-len(end+'\n')]
exec(compile(wrapper,str(observer),'exec'),globals())
replace("'selfDistanceAuthoring':.005","'selfDistanceAuthoring':.0025")
replace("cc.self_distance_min=.005","cc.self_distance_min=.0025")
(O/'trial-adapter.json').write_text(json.dumps({'sourceSha256':'02950240c98021c63ae78be5058d248709e7a12a4449782ecb03dd43663f9bc7','observerSha256':hashlib.sha256(observer.read_bytes()).hexdigest(),'compiledTrialSha256':hashlib.sha256(text.encode()).hexdigest(),'changes':changes,'physicsParameterChanges':[{'name':'self_distance_min','oldAuthoring':.005,'newAuthoring':.0025,'scale':10,'worldPairTriggerMetres':.0005,'worldResponseTargetMetres':.0005*8/9}],'objectDistanceUnchangedMetres':.0003,'sourceUnchanged':True,'admissionUnchanged':True,'mode':mode,'purpose':'Source-compatible contact-thickness diagnostic; zero crossing and1.25 material admission unchanged.'},indent=2)+'\n',encoding='utf-8')
exec(compile(text,str(source),'exec'),globals())
