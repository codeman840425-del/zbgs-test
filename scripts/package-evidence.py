"""Preserve compact acceptance evidence; keep full repeatable recordings local."""
from pathlib import Path
import hashlib, json, shutil

root=Path(__file__).resolve().parents[1]
build=json.loads((root/'prototype/public/build-info.json').read_text(encoding='utf-8'))
out=root/'evidence'/build['shortId'];out.mkdir(parents=True,exist_ok=True)
files=[
 'acceptance/before/recording.json','acceptance/after/recording.json',
 'posture-base/report.json','posture/report.json','posture/seat-transition.json',
 'garment-contact/before/report.json','garment-contact/after/report.json',
 'locomotion.json','gait-trace/summary.json','controller/chair-contact-report.json',
 'controller/scene-lifecycle-report.json','controller/lifecycle-report.json',
 'acceptance/after/1-idle-正面.png','acceptance/after/1-seated-side.png',
 'acceptance/after/0-idle-侧面.png','garment-diagnosis/front.png',
 'garment-diagnosis/identity-colors.png','canvas-walk/report.json','canvas-walk/timing-summary.json',
 'controller-final/controller-check.json','controller-final/scene-lifecycle-check.json',
 'controller-final/chair-local-contact-check.json',
]
manifest={'build':build,'copied':[],'localVideos':[],
 'note':'Each report retains its own build/scope. Specialist traces may predate integration. Video hashes identify local recordings, not remote video backup.'}
for rel in files:
 src=root/'output/playwright'/rel
 if not src.is_file(): raise FileNotFoundError(src)
 dst=out/rel;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
 manifest['copied'].append({'path':rel,'sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'bytes':src.stat().st_size})
for rel in [
 'acceptance/before/outfit-walk-sit.webm','acceptance/after/outfit-walk-sit.webm',
 'posture-base/posture-transitions.webm','posture/posture-transitions.webm',
 'gait-review/Walk_Loop.webm','stop-final/three-speed-stop.webm',
 'turn-candidate/before-front-side-visible.webm','turn-candidate/after-front-side-visible.webm',
 'canvas-walk/normal-front.webm','canvas-walk/normal-side.webm',
 'canvas-walk/slow-side.webm','canvas-walk/fast-side.webm']:
 src=root/'output/playwright'/rel
 if not src.is_file(): raise FileNotFoundError(src)
 manifest['localVideos'].append({'path':'output/playwright/'+rel,'sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'bytes':src.stat().st_size})
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(out)
