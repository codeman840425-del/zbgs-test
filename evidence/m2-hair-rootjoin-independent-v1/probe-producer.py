import sys
sys.dont_write_bytecode=True
from pathlib import Path
import contextlib, hashlib, importlib.util, io, json, shutil, traceback
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent;SOURCE=ROOT/'assets-source/m2-long-hair-v1/revisions/rootjoin-v2'
sha=lambda b:hashlib.sha256(b).hexdigest()
checks=[];fatal=None
def check(name,passed,**details):
    checks.append(dict(name=name,passed=bool(passed),**details))
    if not passed:raise AssertionError(name)
def sources():
    return {str(p.relative_to(ROOT)).replace('\\','/'):sha(p.read_bytes()) for p in (ROOT/'assets-source/m2-long-hair-v1').rglob('*') if p.is_file()}
initial=sources()
try:
    spec=importlib.util.spec_from_file_location('reviewed_rootjoin',ROOT/'scripts/m2-long-hair-v1/rootjoin-v2.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    # Redirect only the producer's allowed revision output root. All actual
    # scripts, v1 input resources and source-body bytes remain read-only inputs.
    stage=OUT/'producer-stage';stage.mkdir(exist_ok=False);shutil.copyfile(SOURCE/'spec.json',stage/'spec.json');module.REV=stage
    def run(args=[]):
        saved=sys.argv;sys.argv=[str(ROOT/'scripts/m2-long-hair-v1/rootjoin-v2.py'),*args];capture=io.StringIO()
        try:
            with contextlib.redirect_stdout(capture):module.main()
        finally:sys.argv=saved
        return capture.getvalue()
    first=run();names=['female-ponytail.glb','fit.json','manifest.json','build-report.json','qa-report.json']
    check('actual producer with isolated output root emits exact committed five-file bytes',all((stage/n).read_bytes()==(SOURCE/n).read_bytes() for n in names),output=json.loads(first),outputRedirection=str(stage))
    before={n:((stage/n).read_bytes(),(stage/n).stat().st_mtime_ns) for n in names};second=run()
    check('actual producer repeated invocation preserves bytes and modification times',all(((stage/n).read_bytes(),(stage/n).stat().st_mtime_ns)==before[n] for n in names))
    (stage/'fit.json').write_bytes(b'{"intentional-independent-conflict":true}\n');conflicted={p.name:p.read_bytes() for p in stage.iterdir() if p.is_file()}
    rejection=None
    try:run()
    except Exception as e:rejection=str(e)
    check('actual producer rejects conflicting planned output before any write',rejection is not None and 'Existing revision output differs' in rejection and conflicted=={p.name:p.read_bytes() for p in stage.iterdir() if p.is_file()},error=rejection)
    escaped=OUT/'outside-stage';scopeError=None
    try:run(['--out',str(escaped.relative_to(ROOT)).replace('\\','/')])
    except Exception as e:scopeError=str(e)
    check('actual producer rejects output outside its isolated revision root',scopeError is not None and 'Output must remain inside rootjoin-v2' in scopeError and not escaped.exists(),error=scopeError)
except Exception as e:fatal=dict(message=str(e),stack=traceback.format_exc())
finally:
    stable=initial==sources();checks.append(dict(name='producer probes never change actual source inventory inputs or revision files',passed=stable))
report=dict(schema='hair-rootjoin-independent-producer-v1',generatorSha256=sha((ROOT/'scripts/m2-long-hair-v1/rootjoin-v2.py').read_bytes()),checks=checks,fatal=fatal,limits=['Actual producer main executed with its REV output root redirected into owned evidence. Input BASE, build helpers, body source and code unchanged.','Conflict staging intentionally retains a corrupt fit.json as negative evidence. It is not a publishable package.'])
(OUT/'report-producer-v1.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(dict(checks=len(checks),fatal=fatal,sourceStable=stable),indent=2));sys.exit(1 if fatal or not stable else 0)
