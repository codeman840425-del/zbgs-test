"""Seal the single bounded male thumb warm-start attempt."""
import hashlib, json, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "assets-source/native-live-accessory-fit-v2"
V1 = ROOT / "assets-source/native-live-accessory-fit-v1"
OUT = ROOT / "evidence/native-live-accessory-fit-v2"
OUT.mkdir(parents=True, exist_ok=True)
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    grip=json.loads((SRC/'male-grip.json').read_text())
    readback=json.loads((SRC/'vrm-readback.json').read_text())
    v1=json.loads((V1/'male-grip.json').read_text())
    female=json.loads((V1/'female-grip.json').read_text())
    profile={
      'schema':'native-live-accessory-grip-profile-v2','id':'male-7586-v2-thumb-warm-start',
      'status':'cpu-source-candidate-only','runtimeApplied':False,
      'targetBodySha256':grip['avatarSha256'],'sourceGripSha256':sha(SRC/'male-grip.json'),'sourceSkinReferenceSha256':sha(SRC/'male-skin-reference.json'),
      'warmStart':{'femaleGripSha256':sha(V1/'female-grip.json'),'method':'Female semantic angle warm start mapped by VRM1 bone names; non-thumb male controls locked','v1MaleGripSha256':sha(V1/'male-grip.json')},
      'grip':{'micRawHandLocal':grip['micRawHandLocal'],'normalizedFingerRotations':grip['normalizedFingerRotations'],'metrics':grip['metrics'],'optimizerStatus':grip['status']},
      'vrmLoaderReadback':readback,
      'limits':['One bounded thumb-only warm-start attempt; no parameter sweep.','No browser/GPU visual grip acceptance, runtime registration, or controller change.','Mouth anchor reuses the separate pinned male VRM1 source measurement from v1.']
    }
    (SRC/'runtime-candidate').mkdir(exist_ok=True);(SRC/'presentation').mkdir(exist_ok=True)
    (SRC/'runtime-candidate/male-7586-v2-thumb-warm-start.json').write_text(json.dumps(profile,indent=2)+'\n')
    presentation={'schema':'native-live-accessory-presentation-candidate-v2','profileId':'male-7586-v2-thumb-warm-start','targetBodySha256':grip['avatarSha256'],'runtimeApplied':False,'mount':grip['micRawHandLocal'],'mouthSource':'assets-source/native-live-accessory-fit-v1/male-mouth.json','status':'source-candidate-awaiting-runtime-visual'}
    (SRC/'presentation/male-7586-v2-thumb-warm-start.json').write_text(json.dumps(presentation,indent=2)+'\n')
    report={'schema':'native-live-accessory-fit-v2','status':'cpu-source-candidate-only','v1Preserved':{'maleGripSha256':sha(V1/'male-grip.json'),'report':'evidence/native-live-accessory-fit-v1/report.json'},'v2':profile,'sourcePins':{'fitScript':sha(ROOT/'scripts/native-live-accessory-fit-v2/fit.py'),'verifyScript':sha(ROOT/'scripts/native-live-accessory-fit-v2/verify-vrm.mjs'),'packageScript':sha(ROOT/'scripts/native-live-accessory-fit-v2/package.py'),'maleGrip':sha(SRC/'male-grip.json'),'maleSkinReference':sha(SRC/'male-skin-reference.json'),'vrmReadback':sha(SRC/'vrm-readback.json')},'limits':profile['limits']}
    (OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'reportSha256':sha(OUT/'report.json'),'maleGripSha256':sha(SRC/'male-grip.json'),'vrmReadbackSha256':sha(SRC/'vrm-readback.json'),'maxPenetrationMm':grip['metrics']['maxPenetrationMm'],'readbackPassed':readback['passed']},indent=2))
if __name__=='__main__':main()
