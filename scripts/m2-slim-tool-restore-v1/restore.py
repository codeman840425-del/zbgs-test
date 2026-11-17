"""Restore the frozen official binary tool into an explicitly new directory."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import re
import shutil
import struct
import subprocess
import sys
import time
from urllib.parse import urlparse
import urllib.request

ROOT=Path(__file__).resolve().parents[2]
LOCK=ROOT/'evidence/m2-slim-tool-smoke-v1/requirements.lock'
ORIGINAL=ROOT/'evidence/m2-slim-tool-smoke-v1/prepare-report.json'
LOCK_SHA='a145e1c66a487280b092d6730ae50f29bb1e9c814ce4306e357af8b7587476ae'
ORIGINAL_SHA='d46bcf857802c6207a15dc9867addc93148f80b58dc563962aaa36dc12551027'


def require(condition,message):
    if not condition: raise ValueError(message)


def sha(path):
    result=hashlib.sha256()
    with path.open('rb') as file:
        for chunk in iter(lambda:file.read(1024*1024),b''):result.update(chunk)
    return result.hexdigest()


def write(path,value):
    path.write_bytes((json.dumps(value,indent=2)+'\n').encode())


def locked_packages():
    require(sha(LOCK)==LOCK_SHA and sha(ORIGINAL)==ORIGINAL_SHA,'Frozen lock/official-wheel receipt SHA differs')
    rows=[]
    for line in LOCK.read_text().splitlines():
        match=re.fullmatch(r'([a-z]+)==([0-9.]+) --hash=sha256:([a-f0-9]{64})',line)
        require(match is not None,'Unsupported lock line')
        name,version,digest=match.groups()
        old=next(p for p in json.loads(ORIGINAL.read_bytes())['packages'] if p['name']==name)
        require(old['version']==version and old['sha256']==digest,'Lock and approved wheel differ')
        parsed=urlparse(old['url'])
        require(parsed.scheme=='https' and parsed.hostname=='files.pythonhosted.org'
            and parsed.path.endswith('/'+old['filename']) and old['filename'].endswith('.whl'),'Non-official or non-wheel input')
        rows.append({k:old[k] for k in ['name','version','filename','url','sha256','bytes','notices']})
    require([r['name'] for r in rows]==['libigl','numpy','scipy'],'Only approved three locked packages supported')
    return rows


def target_path(relative):
    target=(ROOT/relative).resolve()
    require(target.is_relative_to(ROOT/'experiments/tools') or
        target.is_relative_to(ROOT/'evidence/m2-slim-tool-restore-v1'),'Target outside explicit tool/restore scope')
    require(target not in [ROOT/'experiments/tools',ROOT/'evidence/m2-slim-tool-restore-v1'],'Choose a new child directory')
    require(not target.exists(),'Destination already exists; preserve it and choose a new explicit target')
    return target


def preflight(relative,wheelhouse=None):
    require(sys.version_info[:2]==(3,13) and struct.calcsize('P')==8 and platform.system()=='Windows','Requires existing CPython3.13 Windows x64')
    target=target_path(relative)
    packages=locked_packages()
    if wheelhouse is not None:
        for package in packages:
            path=wheelhouse/package['filename']
            require(path.is_file() and sha(path)==package['sha256'],'Local wheel missing/SHA mismatch: '+package['filename'])
    return target,packages


def restore(relative,wheelhouse=None):
    target,packages=preflight(relative,wheelhouse)
    target.mkdir(parents=True)
    report={'schema':'frozen-slim-tool-restore-v1','status':'restoring','target':target.relative_to(ROOT).as_posix(),
        'lock':{'path':LOCK.relative_to(ROOT).as_posix(),'sha256':LOCK_SHA},
        'officialWheelReceipt':{'path':ORIGINAL.relative_to(ROOT).as_posix(),'sha256':ORIGINAL_SHA},
        'originalPreparationReportMayExist':True,'packages':[],'commands':[],
        'globalPythonModified':False,'existingToolModified':False,'systemSitePackages':False,
        'sourceCompilation':False,'solverExecuted':False,'characterSolved':False,
        'basePython':{'version':sys.version,'executable':sys.executable,'sha256':sha(Path(sys.executable))}}
    start=time.monotonic()
    write(target/'restore-report.json',report)
    try:
        wheels=target/'wheelhouse';wheels.mkdir()
        for package in packages:
            destination=wheels/package['filename']
            if wheelhouse is not None:
                shutil.copyfile(wheelhouse/package['filename'],destination)
                provenance='verified-read-only-local-wheelhouse'
            else:
                request=urllib.request.Request(package['url'],headers={'User-Agent':'Codex-frozen-tool-restore'})
                with urllib.request.urlopen(request,timeout=60) as response,destination.open('wb') as output:
                    require(urlparse(response.url).hostname=='files.pythonhosted.org','Unexpected download host')
                    while chunk:=response.read(1024*1024): output.write(chunk)
                provenance='downloaded-exact-original-official-URL'
            require(destination.stat().st_size==package['bytes'] and sha(destination)==package['sha256'],'Downloaded/copied wheel identity differs')
            report['packages'].append({**package,'provenance':provenance})
            write(target/'restore-report.json',report)
        shutil.copyfile(LOCK,target/'requirements.lock')
        venv=target/'.venv'
        commands=[([sys.executable,'-I','-m','venv',str(venv)],'venv.log'),
            ([str(venv/'Scripts/python.exe'),'-I','-m','pip','--isolated','--disable-pip-version-check','--no-input',
                'install','--no-index','--only-binary=:all:','--no-deps','--require-hashes',
                '--find-links',str(wheels),'-r',str(target/'requirements.lock')],'install.log'),
            ([str(venv/'Scripts/python.exe'),'-I','-B',str(Path(__file__).with_name('verify_import.py')),
                '--output',str(target/'import-report.json')],'import.log')]
        for command,log_name in commands:
            report['commands'].append(command)
            with (target/log_name).open('wb') as log:
                result=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT,timeout=180)
            require(result.returncode==0,'Command failed, see '+log_name)
        imported=json.loads((target/'import-report.json').read_bytes())
        require(imported['status']=='isolated-import-and-api-check-passed','Import verification failed')
        require(imported['versions']=={p['name']:p['version'] for p in packages},'Imported versions differ')
        report.update(status='new-isolated-tool-restored-import-only',venvConfig=(venv/'pyvenv.cfg').read_text(),
            importReportSHA256=sha(target/'import-report.json'))
    except Exception as error:
        report.update(status='failed-no-retry',error=f'{type(error).__name__}: {error}')
    finally:
        report['seconds']=time.monotonic()-start
        write(target/'restore-report.json',report)
    return report


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--target',required=True,help='New repo-relative tool directory; existing paths are always refused')
    parser.add_argument('--wheelhouse',type=Path,help='Optional read-only local wheels, every SHA verified before creating target')
    args=parser.parse_args()
    try:
        result=restore(args.target,args.wheelhouse)
    except Exception as error:
        print(json.dumps({'status':'refused-before-write','error':f'{type(error).__name__}: {error}'}))
        raise SystemExit(2)
    print(json.dumps({'status':result['status'],'seconds':result['seconds'],'target':result['target'],'error':result.get('error')}))
    raise SystemExit(0 if result['status']=='new-isolated-tool-restored-import-only' else 2)
