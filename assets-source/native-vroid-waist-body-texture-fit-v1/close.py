from pathlib import Path
import json,hashlib,sys
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[2];B=Path(__file__).resolve().parent;E=R/'evidence/native-waist-body-fit-v1';h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
result=json.loads((E/'result.json').read_text(encoding='utf8'));assert result['status']=='CPU-data-ready-runtime-unregistered'
manifest=json.loads((B/'manifest.json').read_text(encoding='utf8'));floor=json.loads((B/'floor-readback.json').read_text(encoding='utf8'))
for name,v in result['fixedOutputs'].items():assert h(B/name)==v['sha256']
assert h(B/'manifest.json')=='46a868ddc366a4f64de1154cbea3f70478b3f8406ceddb5a79d2b174ef373d5e'
equipment=R/'assets-source/native-vroid-waist-factory-equipment-v1/package-files.json';pkg=json.loads(equipment.read_text(encoding='utf8'))
for f in pkg['files']:assert h(R/f['path'])==f['sha256'],f['path']
native=R/'assets-source/native-vroid-geometry-production-v1/generated/female-waist-derived.vroid';assert h(native)=='8792bc1e0651addd59852b49996ec709e96a2e6cc66ced0485ff31fe19093808'
closure={'schema':'native-waist-body-fit-closure-v1','status':'CPU-data-ready-runtime-unregistered','avatarSha256':manifest['avatarSha256'],'manifestSha256':h(B/'manifest.json'),'sourceEquipmentPackage':{'path':equipment.relative_to(R).as_posix(),'sha256':h(equipment),'checkedFiles':len(pkg['files'])},'nativeEditableSource':{'path':native.relative_to(R).as_posix(),'sha256':h(native),'authoringEvidence':'native-vroid-geometry-production-v1 saved and menu-reopened; not process cold start'},'floor':floor['rows'][0],'cpuChecks':{'path':(E/'result.json').relative_to(R).as_posix(),'sha256':h(E/'result.json')},'publicOrRuntimeEdited':False,'gpuOperations':0,'visualContactAccepted':False,'requestedConfiguration':'gpt-6-astra/high; provider/hook not independently verified'}
with(E/'closure.json').open('x',encoding='utf8')as f:json.dump(closure,f,ensure_ascii=False,indent=2);f.write('\n')
files=[{'path':p.relative_to(R).as_posix(),'sha256':h(p),'bytes':p.stat().st_size}for folder in [B,E]for p in sorted(folder.rglob('*'))if p.is_file()and p.name!='package-files.json']
with(B/'package-files.json').open('x',encoding='utf8')as f:json.dump({'schema':'native-waist-body-fit-files-v1','files':files},f,ensure_ascii=False,indent=2);f.write('\n')
print(json.dumps({'manifestSHA':h(B/'manifest.json'),'packageSHA':h(B/'package-files.json'),'closureSHA':h(E/'closure.json'),'files':len(files)}))
