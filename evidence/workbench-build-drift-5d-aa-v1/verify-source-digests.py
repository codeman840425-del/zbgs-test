"""Read-only exact build-id replay; use an ed9b631 prototype checkout."""
from pathlib import Path
import hashlib,json,sys
source=Path(sys.argv[1]);here=Path(__file__).resolve().parent
old=json.loads((here/'5d-build-info.json').read_text(encoding='utf8'))
new=json.loads((here/'aa-build-info.json').read_text(encoding='utf8'))
assert old['inputs']==new['inputs']
hashes=[hashlib.sha256(),hashlib.sha256()]
for file in old['inputs']:
    current=(source/file).read_bytes()
    for index,h in enumerate(hashes):
        data=(here/'old-appearance-workbench.js').read_bytes() if index==0 and file=='src/appearance-workbench.js' else current
        h.update(file.encode());h.update(b'\0');h.update(data);h.update(b'\0')
actual=[h.hexdigest() for h in hashes];expected=[old['sourceDigest'],new['sourceDigest']]
print(json.dumps({'actual':actual,'expected':expected,'matched':actual==expected},indent=2))
assert actual==expected
