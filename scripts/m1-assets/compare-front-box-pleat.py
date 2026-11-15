"""Keep original pair IDs, classify known internal cap separately, never exempt it."""
import collections,gzip,json
from pathlib import Path
R=Path(__file__).resolve().parents[2];O=R/'assets-source/m1/front-box-pleat-v1'
old=json.loads(gzip.decompress((R/'evidence/skirt-front-17bdb176154c/original/triangle-alpha-report.json.gz').read_bytes()));new=json.loads((O/'triangle-alpha-report.json').read_text(encoding='utf-8'));caps=set(json.loads((R/'assets-source/m1/offline-corrective/open-waist-v1/top-edit.json').read_text(encoding='utf-8'))['removedOriginalFaces'])
records=[];added=collections.Counter();regions=collections.Counter();faces=collections.Counter()
for a,b in zip(old['records'][:60],new['records']):
 assert a['frame']==b['frame'];plus=set(b['actualPairs'])-set(a['actualPairs']);minus=set(a['actualPairs'])-set(b['actualPairs'])
 records.append({'frame':b['frame'],'newPairs':sorted(plus),'removedPairs':sorted(minus),'original':len(a['actualPairs']),'candidate':len(b['actualPairs'])})
 for pair in plus:
  s,m,f=pair.split(':');f=int(f);added[m]+=1;regions['verifiedOriginalTopInternalCap'if m=='m1-uniform-top_1'and f in caps else 'otherTopFace'if m=='m1-uniform-top_1'else m]+=1;faces[f]+=1
r={'status':'failed-weight-transfer-and-standing-contact','maxOriginal':max(r['original']for r in records),'maxCandidate':max(r['candidate']for r in records),'framesWithNewPairs':sum(bool(r['newPairs'])for r in records),'newPairEventsByMesh':dict(added),'removedPairEvents':sum(len(r['removedPairs'])for r in records),'records':records,'limit':'Source-pattern offline replay on actual175 standing body/top; not live new garment or all poses'}
(O/'standing-contact-comparison.json').write_text(json.dumps(r,indent=2)+'\n',encoding='utf-8');(O/'standing-contact-regions.json').write_text(json.dumps({'counts':dict(regions),'topFaces':dict(faces),'knownInternalTopCapIndices':sorted(caps),'note':'Index classification against verified original top source SHA; not visual visibility or justification to exclude contacts.'},indent=2)+'\n',encoding='utf-8');print(json.dumps({k:v for k,v in r.items()if k!='records'}))
