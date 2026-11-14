"""Rebuild all independent specimen gear and require byte-identical results."""
import pathlib,subprocess,sys,hashlib,json
ROOT=pathlib.Path(__file__).resolve().parents[2];reports=[]
for identifier in ['m1a-jaw-v1','m1a-waisthip-v1']:
 folder=ROOT/'prototype/public/assets/m1-variants'/identifier/'equipment'
 hashfiles=lambda:{p.name:hashlib.sha256(p.read_bytes()).hexdigest()for p in folder.iterdir()if p.suffix in ['.glb','.json']}
 before=hashfiles();subprocess.run([sys.executable,str(ROOT/'scripts/m1-variants/build-equipment.py'),identifier],cwd=ROOT,check=True,stdout=subprocess.PIPE)
 after=hashfiles();assert before==after,'Independent equipment rebuild not byte-identical'
 reports.append({'id':identifier,'byteIdentical':True,'files':after})
(ROOT/'assets-source/m1-variants/equipment-rebuild-report.json').write_text(json.dumps(reports,indent=2)+'\n',encoding='utf8');print(json.dumps({'variants':len(reports),'files':sum(len(r['files'])for r in reports),'passed':True}))
