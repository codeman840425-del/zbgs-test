"""Only frozen output comparison; object distance is independent from self025 baseline."""
from pathlib import Path
import json
R=Path(__file__).resolve().parents[3];A=R/'assets-source/m1/simple-skirt-v1/two-quad-thirds-v1';src=R/'scripts/m1-assets/simple-skirt/analyze-two-quad-observations-v1.py';s=src.read_text().replace("['native-full-observation-v1','native-static-control-v1']","['native-self025-object12-moving-v1']");exec(compile(s,str(src),'exec'),{'__file__':str(src)})
o=json.loads((A/'native-self025-moving-v1/comparison-curves.json').read_text());n=json.loads((A/'native-self025-object12-moving-v1/comparison-curves.json').read_text());rows=[]
for a,b in zip(o['rows'],n['rows']):
 assert a['frame']==b['frame'] and a['sourceActionSeconds']==b['sourceActionSeconds'];rows.append({'frame':a['frame'],'actionSeconds':a['sourceActionSeconds'],'object03':a,'object12':b})
r={'sourceUnchanged':True,'baseline':'native-self025-moving-v1','candidate':'native-self025-object12-moving-v1','selfAuthoringBoth':.0025,'worldObjectTotal':{'old':.0003,'new':.0012},'oldFirstFailure':o['firstFailure'],'newFirstFailure':n['firstFailure'],'oldFirstMaterial':o['firstMaterialFailure'],'newFirstMaterial':n['firstMaterialFailure'],'matchedRows':rows,'conclusion':'Object thickness changes contact response but fails admission and hits hard stretch stop earlier; no further configuration scan.'};(A/'native-self025-object12-moving-v1/same-time-comparison.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(rows[-1]))
