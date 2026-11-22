from pathlib import Path
import json, subprocess, hashlib
ROOT=Path('.').resolve(); E=ROOT/'evidence/female-reference-outfit-v1'; E.mkdir(parents=True,exist_ok=True)
def run(args):
 p=subprocess.run(args,cwd=ROOT,text=True,encoding='utf-8',capture_output=True)
 return {'command':' '.join(args),'returncode':p.returncode,'stdout':p.stdout,'stderr':p.stderr,'status':'passed' if p.returncode==0 else 'failed'}
budget_paths=[
 'prototype/public/assets/garment-basecolor-release-v1/female/m1-female-uniform-top-1k-v1.glb',
 'assets-source/m2-vest-layer-fit-v1/generated/female/top.glb',
 'prototype/public/assets/m1/m1-training-pants.glb',
 'prototype/public/assets/m1/m1-uniform-shoes.glb']
b=[]
for p in budget_paths:
 x=run(['python','scripts/production/asset_budget.py','check',p,'--class','garment','--budget-version','m2-technical-v1'])
 try: doc=json.loads(x['stdout']); b.append({'asset':p,'sha256':doc.get('sha256'),'status':doc.get('status'),'violations':doc.get('violations',[]),'metrics':doc.get('metrics',{}),'command':x['command'],'returncode':x['returncode']})
 except Exception: b.append(x)
(E/'budget.json').write_text(json.dumps({'schema':'female-reference-outfit-budget-v1','budgetVersion':'m2-technical-v1','items':b,'summary':{'admitted':sum(x.get('status')=='admitted' for x in b),'rejected':sum(x.get('status')=='rejected' for x in b)}},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
matrix=[run(['python','scripts/production/variant_matrix.py','assets-source/female-reference-outfit-v1/outfit-matrix.json','--root','.']),run(['python','scripts/production/variant_matrix.py','assets-source/female-reference-outfit-v1/outfit-matrix.json','--root','.','--body-type','female'])]
(E/'matrix-check.json').write_text(json.dumps({'schema':'female-reference-outfit-matrix-check-v1','checks':matrix,'matrixSha256':hashlib.sha256((ROOT/'assets-source/female-reference-outfit-v1/outfit-matrix.json').read_bytes()).hexdigest()},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
checks=[]
for args in [
 ['python','scripts/production/test_variant_matrix.py'],
 ['python','scripts/production/test_outfit_admission.py'],
 ['python','scripts/production/test_garment_source_mapping.py'],
 ['python','scripts/production/test_garment_group_contract.py'],
 ['python','scripts/production/test_real_outfit_evidence.py'],
 ['python','scripts/production/test_female_uniform_texture_fit.py'],
 ['python','scripts/production/test_garment_basecolor_runtime.py'],
 ['python','scripts/production/test_garment_basecolor_release.py']]: checks.append(run(args))
(E/'failure-regression.json').write_text(json.dumps({'schema':'female-reference-outfit-failure-regression-v1','checks':checks,'negativeControlsIncluded':['real-outfit-evidence missing repository file','real-outfit-evidence changed equipment','variant matrix no runtime-admitted candidate'], 'allPassed':all(x['returncode']==0 for x in checks)},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'budget':str((E/'budget.json').relative_to(ROOT)).replace('\\','/'),'matrix':str((E/'matrix-check.json').relative_to(ROOT)).replace('\\','/'),'regression':str((E/'failure-regression.json').relative_to(ROOT)).replace('\\','/')},ensure_ascii=False,indent=2))
