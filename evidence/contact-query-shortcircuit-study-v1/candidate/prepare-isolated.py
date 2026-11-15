from pathlib import Path
import subprocess,tarfile,io,json,hashlib,sys
source=Path(__file__).resolve().parent
repo=source.parents[2]
target=Path(sys.argv[1]).resolve()if len(sys.argv)>1 else repo/'experiments/m1-query-shortcircuit-candidate'
if (target/'prototype').exists():raise SystemExit('Choose fresh isolated target; refuse overwrite')
target.mkdir(parents=True,exist_ok=True)
blob=subprocess.check_output(['git','archive','5f4250a3ce5d958de16d31ba3ce9a8724cea28a8','prototype'],cwd=repo)
with tarfile.open(fileobj=io.BytesIO(blob))as tar:tar.extractall(target,filter='data')
p=target/'prototype/src/forearm-contact-workspace.js'
config=json.loads((source/'source.json').read_text(encoding='utf8'))
assert hashlib.sha256(p.read_bytes()).hexdigest()==config['rawSourceSHA256']
subprocess.run(['node',str(target/'prototype/scripts/build-id.mjs')],check=True)
assert json.loads((target/'prototype/public/build-info.json').read_text(encoding='utf8'))['shortId']=='038341558517'
b=(source/'forearm-contact-workspace.candidate.js').read_bytes()
assert hashlib.sha256(b).hexdigest()==config['candidateSHA256']
p.write_bytes(b)
subprocess.run(['node',str(target/'prototype/scripts/build-id.mjs')],check=True)
assert json.loads((target/'prototype/public/build-info.json').read_text(encoding='utf8'))['shortId']=='6fb6c051aacd'
print('Prepared one-file candidate; npm ci and npm run build in',target/'prototype')
