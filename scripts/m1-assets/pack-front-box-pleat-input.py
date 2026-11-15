"""Keep all60 actual original standing poses portable, restore hash-checked only."""
import copy,gzip,hashlib,json,sys
from pathlib import Path
R=Path(__file__).resolve().parents[2];B=R/'assets-source/m1/front-box-pleat-v1/input';sha=lambda b:hashlib.sha256(b).hexdigest()
mode=sys.argv[1]
if mode=='pack':
 src=R/'experiments/skirt-offline-corrective/front-input-175a487d5ea3';d=json.loads((src/'capture.json').read_text(encoding='utf-8'));d=copy.deepcopy(d);d['frames']=d['frames'][:60];d['subsetNote']='All60 actual source175 standing frames; no sit frames; sufficient for this source-pattern standing gate only.';B.mkdir(exist_ok=True)
 payload={}
 for name,stride in [('colliders.f32',sum(m['vertexCount']for m in d['topology']['colliders'])*12),('displayed.f32',d['topology']['displayed']['vertexCount']*12)]:
  raw=(src/name).read_bytes();part=raw[:60*stride];payload[name]=part;d[name]={'sha256':sha(part),'bytes':len(part),'fullCaptureSha256':sha(raw)}
 payload['capture.json']=json.dumps(d,separators=(',',':')).encode();manifest={'sourceBuild':'175a487d5ea3','frames':60,'files':{}}
 for name,raw in payload.items():
  b=gzip.compress(raw,compresslevel=6,mtime=0);(B/(name+'.gz')).write_bytes(b);manifest['files'][name]={'sha256':sha(raw),'bytes':len(raw),'gzipSha256':sha(b),'gzipBytes':len(b)}
 (B/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8');print(sum(x['gzipBytes']for x in manifest['files'].values()))
elif mode=='restore':
 dest=Path(sys.argv[2]);dest.mkdir(parents=True,exist_ok=True);manifest=json.loads((B/'manifest.json').read_text(encoding='utf-8'))
 for name,record in manifest['files'].items():
  assert Path(name).name==name;b=(B/(name+'.gz')).read_bytes();assert sha(b)==record['gzipSha256'];raw=gzip.decompress(b);assert sha(raw)==record['sha256'];p=dest/name
  if p.exists():assert sha(p.read_bytes())==record['sha256'],'Refuse overwriting different input'
  else:p.write_bytes(raw)
 print('Restored verified60 standing poses',dest)
else:raise SystemExit('pack | restore <directory>')
