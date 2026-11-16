"""Run pinned original generator with only its OUT assignment redirected.

Original source, author parameters, geometry code and files remain unchanged.
The AST adapter avoids executing the old writer against its frozen directory.
"""
from pathlib import Path
import ast,hashlib,json,time
ROOT=Path(__file__).resolve().parents[2];PACKAGE=ROOT/'assets-source/m2-male-jaw-hair-fit-v1'
source=ROOT/'scripts/m2-male-hairstyle-v1/build.py'
pins=json.loads((PACKAGE/'source-pins.json').read_text(encoding='utf8'))
pin=next(x for x in pins['files']if x['path']=='scripts/m2-male-hairstyle-v1/build.py')
assert hashlib.sha256(source.read_bytes()).hexdigest()==pin['sha256']
tree=ast.parse(source.read_text(encoding='utf8'));changed=0
output=PACKAGE/'fresh/original-hair-rebuild'
for node in tree.body:
    if isinstance(node,ast.Assign)and any(isinstance(x,ast.Name)and x.id=='OUT'for x in node.targets):
        node.value=ast.Call(func=ast.Attribute(value=ast.Name(id='pathlib',ctx=ast.Load()),attr='Path',ctx=ast.Load()),args=[ast.Constant(str(output))],keywords=[]);changed+=1
assert changed==1
ast.fix_missing_locations(tree);t=time.perf_counter()
exec(compile(tree,str(source),'exec'),{'__file__':str(source),'__name__':'__main__'})
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
expected=digest(ROOT/'assets-source/m2-male-hairstyle-v1/male-sidepart.glb')
assert digest(output/'male-sidepart.glb')==expected
report={'sourceScriptSHA256':pin['sha256'],'adapter':'AST replaces only single OUT assignment; __file__/source/math/parameters unchanged','redirectedOutput':'assets-source/m2-male-jaw-hair-fit-v1/fresh/original-hair-rebuild','assetSHA256':expected,'matchesFrozenOriginalByteForByte':True,'seconds':time.perf_counter()-t}
(ROOT/'evidence/m2-male-jaw-hair-fit-v1/original-generator-rebuild.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');print(json.dumps(report))
