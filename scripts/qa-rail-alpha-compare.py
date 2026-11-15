"""Strict JSON numeric equality on same-body actual source-pose captures; only time fields excluded at capture."""
import pathlib,json,gzip,sys,hashlib
root=pathlib.Path('evidence/rail-alpha-equivalence');old=root/'a491efde53fb';new=root/'83a7372f41b4';reports=[]
def first(a,b,p=''):
 if type(a)!=type(b) and not isinstance(a,(float,int)):return[p,a,b]
 if isinstance(a,dict):
  if a.keys()!=b.keys():return[p+'.keys',list(a),list(b)]
  for k in a:
   d=first(a[k],b[k],p+'.'+k)
   if d:return d
 elif isinstance(a,list):
  if len(a)!=len(b):return[p+'.length',len(a),len(b)]
  for i,(x,y)in enumerate(zip(a,b)):
   d=first(x,y,p+'['+str(i)+']')
   if d:return d
 elif a!=b:return[p,a,b]
for file in sorted(old.glob('*.json.gz')):
 a=json.loads(gzip.decompress(file.read_bytes()));b=json.loads(gzip.decompress((new/file.name).read_bytes()));assert a['identity']['primary']['actualSha256']==b['identity']['primary']['actualSha256'];assert a['selection']==b['selection'];assert a['boneNames']==b['boneNames'];assert len(a['frames'])==len(b['frames'])==270
 diff=first(a['frames'],b['frames'],'frames');reports.append({'body':a['identity']['primary']['id'],'bodySHA':a['identity']['primary']['actualSha256'],'frames':270,'strictEqual':diff is None,'firstDifference':diff,'oldSHA256':hashlib.sha256(file.read_bytes()).hexdigest(),'newSHA256':hashlib.sha256((new/file.name).read_bytes()).hexdigest()});print(reports[-1]['body'],'strict equal',diff is None,'difference',diff)
result={'oldBuild':'a491efde53fb','newBuild':'83a7372f41b4','totalComparedPoses':810,'passed':all(x['strictEqual']for x in reports),'scope':'All stored humanoid raw/normalized transforms,displayed skirt vertices/normals,semantic actual skin sample128,handContacts excluding timing only. Same body independently pinned. DynamicsOFF; not visual/contact-clearance/device proof.','reports':reports};(root/'comparison.json').write_text(json.dumps(result,indent=2),encoding='utf8');sys.exit(0 if result['passed'] else 1)
