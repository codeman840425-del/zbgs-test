"""Bounded fresh locked-build check. Never changes the reference dist or removes worktrees."""
import argparse,hashlib,json,pathlib,shutil,subprocess,sys,time,platform
P=argparse.ArgumentParser();P.add_argument('--repo',default=str(pathlib.Path(__file__).resolve().parents[1]));P.add_argument('--commit',required=True);P.add_argument('--baseline',required=True);P.add_argument('--worktree',required=True);P.add_argument('--output',required=True);a=P.parse_args()
repo=pathlib.Path(a.repo).resolve();baseline=pathlib.Path(a.baseline).resolve();work=pathlib.Path(a.worktree).resolve();out=pathlib.Path(a.output).resolve()
if not work.is_relative_to(repo/'experiments') or work.exists():raise RuntimeError('New worktree must be a nonexisting path within repo/experiments')
if out.exists():raise RuntimeError('Refuse to overwrite evidence output')
if baseline==work or baseline.is_relative_to(work):raise RuntimeError('Baseline cannot be in new worktree')
out.mkdir(parents=True);report={'status':'incomplete','startedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'repo':str(repo),'requestedCommit':a.commit,'baseline':str(baseline),'worktree':str(work),'checkoutScope':'fresh detached sparse checkout: complete prototype plus root files; historical evidence/assets-source not needed to build runtime','steps':[],'limitations':['Same development machine/OS/toolchain; no browser/visual/performance acceptance.','Source generators are not rerun: this verifies committed runtime source + committed exports + lockfile reproducibly build the fixed runtime.']}
def sha(b):return hashlib.sha256(b).hexdigest()
def run(name,cmd,cwd):
 start=time.perf_counter();r=subprocess.run(cmd,cwd=cwd,capture_output=True);(out/(name+'.stdout.log')).write_bytes(r.stdout);(out/(name+'.stderr.log')).write_bytes(r.stderr);step={'name':name,'command':list(map(str,cmd)),'cwd':str(cwd),'exitCode':r.returncode,'seconds':time.perf_counter()-start};report['steps'].append(step);print(json.dumps(step),flush=True)
 if r.returncode:raise RuntimeError(f'{name} exited {r.returncode}; see logs')
 return r.stdout.decode('utf-8',errors='replace').strip()
def files(root):
 result={}
 for f in sorted(root.rglob('*')):
  if f.is_symlink():raise RuntimeError('Unexpected symlink: '+str(f))
  if f.is_file():result[f.relative_to(root).as_posix()]={'bytes':f.stat().st_size,'sha256':sha(f.read_bytes())}
 return result
try:
 report['commit']=run('resolve-commit',['git','rev-parse',a.commit+'^{commit}'],repo)
 referenceInfo=json.loads((baseline/'build-info.json').read_text(encoding='utf-8'));report['referenceBuild']=referenceInfo
 report['environment']={'python':platform.python_version(),'platform':platform.platform(),'node':run('node-version',[shutil.which('node'),'--version'],repo),'npm':run('npm-version',[shutil.which('npm.cmd') or shutil.which('npm'),'--version'],repo)}
 run('worktree-add',['git','worktree','add','--detach','--no-checkout',str(work),report['commit']],repo)
 run('sparse-checkout',['git','sparse-checkout','set','--cone','prototype'],work)
 run('checkout',['git','checkout','--detach',report['commit']],work)
 report['actualCommit']=run('actual-commit',['git','rev-parse','HEAD'],work)
 assert report['actualCommit']==report['commit']
 clean=run('initial-status',['git','status','--porcelain','--untracked-files=all'],work);assert not clean,clean
 project=work/'prototype';assert not (project/'node_modules').exists();assert not(project/'dist').exists()
 report['lockSHA256']=sha((project/'package-lock.json').read_bytes());report['buildIdScriptSHA256']=sha((project/'scripts/build-id.mjs').read_bytes());report['inputFiles']={n:{'bytes':(project/n).stat().st_size,'sha256':sha((project/n).read_bytes())}for n in referenceInfo['inputs']}
 run('npm-ci',[shutil.which('npm.cmd') or shutil.which('npm'),'ci'],project)
 run('npm-build',[shutil.which('npm.cmd') or shutil.which('npm'),'run','build'],project)
 candidate=project/'dist';candidateInfo=json.loads((candidate/'build-info.json').read_text(encoding='utf-8'));report['rebuiltBuild']=candidateInfo
 before=files(baseline);after=files(candidate);report['referenceFiles']=before;report['rebuiltFiles']=after
 report['missingFiles']=sorted(set(before)-set(after));report['unexpectedFiles']=sorted(set(after)-set(before));report['changedFiles']=[{'path':n,'reference':before[n],'rebuilt':after[n]}for n in sorted(set(before)&set(after))if before[n]!=after[n]]
 report['finalGitStatus']=run('final-status',['git','status','--porcelain','--untracked-files=all'],work)
 report['matchingFiles']=sum(1 for n in set(before)&set(after)if before[n]==after[n]);report['referenceTotalBytes']=sum(x['bytes']for x in before.values());report['status']='passed'if not(report['missingFiles']or report['unexpectedFiles']or report['changedFiles']or report['finalGitStatus'])and candidateInfo==referenceInfo else 'failed'
 if report['status']!='passed':raise RuntimeError('Fresh build is not byte-identical or source tree changed; inspect report')
except Exception as exc:
 report['error']=repr(exc);report['status']='failed';raise
finally:
 report['finishedUTC']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime());(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(str(out/'report.json'),flush=True)
