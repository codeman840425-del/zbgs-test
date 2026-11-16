"""Export exact Git-retained source files using an isolated index; no commit/main-index write."""
from pathlib import Path
import json,hashlib,subprocess,os,sys
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).resolve().parent;WORK=ROOT/'analysis/face-visible-retained-v2-checkout';INDEX=ROOT/'analysis/face-visible-retained-v2.index';PATHSPEC=ROOT/'analysis/face-visible-retained-v2-paths.bin'
assert not WORK.exists()and not INDEX.exists(),'Use a fresh isolated rehearsal path; do not overwrite previous evidence.'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
mouth=json.loads((ROOT/'assets-source/mouth-visible-v2/retained-manifest.json').read_text(encoding='utf-8'));required={r['path']for r in mouth['files']+mouth['dependencies']+mouth['additionalFiles']};required.add('assets-source/mouth-visible-v2/retained-manifest.json');omitted={r['path']for r in mouth['reconstructibleFiles']};manifestPins={}
for pkg in ['face-brow-visible-v2','face-nose-visible-v2','face-eye-visible-v2']:
 p=ROOT/f'assets-source/{pkg}/manifest.json';m=json.loads(p.read_text(encoding='utf-8'));required.update(r['path']for r in m['files']+m['dependencies']);required.add(p.relative_to(ROOT).as_posix());omitted.update(r['path']for r in m['reconstructibleFiles']);manifestPins[p.relative_to(ROOT).as_posix()]=sha(p)
# Include the actual ancestor attributes used by Git, rather than bypassing
# filters or silently normalizing hash-pinned files during a copy operation.
for name in list(required):
 for parent in (ROOT/name).parents:
  if not parent.is_relative_to(ROOT):break
  attr=parent/'.gitattributes'
  if attr.is_file():required.add(attr.relative_to(ROOT).as_posix())
assert not required.intersection(omitted),'A required dependency was classified as omittable'
def run(cmd,env=None,cwd=ROOT,check=True):
 r=subprocess.run(cmd,cwd=cwd,env=env,capture_output=True);text=r.stdout.decode('utf-8',errors='replace');err=r.stderr.decode('utf-8',errors='replace')
 if check and r.returncode:raise RuntimeError(json.dumps({'command':cmd,'exitCode':r.returncode,'stdout':text,'stderr':err}))
 return {'command':cmd,'exitCode':r.returncode,'stdout':text,'stderr':err}
visible=run(['git','ls-files','--cached','--others','--exclude-standard','-z'])['stdout'].split('\0');assert required<=set(visible),f'Required files omitted by current Git rules: {sorted(required-set(visible))}'
head=run(['git','rev-parse','HEAD'])['stdout'].strip();mainIndex=ROOT/'.git/index';beforeIndex=sha(mainIndex)if mainIndex.is_file()else None
env=os.environ.copy();env['GIT_INDEX_FILE']=str(INDEX);PATHSPEC.write_bytes(b''.join(p.encode()+b'\0'for p in sorted(required)))
logs=[run(['git','read-tree','--empty'],env),run(['git','add','--pathspec-from-file='+str(PATHSPEC),'--pathspec-file-nul'],env)];tree=run(['git','write-tree'],env)['stdout'].strip();WORK.mkdir(parents=True);logs.append(run(['git','checkout-index','--all','--prefix='+WORK.as_posix()+'/'],env))
absent=[p for p in sorted(omitted)if not (WORK/p).exists()];assert len(absent)==len(omitted)
commands=[['scripts/mouth-visible-v2/verify-retained.py']]+[[f'scripts/{pkg}/manifest.py','--verify']for pkg in ['face-brow-visible-v2','face-nose-visible-v2','face-eye-visible-v2']]
checks=[]
for args in commands:
 r=run([sys.executable,*args],cwd=WORK);r['parsed']=json.loads(r['stdout']);checks.append(r)
# An unchanged old full verifier must fail without its reconstruction outputs.
full=run([sys.executable,'scripts/mouth-visible-v2/manifest.py','--verify'],cwd=WORK,check=False);assert full['exitCode']!=0 and 'FileNotFoundError'in full['stderr'],'Old full-local verification unexpectedly accepted an incomplete local package'
afterIndex=sha(mainIndex)if mainIndex.is_file()else None
result={'schema':'visible-face-retained-git-checkout-v2','scope':'Actual isolated Git index + write-tree + checkout-index from the current candidate author files. No commit; not a release checkout of current HEAD. All four retained verifiers execute inside the exported tree.','sourceHeadAtStart':head,'isolatedTree':tree,'rootIndexBefore':beforeIndex,'rootIndexAfter':afterIndex,'rootIndexByteUnchangedObserved':beforeIndex==afterIndex,'workingCopy':WORK.relative_to(ROOT).as_posix(),'fileCountExported':len(required),'filesExported':sorted(required),'reconstructibleFilesAbsent':len(absent),'absentPaths':absent,'sourceManifestPins':manifestPins,'gitCommands':logs,'retainedChecks':checks,'unchangedMouthFullLocalExpectedFailure':full,'passed':True,'runtimeOrVisualAcceptance':False}
(HERE/'receipt.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps({'passed':True,'filesExported':len(required),'reconstructibleAbsent':len(absent),'isolatedTree':tree,'mainIndexUnchangedObserved':beforeIndex==afterIndex,'retainedChecks':[{'command':r['command'][1:],'exitCode':r['exitCode']}for r in checks],'oldFullVerifierExitCode':full['exitCode']},indent=2))
