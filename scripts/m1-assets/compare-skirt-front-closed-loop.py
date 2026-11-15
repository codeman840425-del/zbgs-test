"""Compare actual two-build closed-loop captures, never old hand geometry."""
import json,collections
from pathlib import Path
import numpy as np
root=Path(__file__).resolve().parents[2]
old=root/'output/skirt-front-closed-loop/175a487d5ea3-1794703574576'
new=root/'output/skirt-front-closed-loop/17bdb176154c-1794703606516'
out=root/'output/skirt-front-closed-loop/comparison-17bdb176154c';out.mkdir(exist_ok=True)
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
a,b=[read(p/'triangle-alpha-report.json') for p in [old,new]]
records=[]
for x,y in zip(a['records'],b['records']):
 assert x['frame']==y['frame'] and x['sitProgress']==y['sitProgress']
 before,after=set(x['actualPairs']),set(y['actualPairs'])
 records.append({'frame':x['frame'],'sitProgress':x['sitProgress'],'reference':len(before),'candidate':len(after),'newPairs':sorted(after-before),'removedPairs':sorted(before-after)})
result={'status':'reject-new-contact-regression','sourceBuild':a['captureBuild'],'captureBuild':b['captureBuild'],'records':records,'maxReference':max(r['reference'] for r in records),'maxCandidate':max(r['candidate'] for r in records),'framesWithNewPairs':sum(bool(r['newPairs']) for r in records),'totalNewPairEvents':sum(len(r['newPairs']) for r in records)}
(out/'triangle-alpha-report.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
caps=[root/'experiments/skirt-offline-corrective'/('front-input-'+build) for build in [a['captureBuild'],b['captureBuild']]]
data=[read(p/'capture.json') for p in caps]
assert data[0]['topology']==data[1]['topology']
for prop in ['rootWorld','hipWorld']:
 assert all(x[prop]==y[prop] for x,y in zip(data[0]['frames'],data[1]['frames']))
assert (caps[0]/'source.f32').read_bytes()==(caps[1]/'source.f32').read_bytes()
positions=[np.fromfile(p/'displayed.f32',dtype='<f4').reshape(270,-1,3).astype('f8') for p in caps]
delta=np.linalg.norm(positions[1]-positions[0],axis=2);at=np.unravel_index(delta.argmax(),delta.shape)
temporal=[]
for p in positions:
 d=np.linalg.norm(np.diff(p,axis=0),axis=2);i=np.unravel_index(d.argmax(),d.shape)
 temporal.append({'maximumMetresPer1over30Second':float(d[i]),'toFrame':int(i[0])+2,'vertex':int(i[1]),'vertex720MaxMetres':float(d[:,720].max())})
summary={k:v for k,v in result.items() if k!='records'}
summary.update({'rootHipSourceSkirtExactMatch':True,'sameFrameShapeDelta':{'maxMetres':float(delta[at]),'frame':int(at[0])+1,'vertex':int(at[1]),'notATemporalJump':True},'temporalActualWorldDisplacement':dict(zip([a['captureBuild'],b['captureBuild']],temporal)),'limits':['Finite sampled triangle crossings, not CCD, nearest GLB alpha; coplanar/interior overlap classification incomplete.','Both include actual same-build live hand-fit, neither uses old hand surface substitution.','83mm denotes candidate-source same-frame difference; temporal motion includes ordinary body motion and is separately reported.']})
(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8');print(json.dumps(summary,indent=2))
