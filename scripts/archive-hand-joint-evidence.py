"""Preserve full fixed-build evidence; gzip large JSON losslessly, never trim fields."""
from pathlib import Path
import hashlib,gzip,shutil,json
R=Path(__file__).resolve().parent.parent;build='269a73423c97';out=R/'evidence'/('hand-joint-'+build);out.mkdir(parents=True,exist_ok=True)
def digest(p):
 h=hashlib.sha256()
 with p.open('rb')as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
records=[]
def archive(source,target):
 target.parent.mkdir(parents=True,exist_ok=True);compressed=source.suffix=='.json'and source.stat().st_size>250000
 if compressed:target=target.with_suffix(target.suffix+'.gz')
 if target.exists():raise RuntimeError('Refuse overwriting evidence '+str(target))
 if compressed:
  with source.open('rb')as a,target.open('wb')as b,gzip.GzipFile(filename='',mode='wb',fileobj=b,compresslevel=1,mtime=0)as z:shutil.copyfileobj(a,z,1024*1024)
  h=hashlib.sha256()
  with gzip.open(target,'rb')as f:
   for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
  assert h.hexdigest()==digest(source)
 else:shutil.copyfile(source,target);assert digest(source)==digest(target)
 records.append({'source':source.relative_to(R).as_posix(),'archive':target.relative_to(out).as_posix(),'sourceBytes':source.stat().st_size,'archiveBytes':target.stat().st_size,'sourceSHA256':digest(source),'archiveSHA256':digest(target),'encoding':'gzip-level1-full-original-json'if compressed else'original-bytes','fullOriginalVerified':True})
functional=R/'output/playwright'/('hand-joint-integrated-'+build)
for source in sorted(functional.rglob('*')):
 if source.is_file():archive(source,out/'functional'/source.relative_to(functional))
runtime=R/'output/playwright'/('hand-contact-'+build)
for folder,label in [('unrecorded-perf-legacy-outfit1','legacy'),('unrecorded-perf-actual-outfit1','actual'),('internal-profile-actual-outfit1','profile')]:
 for source in sorted((runtime/folder).iterdir()):
  if source.is_file():archive(source,out/'cost'/label/source.name)
video=runtime/'joint-normal-video-room-dynamics-1794707452743'
for source in sorted(video.iterdir()):
 if source.is_file():archive(source,out/'video'/source.name)
archive(R/'experiments/m1-joint-integrated-1/dist/build-info.json',out/'build-info.json')
for name in ['qa-hand-joint-integration.cjs','qa-hand-joint-live-stage.cjs','prepare-hand-joint-live-qa.py','m1c/qa-greeting-readiness-fixed.cjs']:
 archive(R/'scripts'/name,out/'qa-sources'/Path(name).name)
(out/'manifest.json').write_text(json.dumps({'build':build,'status':'complete raw evidence archive; not visual/user acceptance','compression':'Only lossless gzip of whole large JSON. Original source and decompressed SHA verified; videos original bytes.','files':records},indent=2)+'\n',encoding='utf8');print(json.dumps({'output':str(out),'files':len(records),'sourceBytes':sum(x['sourceBytes']for x in records),'archiveBytes':sum(x['archiveBytes']for x in records)}))
