"""Persist the exact reviewed execution inputs after prepare; no G or export."""
import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/m2-source-proportioned-face-v1';SCRIPTS=Path(__file__).parent
destination=BASE/'execution-spec.json'
if destination.exists():raise ValueError('Preserve frozen execution input')
files=[BASE/'spec.json',*sorted((BASE/'prepared').glob('*')),*[SCRIPTS/n for n in ['build.py','preview.py','run.py']]]
rows=[{'path':p.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]
destination.write_text(json.dumps({'schema':'source-proportioned-preview-execution-spec-v1','inputs':rows},indent=2)+'\n',encoding='utf-8')
print(hashlib.sha256(destination.read_bytes()).hexdigest())
