"""Import the restored official tool and inspect API, without calling a solver."""
import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import sys

parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
report={'schema':'restored-slim-import-v1','status':'checking','solverExecuted':False,'tetgenOrCgalCalled':False}
try:
    prefix=Path(sys.prefix).resolve()
    if sys.prefix==sys.base_prefix: raise ValueError('Expected a real isolated venv')
    import numpy
    import scipy
    import igl
    paths={name:Path(module.__file__).resolve() for name,module in [('numpy',numpy),('scipy',scipy),('igl',igl)]}
    if not all(path.is_relative_to(prefix) for path in paths.values()): raise ValueError('Import escaped restored venv')
    config=(prefix/'pyvenv.cfg').read_text()
    if 'include-system-site-packages = false' not in config: raise ValueError('System site packages enabled')
    apis={name:getattr(igl,name).__doc__ for name in ['slim_precompute','slim_solve']}
    if not all(callable(getattr(igl,name)) for name in apis): raise ValueError('Missing official SLIM API')
    getattr(igl,'MappingEnergyType').SYMMETRIC_DIRICHLET
    binaries=[]
    for name in ['libigl','numpy','scipy']:
        distribution=importlib.metadata.distribution(name)
        for entry in distribution.files:
            if str(entry).lower().endswith(('.pyd','.dll')):
                path=Path(distribution.locate_file(entry)).resolve()
                if not path.is_relative_to(prefix): raise ValueError('Binary escaped isolated venv')
                binaries.append({'distribution':name,'path':path.relative_to(prefix).as_posix(),
                    'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size})
    loaded=sorted(name for name in sys.modules if name=='igl' or name.startswith('igl.'))
    if any(any(t in name for t in ['copyleft','tetgen','cgal']) for name in loaded): raise ValueError('Unexpected optional module imported')
    report.update(status='isolated-import-and-api-check-passed',python=sys.version,prefix=str(prefix),basePrefix=sys.base_prefix,
        versions={name:importlib.metadata.version(name) for name in ['libigl','numpy','scipy']},
        importPaths={name:str(path) for name,path in paths.items()},loadedIglModules=loaded,apiDocstrings=apis,
        installedBinaryIdentities=binaries,systemSitePackages=False)
except Exception as error:
    report.update(status='failed-no-retry',error=f'{type(error).__name__}: {error}')
args.output.write_bytes((json.dumps(report,indent=2)+'\n').encode())
print(json.dumps({'status':report['status'],'error':report.get('error')}))
raise SystemExit(0 if report['status']=='isolated-import-and-api-check-passed' else 2)
