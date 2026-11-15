"""One bounded diagnostic continuation; zero-contact gate remains permanently failed."""
from pathlib import Path
import hashlib,json
R=Path(__file__).resolve().parents[3];S=R/'assets-source/m1/simple-skirt-v1';O=S/'two-quad-thirds-v1/native-author-trial-v1';O.mkdir(exist_ok=True)
source=R/'scripts/m1-assets/simple-skirt/trial-author-cloth-v1.py';assert hashlib.sha256(source.read_bytes()).hexdigest()=='ddd5ea2793e6e80de2b3dd23b014c3e57b5592770e5b55d9855bfb35fa256be2';text=source.read_text(encoding='utf-8');changes=[]
def replace(a,b):
    global text
    assert text.count(a)==1,(a,text.count(a));text=text.replace(a,b);changes.append({'from':a,'to':b})
replace("A=S/'active-gap-hem-v1'","A=S/'two-quad-thirds-v1'")
replace("asset=A/'m1-sixfold-skirt-active-gap-hem-v1.glb'","asset=A/'m1-sixfold-skirt-two-quad-thirds-v1.glb'")
replace("'8e0887b54bf8849d789c4f91e85be0bd5a54c706d2e5343c0a4462639042f157'","'02950240c98021c63ae78be5058d248709e7a12a4449782ecb03dd43663f9bc7'")
replace("inputPath=A/'continuous-input-v1/capture.json.gz'","inputPath=S/'active-gap-hem-v1/continuous-input-v1/capture.json.gz'")
replace("'activeFaces':[260,2419]","'activeFaces':[260,2439],'faceLineage':'../face-lineage.json'")
replace("preparation={'sourceSha256'","preparation={'diagnosticContinueAfterContactFailure':True,'sourceSha256'")
replace("results=[];reason=None","results=[];reason=None;firstFailure=None")
replace("for i,frame in enumerate(frames):\n    scene.frame_set","for i,frame in enumerate(frames):\n    reason=None\n    scene.frame_set")
replace(";results.append(row)",";row['exactColliderPairs']=pairs;row['exactSelfPairs']=selfPairs;results.append(row)")
replace("    if reason:\n        (O/'rejected-shape.json.gz').write_bytes(gzip.compress(json.dumps({'reason':reason,'frame':row,'exactColliderPairs':pairs,'exactSelfPairs':selfPairs}).encode(),mtime=0));break",
"    if reason:\n        if firstFailure is None:\n            firstFailure={'reason':reason,'frame':i+1,'simulationSeconds':i/30}\n            (O/'rejected-shape.json.gz').write_bytes(gzip.compress(json.dumps({'reason':reason,'frame':row,'exactColliderPairs':pairs,'exactSelfPairs':selfPairs}).encode(),mtime=0))\n        if reason!='actual-triangle-crossing':break")
replace("result={'status':'rejected'if reason else'completed-author-curves-unreviewed','reason':reason,", "result={'status':'rejected'if firstFailure or reason else'completed-author-curves-unreviewed','reason':firstFailure['reason']if firstFailure else reason,'firstFailure':firstFailure,'terminationReason':'completed60-diagnostic-frames'if len(results)==60 else reason,")
lineage=json.loads((S/'two-quad-thirds-v1/face-lineage.json').read_text(encoding='utf-8'))['oldFaceForNewFace'];assert lineage[:260]==list(range(260))and all(f>=260 for f in lineage[260:])
(O/'trial-adapter.json').write_text(json.dumps({'originalTrialSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'compiledTrialSha256':hashlib.sha256(text.encode()).hexdigest(),'changes':changes,'physicsParameterChanges':[],'zeroCrossingGateChanged':False,'policy':'First crossing permanently rejects and is preserved; continue observation only unless structural/material/pin/time failure.','sameInputCapture':True,'fixedDomainLineageVerified':True},indent=2)+'\n',encoding='utf-8');exec(compile(text,str(source),'exec'),globals())
