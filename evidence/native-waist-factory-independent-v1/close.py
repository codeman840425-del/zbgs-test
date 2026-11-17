from pathlib import Path
import hashlib,json
R=Path(__file__).resolve().parents[2];O=Path(__file__).resolve().parent;h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
ad=json.loads((O/'admission-v1/result.json').read_text(encoding='utf8'));co=json.loads((O/'coverage-v1/result.json').read_text(encoding='utf8'));st=json.loads((O/'stage-result.json').read_text(encoding='utf8'));assert ad['passed']and co['passed']and st['passed'];assert len(st['resources'])==8
pins={**st['pins'],**{'prototype/src/'+k:v for k,v in ad['runtimeSHA'].items()}}
for file,digest in pins.items():assert h(R/file)==digest,file
for r in st['resources']:assert h(R/'prototype/public'/r['url'].lstrip('/'))==r['sha256'],r['url']
closure={'schema':'native-waist-factory-independent-v1','status':'no-new-CPU-admission-or-transaction-blocker','avatarSha256':st['profile']['sha256'],'coverageManifestSha256':co['manifestSHA'],'stageManifestSha256':'b53a8cdb82c6033e417147ff09dde92541f5fc32e9ef9756dc07cfcccea56fb1','checks':{'colorRecipeGroups':len(ad['checks']),'coverageGroups':len(co['checks']),'stageResourceCount':len(st['resources'])},'artifacts':{name:h(O/name)for name in ['admission-v1/result.json','coverage-v1/result.json','stage-result.json','REVIEW.md']},'runtimePinsRechecked':pins,'GPUAccepted':False,'fullCharacterMotionIsolationAccepted':False,'productionEdited':False,'requestedConfiguration':'gpt-6-astra/high; actual provider/hook not independently verified'}
with(O/'closure.json').open('x',encoding='utf8')as f:json.dump(closure,f,ensure_ascii=False,indent=2);f.write('\n')
files=[{'path':p.relative_to(R).as_posix(),'sha256':h(p),'bytes':p.stat().st_size}for p in sorted(O.rglob('*'))if p.is_file()and p.name!='package-files.json']
with(O/'package-files.json').open('x',encoding='utf8')as f:json.dump({'schema':'native-waist-factory-independent-files-v1','files':files},f,ensure_ascii=False,indent=2);f.write('\n')
print(json.dumps({'closureSHA':h(O/'closure.json'),'packageSHA':h(O/'package-files.json'),'checks':closure['checks']}))
