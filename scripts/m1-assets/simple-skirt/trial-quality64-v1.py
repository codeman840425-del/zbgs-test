"""One temporal-resolution convergence check, fixed physical settings and realtime input."""
from pathlib import Path
import os,json,hashlib
os.environ['SKIRT_OBSERVATION']='moving';R=Path(__file__).resolve().parents[3];adapter=R/'scripts/m1-assets/simple-skirt/trial-linear-scale-v1.py';wrapper=adapter.read_text(encoding='utf-8').replace('native-linear-scale-moving-v1','native-quality64-moving-v1');end="exec(compile(text,str(source),'exec'),globals())";assert wrapper.endswith(end+'\n');wrapper=wrapper[:-len(end+'\n')];exec(compile(wrapper,str(adapter),'exec'),globals())
replace("'quality':8","'quality':64")
replace('s.quality=8;','s.quality=64;')
(O/'trial-adapter.json').write_text(json.dumps({'sourceSha256':'02950240c98021c63ae78be5058d248709e7a12a4449782ecb03dd43663f9bc7','compiledTrialSha256':hashlib.sha256(text.encode()).hexdigest(),'changes':changes,'directBaseline':'native-linear-scale-moving-v1','onlySettingChange':{'quality':[8,64]},'sameRealInputTimes':True,'sameMappingAndMaterialAndDistances':True,'reason':'Independently measured pin30Hz step15.737mm gives nominalperinternalstep1.967mm at8 vs.246mm at64; objecttotal1.2mm. This is a single motiondiscretization test, not proof of CCD or guaranteed convergence.','hardTimeoutSeconds':60,'threads':2,'admissionUnchanged':True,'diagnosticEdgeHardStop':2.0},indent=2)+'\n',encoding='utf-8')
exec(compile(text,str(source),'exec'),globals())
