from pathlib import Path
import subprocess,hashlib,json,shutil,time
repo=Path('F:/gamemake'); work=repo/'experiments/m2-jaw-hair-build-5dfffae'; out=Path('evidence/m2-male-jaw-hair-runtime-v1/build-5dfffae');out.mkdir()
commit='5dfffaee86bbc82a18e24088ecf45a8b9bbc7f74';report={'commit':commit,'worktree':str(work),'steps':[]}
def run(name,args,cwd):
 t=time.perf_counter();r=subprocess.run(args,cwd=cwd,capture_output=True);(out/(name+'.stdout.log')).write_bytes(r.stdout);(out/(name+'.stderr.log')).write_bytes(r.stderr);report['steps'].append({'name':name,'args':args,'exitCode':r.returncode,'seconds':time.perf_counter()-t});assert r.returncode==0,r.stderr.decode(errors='replace');return r.stdout
try:
 run('worktree',['git','worktree','add','--detach','--no-checkout',str(work),commit],repo)
 (work/'.gitattributes').write_bytes(run('attributes',['git','show',commit+':.gitattributes'],repo))
 run('sparse',['git','sparse-checkout','set','--cone','prototype'],work);run('checkout',['git','checkout','--detach',commit],work)
 p=work/'prototype';inputs=[]
 for d in ['src','scripts','public/assets']:inputs.extend(f.relative_to(p).as_posix() for f in (p/d).rglob('*') if f.is_file())
 inputs+=['public/favicon.svg','index.html','foundation.html','vite.config.js','package.json','package-lock.json'];inputs.sort();rows=[]
 for name in inputs:
  b=(p/name).read_bytes();g=subprocess.check_output(['git','show',commit+':prototype/'+name],cwd=work);assert b==g,name;rows.append({'path':name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'gitBlobEqual':True})
 report['inputs']=rows
 assert not (p/'node_modules').exists()
 run('npm-ci',[shutil.which('npm.cmd'),'ci','--no-audit','--no-fund'],p)
 run('npm-build',[shutil.which('npm.cmd'),'run','build'],p)
 report['build']=json.loads((p/'dist/build-info.json').read_text());assert report['build']['inputs']==inputs
 report['status']=run('status',['git','status','--porcelain'],work).decode();assert not report['status']
 report['dist']=str(p/'dist');report['pass']=True
finally:
 (out/'report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps({k:report.get(k) for k in ['pass','commit','dist','build']},indent=2)[:600])
