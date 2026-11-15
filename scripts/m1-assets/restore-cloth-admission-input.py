"""Restore only the exact archived historical authoring inputs, never overwrite differences."""
from pathlib import Path
import gzip,hashlib,json
R=Path(__file__).resolve().parents[2];I=R/'assets-source/m1/cloth-admission-v1/input';manifest=json.loads((I/'manifest.json').read_text(encoding='utf-8'));sha=lambda b:hashlib.sha256(b).hexdigest()
for name,record in manifest.items():
 assert Path(name).name==name
 dest=(R/record['sourcePath']).resolve();assert dest.is_relative_to((R/'experiments').resolve())
 b=(I/(name+'.gz')).read_bytes();assert sha(b)==record['gzipSha256'];raw=gzip.decompress(b);assert len(raw)==record['bytes'] and sha(raw)==record['sha256']
 if dest.exists():assert sha(dest.read_bytes())==record['sha256'],'Refuse replacing different historical evidence'
 else:dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(raw)
print('Verified/restored exact historical authoring inputs; no new simulation or source fit.')
