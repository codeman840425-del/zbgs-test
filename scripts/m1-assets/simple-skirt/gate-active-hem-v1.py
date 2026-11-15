"""Apply the identical full-face gate to the exact disjoint source combination."""
from pathlib import Path
import argparse,hashlib,json,sys
R=Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser();parser.add_argument('--out',default='assets-source/m1/simple-skirt-v1/active-gap-hem-v1');args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]if'--'in sys.argv else[])
O=(R/args.out).resolve();assert O.is_relative_to(R/'assets-source/m1/simple-skirt-v1')
source=R/'scripts/m1-assets/simple-skirt/gate-active-gap-v1.py';text=source.read_text(encoding='utf-8');changes=[]
def replace(a,b):
    global text
    assert text.count(a)==1,(a,text.count(a));text=text.replace(a,b);changes.append({'from':a,'to':b})
replace("default='assets-source/m1/simple-skirt-v1/active-layer-admission-v1'","default='assets-source/m1/simple-skirt-v1/active-gap-hem-v1'")
replace("candidate=O/'m1-sixfold-skirt-active-gap-v1.glb'","candidate=O/'m1-sixfold-skirt-active-gap-hem-v1.glb'")
# Only input expectations change. All matrices, contact math, thresholds, regions
# and chair/full-body gates below are exactly the previously tested evaluator.
replace("oldRaw,oldDoc,oldRead=load(S/'layer-transition-v1/m1-sixfold-skirt-layer-transition-v1.glb')","oldRaw,oldDoc,oldRead=load(S/'hem-return-v1/m1-sixfold-skirt-hem-return-v1.glb')")
# Two save/reopen paths are intentionally replaced together and recorded.
if "O/'active-gap-v1.blend'"in text:
    assert text.count("O/'active-gap-v1.blend'")==3
    text=text.replace("O/'active-gap-v1.blend'","O/'active-gap-hem-v1.blend'");changes.append({'from':"O/'active-gap-v1.blend'",'to':"O/'active-gap-hem-v1.blend'",'count':3})
replace("'Independent hem repair not combined; existing self1 remains recorded.'","'Independent hem repair combined exactly; full self gate rerun, not inherited.'")
(O/'gate-adapter.json').write_text(json.dumps({'originalGatePath':source.relative_to(R).as_posix(),'originalGateSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'compiledGateSha256':hashlib.sha256(text.encode()).hexdigest(),'changes':changes,'reason':'Compare exact attributes against hem source because only active30 source positions differ; full global material ratios therefore relative to that hem parent.'},indent=2)+'\n',encoding='utf-8')
exec(compile(text,str(source),'exec'),globals())
