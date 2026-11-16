"""Read-only manifest check; dependency errors do not fabricate generated success."""
from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parents[2]
manifest=json.loads((ROOT/'assets-source/mouth-quantization-v1/manifest.json').read_text(encoding='utf8'))
for item in manifest['files']+manifest['dependencies']:
 p=ROOT/item['path'];assert p.is_file(),('Missing retained file',item['path'])
 b=p.read_bytes();assert len(b)==item['bytes'] and hashlib.sha256(b).hexdigest()==item['sha256'],('Byte identity mismatch',item['path'])
print(json.dumps({'passed':True,'files':len(manifest['files']),'dependencies':len(manifest['dependencies']),'scope':'retained source chain only; not a rerun or visual approval'}))
