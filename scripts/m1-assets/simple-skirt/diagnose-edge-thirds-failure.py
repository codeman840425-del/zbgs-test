"""Same frozen-output geometry diagnostic, exact refined mesh; no simulation."""
from pathlib import Path
import hashlib,json
R=Path(__file__).resolve().parents[3];source=R/'scripts/m1-assets/simple-skirt/diagnose-author-first-failure.py';text=source.read_text(encoding='utf-8');changes=[]
def replace(a,b):
    global text
    assert text.count(a)==1;(changes.append({'from':a,'to':b}));text=text.replace(a,b)
replace("A=S/'active-gap-hem-v1'","A=S/'edge-thirds-v1'")
replace("(A/'continuous-input-v1/capture.json.gz')","(S/'active-gap-hem-v1/continuous-input-v1/capture.json.gz')") if text.count("(A/'continuous-input-v1/capture.json.gz')")==1 else None
if text.count("(A/'continuous-input-v1/capture.json.gz')")==2:
    text=text.replace("(A/'continuous-input-v1/capture.json.gz')","(S/'active-gap-hem-v1/continuous-input-v1/capture.json.gz')");changes.append({'input':'same original continuous capture','count':2})
replace("A/'m1-sixfold-skirt-active-gap-hem-v1.glb'","A/'m1-sixfold-skirt-edge-thirds-v1.glb'")
exec(compile(text,str(source),'exec'),globals())
resultPath=O/'first-failure-geometry.json';result=json.loads(resultPath.read_text(encoding='utf-8'));lineage=json.loads((A/'face-lineage.json').read_text(encoding='utf-8'))['oldFaceForNewFace']
for row in result['rows']:row['parentFace']=lineage[row['skirtFace']]
result['sourceAdapter']={'originalDiagnosticSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'changes':changes,'actualSource':'edge-thirds-v1'};resultPath.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
# Directly inspect both added real solver points, not interpolated old-proxy points.
added=[]
for fr in frames:
    pp=np.array(fr['positionsWorld'])
    for ri in [1392,1393]:added.append({'frame':fr['frame'],'renderIndex':ri,'simIndex':int(mapping[ri]),**signed_nearest(pp[mapping[ri]])})
(O/'added-point-contact.json').write_text(json.dumps({'samples':added,'limits':['Actual frozen output; local nearest-body-normal sign, not global inside certificate.','No new physical evaluation.']},indent=2)+'\n',encoding='utf-8');print(json.dumps(added,indent=2))
