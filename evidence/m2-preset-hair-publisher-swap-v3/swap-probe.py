"""Exercise publication idempotence, real Windows locks and bounded rename faults."""
import copy
from contextlib import contextmanager
import ctypes
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(sys.argv[1] if len(sys.argv)>1 else 'F:/gamemake').resolve()
OUT = Path(__file__).resolve().parent
scratch = OUT/'scratch';scratch.mkdir(exist_ok=True)
run_root = Path(tempfile.mkdtemp(prefix='swap-',dir=scratch))
prefix = 'm2-preset-short-hair-fits-v1'
source_output = SOURCE/'prototype/public/assets'/prefix
catalog = json.loads((source_output/'catalog.json').read_bytes())
sha = lambda data: hashlib.sha256(data).hexdigest()
results = []


def module(path,name):
    spec = importlib.util.spec_from_file_location(name,path)
    value = importlib.util.module_from_spec(spec);spec.loader.exec_module(value)
    return value


def snapshot(folder):
    return {p.relative_to(folder).as_posix():sha(p.read_bytes()) for p in folder.rglob('*') if p.is_file()}


def setup(name,publisher):
    root = run_root/name
    output = root/'prototype/public/assets'/prefix
    output.parent.mkdir(parents=True)
    shutil.copytree(source_output,output)
    publisher.ROOT = root
    pending = []
    for entry in catalog:
        relative = Path(entry['manifestUrl'].split('/'+prefix+'/')[1]).parent
        folder = source_output/relative
        fit = json.loads((folder/'fit.json').read_bytes())
        names = ['fit.json','manifest.json']+(['contact-report.json'] if 'contactEvidence' in fit else [])
        pending.append((relative,{name:(folder/name).read_bytes() for name in names}))
    return root,output,pending


@contextmanager
def file_lock(path):
    library = ctypes.WinDLL('kernel32',use_last_error=True)
    library.CreateFileW.argtypes = [ctypes.c_wchar_p,ctypes.c_uint32,ctypes.c_uint32,ctypes.c_void_p,ctypes.c_uint32,ctypes.c_uint32,ctypes.c_void_p]
    library.CreateFileW.restype = ctypes.c_void_p
    library.CloseHandle.argtypes = [ctypes.c_void_p];library.CloseHandle.restype = ctypes.c_int
    handle = library.CreateFileW(str(path),0x80000000,1,None,3,0x80,None)
    if handle == ctypes.c_void_p(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        yield
    finally:
        library.CloseHandle(handle)


publisher = module(ROOT/'scripts/publish-preset-short-hair.py','fixed_publisher')
root,output,pending = setup('idempotent-with-real-lock',publisher)
before = snapshot(output);mtimes = {p.relative_to(output).as_posix():p.stat().st_mtime_ns for p in output.rglob('*') if p.is_file()}
with file_lock(output/'catalog.json'):
    try:
        output.rename(root/'calibration')
    except PermissionError as error:
        lock_error = str(error)
    else:
        raise AssertionError('Expected a real catalog-file deny-delete lock')
    actual_sha = publisher.publish(prefix,pending,catalog)
assert actual_sha == sha((output/'catalog.json').read_bytes()) and snapshot(output)==before
assert mtimes=={p.relative_to(output).as_posix():p.stat().st_mtime_ns for p in output.rglob('*') if p.is_file()}
assert not list(root.glob('publish-hair-*'))
results.append({'name':'byte-identical publish succeeds under a real catalog-file deny-delete lock without stage or mtime changes','passed':True,'lockCalibrationError':lock_error})

changed_catalog = copy.deepcopy(catalog);changed_catalog[0]['label']+=' lifecycle-test'
root,output,pending = setup('changed-with-real-lock',publisher);before=snapshot(output)
with file_lock(output/'catalog.json'):
    try:
        publisher.publish(prefix,pending,changed_catalog)
    except RuntimeError as error:
        message = str(error)
    else:
        raise AssertionError('Changed locked publication unexpectedly succeeded')
assert snapshot(output)==before and not list(root.glob('publish-hair-*'))
results.append({'name':'changed publication refuses real directory lock and preserves old files','passed':True,'error':message})

root,output,pending = setup('changed-normal',publisher);before=snapshot(output)
try:
    publisher.publish(prefix,pending,changed_catalog)
    outcome='published'
    expected=(json.dumps(changed_catalog,ensure_ascii=False,indent=2)+'\n').replace('\n',publisher.os.linesep).encode('utf8')
    assert (output/'catalog.json').read_bytes()==expected
    assert {k:v for k,v in before.items() if k!='catalog.json'}=={k:v for k,v in snapshot(output).items() if k!='catalog.json'}
except RuntimeError as error:
    outcome='explicit OS failure with old output restored'
    assert snapshot(output)==before
results.append({'name':'changed unlocked publication completes or reports the actual OS failure without corrupting old files','passed':True,'outcome':outcome})

original_rename = Path.rename
root,output,pending = setup('install-with-real-stage-file-lock',publisher);before=snapshot(output)
def locked_stage_rename(path,target):
    if path.name=='next' and path.parent.name.startswith('publish-hair-'):
        with file_lock(path/'catalog.json'):
            return original_rename(path,target)
    return original_rename(path,target)
try:
    with patch.object(Path,'rename',locked_stage_rename):
        publisher.publish(prefix,pending,changed_catalog)
except RuntimeError as error:
    message=str(error)
    install_winerror=error.__cause__.winerror
else:
    raise AssertionError('Expected a real stage-lock installation denial')
assert install_winerror==5 and snapshot(output)==before and not list(root.glob('publish-hair-*'))
results.append({'name':'real staged catalog lock reproduces WinError5 at installation and restores previous output','passed':True,'winerror':install_winerror,'error':message,'fixture':'Controlled file-handle timing only; Path.rename still executes the real Windows operation.'})

for name,baseline,fail_restore,interrupt in [
    ('install-failure-restored',False,False,False),
    ('restore-failure-preserves-backup',False,True,False),
    ('interrupt-preserves-backup',False,False,True),
    ('baseline-restore-failure',True,True,False),
]:
    current = module(OUT/'publisher-before-swap.py','baseline_publisher') if baseline else publisher
    root,output,pending=setup(name,current);before=snapshot(output)
    def injected_rename(path,target):
        if path.name=='next' and path.parent.name.startswith('publish-hair-'):
            if interrupt:raise KeyboardInterrupt('injected interruption after previous directory moved')
            raise PermissionError('injected stage installation denial')
        if fail_restore and path.name=='previous' and path.parent.name.startswith('publish-hair-'):
            raise PermissionError('injected previous restoration denial')
        return original_rename(path,target)
    try:
        with patch.object(Path,'rename',injected_rename):
            current.publish(prefix,pending,changed_catalog)
    except BaseException as error:
        message=type(error).__name__+': '+str(error)
    else:
        raise AssertionError('Expected a fault-injection failure')
    backups=list(root.glob('publish-hair-*/previous'))
    if baseline:
        # This demonstrates the old TemporaryDirectory cleanup deleting the
        # only previous copy when both installation and rollback are denied.
        assert not output.exists() and not backups
        results.append({'name':name,'finding':'previous output and its backup both removed by automatic cleanup','passed':True,'error':message,'fixture':'Two precise rename denials, all other file operations real.'})
    elif fail_restore or interrupt:
        assert not output.exists() and len(backups)==1 and snapshot(backups[0])==before
        receipt=backups[0].parent/'RECOVERY.json'
        assert receipt.exists()
        results.append({'name':name,'passed':True,'error':message,'previousBytesPreserved':True,'recoveryReceipt':str(receipt.relative_to(OUT)),'fixture':'Precise rename denial/interruption injection, all other file operations real.'})
    else:
        assert snapshot(output)==before and not backups and not list(root.glob('publish-hair-*'))
        results.append({'name':name,'passed':True,'error':message,'previousBytesRestored':True,'fixture':'Stage-install rename denial only, all other file operations real.'})

report={'publisherSha256':sha((ROOT/'scripts/publish-preset-short-hair.py').read_bytes()),
        'baselinePublisherSha256':sha((OUT/'publisher-before-swap.py').read_bytes()),'results':results,
        'limits':['Real source payloads and a real Windows deny-delete catalog-file handle are used for idempotence and lock checks.',
                  'Install/restore failure and interruption cases explicitly inject those failures at Path.rename. Remaining I/O and byte comparisons are real.',
                  'The initial directory-handle calibration did not prevent rename and is retained as a fixture failure. Catalog-file locking does reproduce native WinError5. All output operations are confined to private scratch roots. Real root public and GPU/browser are untouched.']}
(OUT/'swap-report.json').write_bytes((json.dumps(report,ensure_ascii=False,indent=2)+'\n').encode())
print(json.dumps({'checks':len(results),'passed':True,'publisherSha256':report['publisherSha256']}))
