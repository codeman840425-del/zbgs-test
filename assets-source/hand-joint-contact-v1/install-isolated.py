from pathlib import Path
import hashlib,json,shutil
P=Path(__file__).resolve().parent;R=P.parents[1];W=R/'experiments/hand-contact-worktree-1/prototype/src'
before=(W/'motion.js').read_bytes();assert hashlib.sha256(before).hexdigest()=='06be7996392924b42a5ba56f91da47bb7a60aff823b8af0280bbd23cabcc0fc1'
base=R/'assets-source/hand-contact-v1/patch/motion.candidate.js';raw=base.read_bytes();assert hashlib.sha256(raw).hexdigest()=='f55293dc4d1e965084b43c28f939494a7c13de0d348d355f80f97bf6033b56ab'
(P/'motion.same-solver.js').write_bytes(raw);(W/'motion.js').write_bytes(raw)
shutil.copyfile(P/'frozen-44cd/joint-hand-workspace.mjs',W/'hand-contour-workspace.mjs');shutil.copyfile(P/'frozen-44cd/female.profile.json',W/'joint-hand-profile.json')
(P/'scripts').mkdir(exist_ok=True);shutil.copyfile(R/'assets-source/hand-contact-v1/scripts/build-joint-hand-profile.py',P/'scripts/build-joint-hand-profile.py')
files=[W/'motion.js',W/'hand-contour-workspace.mjs',W/'joint-hand-profile.json']
receipt={'status':'isolated untested joint profile; same83 solver; no alpha proof; old fixed builds unchanged','bodySHA256':json.loads((P/'female.profile.json').read_text())['bodySHA256'],'previousMotionRawSHA256':hashlib.sha256(before).hexdigest(),'installed':{str(f.relative_to(R)):hashlib.sha256(f.read_bytes()).hexdigest()for f in files},'scope':'No edits to shared prototype/src; uses same original-female opt-in and handSkin=legacy diagnostic'}
(P/'install-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf8');print(json.dumps(receipt,indent=2))
