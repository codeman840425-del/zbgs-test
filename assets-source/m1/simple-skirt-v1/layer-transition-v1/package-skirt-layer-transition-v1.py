"""Add fit metadata and a hash index to the single failed/unaccepted candidate."""
from pathlib import Path
import copy,hashlib,json,shutil
ROOT=Path(__file__).resolve().parents[1];S=ROOT/'experiments/m1-simple-skirt-worktree/assets-source/m1/simple-skirt-v1';O=S/'layer-transition-v1'
report=json.loads((O/'build-report.json').read_text());entry=copy.deepcopy(json.loads((S/'generated-v4/equipment-entry.json').read_text(encoding='utf-8')))
entry.update(id=report['id'],name='原版腰部与下摆层间过渡诊断样件',fitId='female-027bed-layer-transition-v1',url=report['id']+'.glb',sha256=report['sha256'],bytes=report['bytes'],method='Frozen v4; lower vertices20..503 on corresponding original-source triangles and barycentric weights; exact retained120-face waist and20-point boundary')
entry['limits']=['Not admitted; standing noncap top/body/chair is zero but original hem self-intersection remains','Transition adjacent-face bends increased; actual GPU appearance pending','No sitting response authored; seated body/chair/self intersections remain','Female027bed only; no inherited male/derived-body fit']
dest=O/'equipment-entry.json';text=json.dumps(entry,ensure_ascii=False,indent=2)+'\n'
if dest.exists():assert dest.read_text(encoding='utf-8')==text
else:dest.write_text(text,encoding='utf-8')
shutil.copyfile(__file__,O/Path(__file__).name)
files=[p for p in sorted(O.iterdir())if p.is_file()and p.name!='manifest.json']
manifest={'schema':1,'status':'source-candidate-not-admitted','bodySha256':'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95','parentV4Sha256':report['parentV4Sha256'],'files':[{'path':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in files]}
(O/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8');print(json.dumps({'path':str(O),'glbSHA':report['sha256'],'fitEntrySHA':hashlib.sha256(dest.read_bytes()).hexdigest(),'files':len(files)},indent=2))
