"""Bounded repository-source reproducibility + real authoring-change round trip."""
import hashlib,importlib.util,json,pathlib,subprocess,sys
import numpy as np
ROOT=pathlib.Path(__file__).resolve().parent.parent
ASSETS=ROOT/'prototype/public/assets/motion/m1c';OUT=ROOT/'output/playwright/m1c-source/rebuild';OUT.mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('source',ROOT/'scripts/qa-m1c-source.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def run(script,config,folder):
    folder.mkdir(parents=True,exist_ok=True)
    with (folder/'build.log').open('w',encoding='utf8')as log:subprocess.run([sys.executable,str(ROOT/'scripts'/script),'--config',str(config),'--output',str(folder)],cwd=ROOT,check=True,stdout=log,stderr=subprocess.STDOUT)
rebuilds={}
for label,script,stem in [('jog','qa-m1c-build-jog.py','jog-ordinary-derived-v1'),('dance','qa-m1c-build-dance.py','dance-technical-v1')]:
    config=ASSETS/(stem+'.config.json');folder=OUT/('rebuilt-'+label);expected=sha(ASSETS/(stem+'.glb'));run(script,config,folder);actual=sha(folder/(stem+'.glb'));assert expected==actual,label+' is not byte-reproducible'
    rebuilds[label]={'configSha256':sha(config),'assetSha256':expected,'rebuiltSha256':actual,'identical':True,'source':json.loads(config.read_text())['source']}
config=ASSETS/'dance-technical-v1.config.json';modified=json.loads(config.read_text());modified['upperArmRaiseDeg']-=10;variant=OUT/'modified-dance-config.json';variant.write_text(json.dumps(modified,indent=2));folder=OUT/'modified-dance';run('qa-m1c-build-dance.py',variant,folder)
original=m.GLB((ASSETS/'dance-technical-v1.glb').read_bytes());changed=m.GLB((folder/'dance-technical-v1.glb').read_bytes());clip=original.j['animations'][0]['name'];a,_,_=original.evaluate(clip,np.array([1.3]));b,_,_=changed.evaluate(clip,np.array([1.3]));ni=original.byname
def angle(w):
    v=w[0,ni['lowerarm_l'],:3,3]-w[0,ni['upperarm_l'],:3,3];return float(np.degrees(np.arccos(np.clip(-v[1]/np.linalg.norm(v),-1,1))))
footError=max(float(np.linalg.norm(a[0,ni['foot_'+side],:3,3]-b[0,ni['foot_'+side],:3,3]))for side in ['l','r']);difference=angle(a)-angle(b);assert 9<difference<11 and footError<1e-8;assert sha(ASSETS/'dance-technical-v1.glb')!=sha(folder/'dance-technical-v1.glb')
result={'passed':True,'python':sys.version,'rebuilds':rebuilds,'changedAuthoringConfig':{'field':'upperArmRaiseDeg','before':modified['upperArmRaiseDeg']+10,'after':modified['upperArmRaiseDeg'],'beforeConfigSHA256':sha(config),'afterConfigSHA256':sha(variant),'beforeAssetSHA256':sha(ASSETS/'dance-technical-v1.glb'),'afterAssetSHA256':sha(folder/'dance-technical-v1.glb'),'readBackAtSeconds':1.3,'beforeWorldUpperArmRaiseDeg':angle(a),'afterWorldUpperArmRaiseDeg':angle(b),'readBackWorldAngleDifferenceDeg':difference,'footWorldChangeMeters':footError},'scope':'Offline source pipeline only. Public candidate remained unchanged; modified variant stays in evidence folder.'}
(OUT/'report.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
