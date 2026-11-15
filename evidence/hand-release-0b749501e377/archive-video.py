from pathlib import Path
import json,hashlib,re
E=Path(__file__).resolve().parent;ROOT=E.parents[1]
files=[E/n for n in ['analyze-video.py','archive-video.py','VIDEO-SUMMARY.json','VIDEO-RESULT.md','video-index.html']]
files += [ROOT/'experiments/hand-scope-worktree-1'/n for n in ['qa-snap-video.cjs','qa-related-video.cjs']]
files += [p for d in ['snap-normal','related-video'] for p in (E/d).rglob('*') if p.is_file()]
manifest={'build':'0b749501e377','files':[{'file':p.relative_to(ROOT).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in files]}
(E/'video-manifest.json').write_text(json.dumps(manifest,indent=2))
refs=re.findall(r'(?:src|href)="([^"]+)"',(E/'video-index.html').read_text(encoding='utf8'))
missing=[r for r in refs if not (E/r).exists()]
print(json.dumps({'files':len(files),'bytes':sum(p.stat().st_size for p in files),'missingLinks':missing}))
assert not missing
