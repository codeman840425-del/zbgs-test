"""Install only into the explicitly named independent worktree; never main src."""
from pathlib import Path
import hashlib,json
R=Path(__file__).resolve().parents[3];P=Path(__file__).resolve().parents[1]
W=R/'experiments/hand-contact-worktree-1';motion=W/'prototype/src/motion.js'
old=motion.read_bytes();assert hashlib.sha256(old).hexdigest()=='f55293dc4d1e965084b43c28f939494a7c13de0d348d355f80f97bf6033b56ab'
manifest=json.loads((P/'alpha-proof/manifest.json').read_text());candidate=(P/'alpha-proof/motion.candidate.js').read_bytes();assert hashlib.sha256(candidate).hexdigest()==manifest['candidateRawSHA256']
avatar=W/'prototype/src/foundation-avatar.js';before=avatar.read_bytes();text=before.replace(b'\r\n',b'\n').decode()
anchor='      forearmProfileTiming: new URLSearchParams(location.search).has("forearmTiming"),'
assert text.count(anchor)==1 and 'handOpaqueAlphaProof' not in text
text=text.replace(anchor,'      handOpaqueAlphaProof: new URLSearchParams(location.search).get("handAlpha") !== "legacy",\n'+anchor)
motion.write_bytes(candidate);avatar.write_text(text,encoding='utf8',newline='\r\n')
helper=(P/'source/opaque-alpha-proof.mjs').read_bytes();(W/'prototype/src/opaque-alpha-proof.mjs').write_bytes(helper)
receipt={'worktree':str(W),'motionBeforeRawSHA256':hashlib.sha256(old).hexdigest(),'motionAfterRawSHA256':hashlib.sha256(motion.read_bytes()).hexdigest(),'avatarBeforeRawSHA256':hashlib.sha256(before).hexdigest(),'avatarAfterRawSHA256':hashlib.sha256(avatar.read_bytes()).hexdigest(),'helperRawSHA256':hashlib.sha256(helper).hexdigest(),'scope':'isolated worktree only; all old fixed dist unchanged'}
(P/'alpha-proof/install-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf8');print(json.dumps(receipt,indent=2))
