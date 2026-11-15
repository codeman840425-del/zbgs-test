"""Read-only same-source/same-time comparison, no new physics."""
from pathlib import Path
import json,hashlib
R=Path(__file__).resolve().parents[3];A=R/'assets-source/m1/simple-skirt-v1/two-quad-thirds-v1';analysis=R/'scripts/m1-assets/simple-skirt/analyze-two-quad-observations-v1.py';s=analysis.read_text().replace('native-full-observation-v1','native-self025-moving-v1').replace('native-static-control-v1','native-self025-static-v1');exec(compile(s,str(analysis),'exec'),{'__file__':str(analysis)})
for mode,old,new in [('static','native-static-control-v1','native-self025-static-v1'),('moving','native-full-observation-v1','native-self025-moving-v1')]:
 o=json.loads((A/old/'comparison-curves.json').read_text());n=json.loads((A/new/'comparison-curves.json').read_text());rows=[]
 for a,b in zip(o['rows'],n['rows']):
  assert a['frame']==b['frame'] and a['sourceActionSeconds']==b['sourceActionSeconds']
  rows.append({'frame':a['frame'],'actionSeconds':a['sourceActionSeconds'],'old':a,'new':b})
 report={'mode':mode,'baseline':old,'candidate':new,'sourceSha256':'02950240c98021c63ae78be5058d248709e7a12a4449782ecb03dd43663f9bc7','physicalChangeOnly':'selfDistanceAuthoring.005to.0025; object total.003author unchanged','oldFirstFailure':o['firstFailure'],'newFirstFailure':n['firstFailure'],'oldFirstMaterial':o['firstMaterialFailure'],'newFirstMaterial':n['firstMaterialFailure'],'oldFrameCount':o['frames'],'newFrameCount':n['frames'],'matchedRows':rows,'conclusion':'No admission or substantial improvement: same first contact/material timing and similar resting separation. Different terminal times must not be compared as same pose.'}
 (A/new/'same-time-comparison.json').write_text(json.dumps(report,indent=2)+'\n')
