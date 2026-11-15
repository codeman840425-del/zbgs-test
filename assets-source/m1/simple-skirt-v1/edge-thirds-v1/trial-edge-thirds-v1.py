"""Same native trial, only explicit conforming source identity/topology changed."""
from pathlib import Path
import hashlib,json
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';O=S/'edge-thirds-v1/native-author-trial-v1';O.mkdir(exist_ok=True)
source=R/'scripts/m1-assets/simple-skirt/trial-author-cloth-v1.py';assert hashlib.sha256(source.read_bytes()).hexdigest()=='ddd5ea2793e6e80de2b3dd23b014c3e57b5592770e5b55d9855bfb35fa256be2'
text=source.read_text(encoding='utf-8');changes=[]
def replace(a,b):
    global text
    assert text.count(a)==1,(a,text.count(a));text=text.replace(a,b);changes.append({'from':a,'to':b})
replace("A=S/'active-gap-hem-v1'","A=S/'edge-thirds-v1'")
replace("asset=A/'m1-sixfold-skirt-active-gap-hem-v1.glb'","asset=A/'m1-sixfold-skirt-edge-thirds-v1.glb'")
replace("'8e0887b54bf8849d789c4f91e85be0bd5a54c706d2e5343c0a4462639042f157'","'7971187becc4a9d6503a5f998a32542259684f0ab45152d0c4b8b8b069033ee6'")
replace("inputPath=A/'continuous-input-v1/capture.json.gz'","inputPath=S/'active-gap-hem-v1/continuous-input-v1/capture.json.gz'")
replace("'activeFaces':[260,2419]","'activeFaces':[260,2423],'faceLineage':'../face-lineage.json'")
lineage=json.loads((S/'edge-thirds-v1/face-lineage.json').read_text(encoding='utf-8'))['oldFaceForNewFace'];assert lineage[:260]==list(range(260))and all(f>=260 for f in lineage[260:])
(O/'trial-adapter.json').write_text(json.dumps({'originalTrialSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'compiledTrialSha256':hashlib.sha256(text.encode()).hexdigest(),'changes':changes,'physicsParameterChanges':[],'sameInputCapture':True,'fixedDomainLineageVerified':True},indent=2)+'\n',encoding='utf-8')
exec(compile(text,str(source),'exec'),globals())
