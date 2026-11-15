"""Hash-guarded install/restore of ONE file in an isolated git checkout.
Never accepts the shared prototype or writes public assets/build output.
"""
import argparse,hashlib,json,os
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
ART=ROOT/'assets-source/m1/seated-front-v1'
ORIGINAL='10a072d3ceecaeb798f5025c19387e7b7a65ee6ad1adf2f9fbb67507b6184e86'
CANDIDATE='4ec063dd1aa0fccb960a075c9af3f0a56f63b3be8147c654b8b0d982c90eab62'
sha=lambda b:hashlib.sha256(b).hexdigest()
p=argparse.ArgumentParser();p.add_argument('checkout');p.add_argument('--restore',action='store_true');args=p.parse_args()
checkout=Path(args.checkout).resolve()
assert checkout.is_relative_to((ROOT/'experiments').resolve()) and checkout!=(ROOT/'experiments').resolve(),'Only an isolated experiments checkout is permitted'
assert (checkout/'.git').exists(),'Require actual isolated git checkout/worktree'
target=(checkout/'prototype/src/m1-skirt.js').resolve()
assert target.is_relative_to(checkout) and target!=(ROOT/'prototype/src/m1-skirt.js').resolve(),'Refuse shared runtime/symlink escape'
candidate=(ART/'candidate-solver.js').read_bytes();assert sha(candidate)==CANDIDATE,'Candidate source identity changed'
backup=ART/'original-solver-10a072.js';before=target.read_bytes();before_sha=sha(before)
if not args.restore:
 assert before_sha in [ORIGINAL,CANDIDATE],'Target is neither exact source175 solver nor this candidate'
 if before_sha==ORIGINAL:
  if backup.exists():assert sha(backup.read_bytes())==ORIGINAL,'Original backup differs'
  else:backup.write_bytes(before)
 replacement=candidate
else:
 assert before_sha in [ORIGINAL,CANDIDATE],'Refuse restoring over unrelated edits'
 replacement=backup.read_bytes();assert sha(replacement)==ORIGINAL
assert target.read_bytes()==before,'Concurrent edit detected'
if before!=replacement:
 temp=target.with_name('m1-skirt.front-install.tmp');assert not temp.exists(),'Stale temp requires inspection'
 temp.write_bytes(replacement);os.replace(temp,target)
assert sha(target.read_bytes())==sha(replacement)
result={'checkout':str(checkout),'target':'prototype/src/m1-skirt.js','beforeSha256':before_sha,'afterSha256':sha(replacement),
 'operation':'restore' if args.restore else 'install','idempotent':before==replacement,'scope':'one source file only; no shared runtime/public/build output changed'}
(ART/'install-receipts').mkdir(exist_ok=True)
(ART/'install-receipts'/(checkout.name+'-'+result['operation']+'.json')).write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,indent=2))
