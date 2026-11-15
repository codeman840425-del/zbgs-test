"""Restore fixed model/video inputs only when absent; always verify saved SHA256."""
import hashlib,json,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def restore(dest,url,expected):
    if not dest.exists():
        with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'GamemakePoseReference/1.0'}),timeout=120) as r:payload=r.read()
        if hashlib.sha256(payload).hexdigest()!=expected:raise ValueError('Remote SHA mismatch: '+url)
        dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(payload)
    if hashlib.sha256(dest.read_bytes()).hexdigest()!=expected:raise ValueError('Saved SHA mismatch; original retained: '+str(dest))
    print('Verified',dest.name)
for r in json.loads((Path(__file__).parent/'model-sources.json').read_text()):restore(ROOT/'analysis/mediapipe-reference/models'/r['filename'],r['url'],r['sha256'])
p=ROOT/'evidence/real-video-pose-v1'
for filename in ['source.json','fitness-squat-source.json','dvids-squat-source.json']:
    r=json.loads((p/filename).read_text());restore(p/r['file'],r['download_url'],r['sha256'])
