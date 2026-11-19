"""Bounded fresh locked-build check. Never changes the reference dist or removes worktrees."""
import argparse
import hashlib
import json
import os
import pathlib
import platform
import shutil
import subprocess
import tempfile
import time


def git_paths(directory, *options):
    result = subprocess.run(
        ['git', 'rev-parse', '--path-format=absolute', *options],
        cwd=directory, env=git_env, check=True, capture_output=True,
    )
    return tuple(pathlib.Path(os.fsdecode(path)).resolve() for path in result.stdout.splitlines())


script_checkout = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repo', default=str(script_checkout))
parser.add_argument('--commit', required=True)
parser.add_argument('--baseline', required=True)
parser.add_argument('--worktree', required=True)
parser.add_argument('--output', required=True)
a = parser.parse_args()

try:
    # Find the checkout's own metadata when invoked from another Git command.
    git_env = os.environ.copy()
    local_git_vars = subprocess.check_output(['git', 'rev-parse', '--local-env-vars'], cwd=script_checkout)
    for name in local_git_vars.splitlines():
        git_env.pop(os.fsdecode(name), None)

    script_root, script_git, common_git = git_paths(
        script_checkout, '--show-toplevel', '--git-dir', '--git-common-dir',
    )
    main_root = script_root if script_git == common_git else common_git.parent
    if script_git != common_git and git_paths(main_root, '--show-toplevel', '--git-dir') != (main_root, common_git):
        parser.error('Cannot locate the main checkout of the script repository')
    repo = pathlib.Path(a.repo).resolve()
    if git_paths(repo, '--git-common-dir') != (common_git,):
        parser.error('--repo must use the same Git repository as this script')
except (OSError, subprocess.CalledProcessError) as exc:
    parser.error(f'Cannot read Git checkout paths: {exc}')

baseline = pathlib.Path(a.baseline).resolve()
work = pathlib.Path(a.worktree).resolve()
out = pathlib.Path(a.output).resolve()
experiments = main_root / 'experiments'
if work == experiments or not work.is_relative_to(experiments) or work.exists():
    parser.error('New worktree must be a nonexisting path within the main repository experiments directory')
if not out.is_relative_to(main_root):
    parser.error('Evidence output must be within the main repository')
if out.exists():
    parser.error('Refuse to overwrite evidence output')
if baseline.is_relative_to(work):
    parser.error('Baseline cannot be in new worktree')
cache = main_root / 'output' / 'fixed-build-cache' / 'npm'
cache_dirs = (cache, cache / '_cacache', cache / '_logs', cache / '_npx')
if any(folder.resolve() != folder for folder in cache_dirs):
    parser.error('Fixed-build cache must stay in the main repository')
out.mkdir(parents=True);report={'status':'incomplete','startedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'repo':str(repo),'requestedCommit':a.commit,'baseline':str(baseline),'worktree':str(work),'checkoutScope':'fresh detached sparse checkout: complete prototype plus root files; historical evidence/assets-source not needed to build runtime','steps':[],'limitations':['Same development machine/OS/toolchain; no browser/visual/performance acceptance.','Source generators are not rerun: this verifies committed runtime source + committed exports + lockfile reproducibly build the fixed runtime.']}
scratch = tempfile.TemporaryDirectory(prefix='.build-tmp-', dir=out)
build_paths = {'TMP': scratch.name, 'TEMP': scratch.name, 'TMPDIR': scratch.name,
               'npm_config_cache': str(cache), 'npm_config_logs_dir': str(cache / '_logs')}
path_names = {name.lower() for name in build_paths}
for key in list(git_env):
    if key.lower() in path_names:
        del git_env[key]
git_env.update(build_paths)
report['buildPaths'] = {'npmCache': str(cache.relative_to(main_root)), 'temporaryParent': str(out.relative_to(main_root))}
def sha(b):return hashlib.sha256(b).hexdigest()
def run(name,cmd,cwd):
 start=time.perf_counter();r=subprocess.run(cmd,cwd=cwd,env=git_env,capture_output=True);(out/(name+'.stdout.log')).write_bytes(r.stdout);(out/(name+'.stderr.log')).write_bytes(r.stderr);step={'name':name,'command':list(map(str,cmd)),'cwd':str(cwd),'exitCode':r.returncode,'seconds':time.perf_counter()-start};report['steps'].append(step);print(json.dumps(step),flush=True)
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
 # On Windows core.autocrlf, populate exact attributes before sparse checkout
 # materializes pinned JSON. A clean index alone cannot prove runtime bytes.
 # Write the exact blob without creating a partial index (path checkout on an
 # empty no-checkout worktree stages every other path as deleted).
 run('read-attributes',['git','show',report['commit']+':.gitattributes'],work)
 shutil.copyfile(out/'read-attributes.stdout.log',work/'.gitattributes')
 build_dirs=['prototype']
 if '../assets-source/variant-matrix-v1/representative-matrix.json' in referenceInfo['inputs']:
  build_dirs.append('assets-source/variant-matrix-v1')
 run('sparse-checkout',['git','sparse-checkout','set','--cone',*build_dirs],work)
 run('checkout',['git','checkout','--detach',report['commit']],work)
 report['actualCommit']=run('actual-commit',['git','rev-parse','HEAD'],work)
 assert report['actualCommit']==report['commit']
 clean=run('initial-status',['git','status','--porcelain','--untracked-files=all'],work);assert not clean,'Initial checkout is not clean; see initial-status.stdout.log'
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
 try:
    report['finishedUTC']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime());(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(str(out/'report.json'),flush=True)
 finally:
    scratch.cleanup()
