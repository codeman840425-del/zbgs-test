"""Read-only installer/legacy-resource review, pinned actual candidate module bytes."""
from pathlib import Path
import subprocess,json,hashlib
ROOT=Path(__file__).resolve().parents[3];HERE=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
paths=['prototype/src/facial-geometry.js','prototype/src/facial-geometry-profiles.js','prototype/src/facial-geometry-contract.js','prototype/src/appearance-recipe.js','scripts/install-face-visible-workbench.mjs'];pins={p:sha((ROOT/p).read_bytes())for p in paths}
assert pins[paths[0]]=='ed813b5d070ee0a75b9757b772696297f11e3d28e5abba5fe19038a86759a597'
def git(*args):return subprocess.run(['git',*args],cwd=ROOT,capture_output=True,check=True).stdout
head=git('rev-parse','HEAD').decode().strip();prefixes=['prototype/public/assets/'+n for n in ['face-parameters-v1','face-brow-parameters-v1','face-nose-parameters-v1','face-eye-sample-v1','m2-male-jaw-mouth-v1']];names=git('ls-tree','-r','--name-only',head,'--',*prefixes).decode().splitlines();assert names;legacy=[]
for name in names:
 old=git('show',head+':'+name);now=(ROOT/name).read_bytes();assert old==now,name;legacy.append({'path':name,'bytes':len(now),'sha256':sha(now),'equalToPinnedHeadBlob':True})
installer=subprocess.run(['node','scripts/install-face-visible-workbench.mjs','--verify'],cwd=ROOT,capture_output=True,text=True,encoding='utf-8');assert installer.returncode==0,installer.stderr;installed=json.loads(installer.stdout);assert installed['verified']and not installed['copied']
contractPath=ROOT/'evidence/face-visible-runtime-v1/contract-1/report.json';contract=json.loads(contractPath.read_text(encoding='utf-8'))
for filename,digest in contract['modules'].items():assert sha((ROOT/'prototype/src'/filename).read_bytes())==digest,filename
assert pins=={p:sha((ROOT/p).read_bytes())for p in paths},'Candidate changed during review'
report={'scope':'Independent read-only inspection of source admission and legacy preservation. Installer --verify executed; existing 17-case contract receipt inspected, not rerun or relabeled as own execution. No browser/GPU/asset mutation.','reviewedModuleHashes':pins,'legacyComparisonCommit':head,'legacyResourceFiles':legacy,'installer':{'command':'node scripts/install-face-visible-workbench.mjs --verify','exitCode':installer.returncode,'copied':installed['copied'],'result':installed['result']},'existingContractReceipt':{'path':contractPath.relative_to(ROOT).as_posix(),'sha256':sha(contractPath.read_bytes()),'caseCount':len(contract['rows']),'allFourModuleHashesMatch':True},'conclusion':'No new blocker found in exact-base admission or old-resource/sample preservation. This is not acceptance of the separately retained male-mouth88 source-normal comparison failure or visual behavior.'};(HERE/'report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({'legacyResourceFilesUnchanged':len(legacy),'installerVerifiedWithoutCopy':True,'existingContractCases':len(contract['rows']),'reviewedFacialModule':pins[paths[0]]},indent=2))
