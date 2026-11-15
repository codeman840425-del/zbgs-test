"""Portable five-pose source bundle. Full 270-frame capture stays unchanged.
pack <full capture>: archive selected actual input with deterministic gzip.
restore <destination>: verify every SHA then restore only named payload files.
"""
import copy,gzip,hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];BUNDLE=ROOT/'assets-source/m1/seated-front-v1/input'
sha=lambda b:hashlib.sha256(b).hexdigest()
mode=sys.argv[1];directory=Path(sys.argv[2]).resolve()
if mode=='pack':
 raw=(directory/'capture.json').read_bytes();d=json.loads(raw);selected=[0,76,139,192,269]
 assert len(d['frames'])==270
 subset=copy.deepcopy(d);subset['originCaptureSha256']=sha(raw);subset['originDisplayedSha256']=d['displayed.f32']['sha256'];subset['frames']=[d['frames'][i]for i in selected]
 subset['subsetNote']='Five exact actual captured poses; full 270-frame reports are separate and cannot be reproduced from this subset alone.'
 payload={};BUNDLE.mkdir(parents=True,exist_ok=True)
 for filename,stride in [('colliders.f32',sum(m['vertexCount'] for m in d['topology']['colliders'])*12),('source.f32',d['topology']['source']['vertexCount']*12),('displayed.f32',d['topology']['displayed']['vertexCount']*12)]:
  chunks=[]
  with (directory/filename).open('rb') as f:
   for index in selected:f.seek(index*stride);chunks.append(f.read(stride))
  b=b''.join(chunks);assert len(b)==len(selected)*stride
  payload[filename]=b;subset[filename]={'bytes':len(b),'sha256':sha(b)}
 payload['capture.json']=(json.dumps(subset,separators=(',',':'))+'\n').encode()
 payload['source-topology.json']=(ROOT/'experiments/skirt-offline-corrective/source-topology.json').read_bytes()
 manifest={'schema':'zbgs-skirt-front-input-subset-v1','build':d['identity']['runtimeBuild']['shortId'],
  'originalCaptureSha256':sha(raw),'originalInputs':{name:d[name]for name in ['colliders.f32','source.f32','displayed.f32']},
  'selectedOriginalFrames':[i+1 for i in selected],'files':{},
  'limits':'Full 270-frame results kept, portable bundle supports same target regeneration and these five actual pose gates only.'}
 for filename,b in payload.items():
  packed=gzip.compress(b,compresslevel=6,mtime=0);(BUNDLE/(filename+'.gz')).write_bytes(packed)
  manifest['files'][filename]={'sha256':sha(b),'bytes':len(b),'gzipSha256':sha(packed),'gzipBytes':len(packed)}
 (BUNDLE/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'bundle':str(BUNDLE),'gzipBytes':sum(x['gzipBytes'] for x in manifest['files'].values()),'frames':manifest['selectedOriginalFrames']}))
elif mode=='restore':
 manifest=json.loads((BUNDLE/'manifest.json').read_text(encoding='utf-8'));directory.mkdir(parents=True,exist_ok=True)
 for filename,record in manifest['files'].items():
  assert Path(filename).name==filename
  packed=(BUNDLE/(filename+'.gz')).read_bytes();assert sha(packed)==record['gzipSha256']
  b=gzip.decompress(packed);assert len(b)==record['bytes'] and sha(b)==record['sha256']
  target=directory/filename
  if target.exists():assert sha(target.read_bytes())==record['sha256'],'Refuse different existing input '+str(target)
  else:target.write_bytes(b)
 print('Verified and restored actual source subset:',directory)
else:raise SystemExit('Use pack or restore')
