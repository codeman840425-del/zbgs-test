"""Adapt fixed existing 270 actual-pose harness; no collision/sample math changes."""
from pathlib import Path
import json,hashlib
R=Path(__file__).resolve().parents[3];P=Path(__file__).resolve().parents[1]
source=R/'assets-source/forearm-collision-v2/scripts/qa-forearm-runtime.cjs';s=source.read_text(encoding='utf8');original=s
edits=[
("const expected=expectations(),out=path.join(root,'output/playwright/forearm-'+expected.build);", "const expected=expectations(),proofMode=process.env.QA_HAND_ALPHA||'actual';if(!['legacy','actual'].includes(proofMode))throw Error('Bad proof mode');const out=path.join(root,'output/playwright/hand-contact-'+expected.build,'alpha-equivalence-'+proofMode);"),
("path.join(__dirname,'../runtime-fixture.json')", "path.join(root,'assets-source/forearm-collision-v2/runtime-fixture.json')"),
("const compareTargets=process.env.QA_FOREARM_TARGET_COMPARE==='1'", "const compareTargets=true"),
("'?forearm=calibrated&handTarget='+mode", "'?forearm=calibrated&handSkin=actual&handAlpha='+proofMode+'&handTarget='+mode"),
("{identity,finalIdentity,mode,comparison:","{identity,finalIdentity,proofMode,mode,comparison:"),
]
for a,b in edits:
 assert s.count(a)==1,a
 s=s.replace(a,b)
out=P/'scripts/qa-alpha-runtime.cjs';out.write_text(s,encoding='utf8',newline='\n')
(P/'alpha-proof/runtime-adapter.json').write_text(json.dumps({'source':str(source.relative_to(R)),'sourceNormalizedLFSHA256':hashlib.sha256(original.encode()).hexdigest(),'adaptedRawSHA256':hashlib.sha256(out.read_bytes()).hexdigest(),'scope':'mode/query/output paths only; original real 270 sampling retained'},indent=2)+'\n',encoding='utf8')
