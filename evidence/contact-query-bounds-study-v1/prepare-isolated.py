from pathlib import Path
import subprocess,tarfile,io,json,hashlib,sys
source=Path(__file__).resolve().parent
root=source.parents[1]
target=Path(sys.argv[1]).resolve()if len(sys.argv)>1 else root/'experiments/m1-query-bounds-study'
if (target/'prototype').exists():raise SystemExit('Refuse existing prototype; choose fresh isolated directory')
target.mkdir(parents=True,exist_ok=True)
commit='5f4250a3ce5d958de16d31ba3ce9a8724cea28a8'
blob=subprocess.check_output(['git','archive',commit,'prototype'],cwd=root)
with tarfile.open(fileobj=io.BytesIO(blob))as tar:tar.extractall(target,filter='data')
config=json.loads((source/'diagnostic-source.json').read_text(encoding='utf8'))
p=target/'prototype/src/motion.js'
assert hashlib.sha256(p.read_bytes()).hexdigest()==config['rawSourceSHA256']
subprocess.run(['node',str(target/'prototype/scripts/build-id.mjs')],check=True)
build=json.loads((target/'prototype/public/build-info.json').read_text(encoding='utf8'))
assert build['shortId']=='038341558517',build
candidate=(source/'motion.diagnostic.js').read_bytes()
assert hashlib.sha256(candidate).hexdigest()==config['diagnosticMotionSHA256']
p.write_bytes(candidate)
subprocess.run(['node',str(target/'prototype/scripts/build-id.mjs')],check=True)
build=json.loads((target/'prototype/public/build-info.json').read_text(encoding='utf8'))
assert build['shortId']=='24b5754965ef',build
print('Prepared diagnostic only:',target/'prototype','; npm ci and npm run build in that directory')
