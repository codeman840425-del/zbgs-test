import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time


script_checkout = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--repo', default=script_checkout, type=Path)
parser.add_argument('--commit', default='5dfffaee86bbc82a18e24088ecf45a8b9bbc7f74')
parser.add_argument('--worktree', required=True, type=Path)
parser.add_argument('--out', required=True, type=Path)
args = parser.parse_args()

git_env = os.environ.copy()


def git_paths(directory, *options):
    output = subprocess.check_output(
        ['git', 'rev-parse', '--path-format=absolute', *options], cwd=directory, env=git_env,
    )
    return tuple(Path(os.fsdecode(path)).resolve() for path in output.splitlines())


try:
    for name in subprocess.check_output(['git', 'rev-parse', '--local-env-vars'], cwd=script_checkout).splitlines():
        git_env.pop(os.fsdecode(name), None)
    script_root, script_git, common_git = git_paths(script_checkout, '--show-toplevel', '--git-dir', '--git-common-dir')
    main_root = script_root if script_git == common_git else common_git.parent
    if script_git != common_git and git_paths(main_root, '--show-toplevel', '--git-dir') != (main_root, common_git):
        parser.error('Cannot locate the main checkout of the script repository')
    repo = args.repo.resolve()
    if git_paths(repo, '--git-common-dir') != (common_git,):
        parser.error('--repo must use the same Git repository as this script')
    work = args.worktree.resolve()
    out = args.out.resolve()
except (OSError, RuntimeError, subprocess.CalledProcessError) as exc:
    parser.error(f'Cannot resolve checkout or output paths: {exc}')

experiments = main_root / 'experiments'
if work == experiments or not work.is_relative_to(experiments) or work.exists():
    parser.error('New worktree must be a nonexisting path within the main repository experiments directory')
if not out.is_relative_to(main_root) or out.is_relative_to(work):
    parser.error('Report output must be within the main repository and outside the new worktree')
if out.exists():
    parser.error('Refuse to overwrite report output')

commit = subprocess.check_output(
    ['git', 'rev-parse', '--verify', '--end-of-options', args.commit + '^{commit}'],
    cwd=repo, env=git_env, text=True,
).strip()
out.mkdir(parents=True)
report = {'requestedCommit': args.commit, 'commit': commit, 'worktree': str(work), 'steps': []}


def run(name,args,cwd):
 t=time.perf_counter();r=subprocess.run(args,cwd=cwd,env=git_env,capture_output=True);(out/(name+'.stdout.log')).write_bytes(r.stdout);(out/(name+'.stderr.log')).write_bytes(r.stderr);report['steps'].append({'name':name,'args':args,'exitCode':r.returncode,'seconds':time.perf_counter()-t});assert r.returncode==0,r.stderr.decode(errors='replace');return r.stdout
try:
 run('worktree',['git','worktree','add','--detach','--no-checkout',str(work),commit],repo)
 (work/'.gitattributes').write_bytes(run('attributes',['git','show',commit+':.gitattributes'],repo))
 run('sparse',['git','sparse-checkout','set','--cone','prototype'],work);run('checkout',['git','checkout','--detach',commit],work)
 p=work/'prototype';inputs=[]
 for d in ['src','scripts','public/assets']:inputs.extend(f.relative_to(p).as_posix() for f in (p/d).rglob('*') if f.is_file())
 inputs+=['public/favicon.svg','public/native-production.html','index.html','foundation.html','record-consumer.html','vite.config.js','package.json','package-lock.json'];inputs.sort();rows=[]
 for name in inputs:
  b=(p/name).read_bytes();g=subprocess.check_output(['git','show',commit+':prototype/'+name],cwd=work,env=git_env);assert b==g,name;rows.append({'path':name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'gitBlobEqual':True})
 report['inputs']=rows
 assert not (p/'node_modules').exists()
 run('npm-ci',[shutil.which('npm.cmd'),'ci','--no-audit','--no-fund'],p)
 run('npm-build',[shutil.which('npm.cmd'),'run','build'],p)
 report['build']=json.loads((p/'dist/build-info.json').read_text());assert report['build']['inputs']==inputs
 report['status']=run('status',['git','status','--porcelain'],work).decode();assert not report['status']
 report['dist']=str(p/'dist');report['pass']=True
finally:
 (out/'report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({k:report.get(k) for k in ['pass','commit','dist','build']},indent=2)[:600])
