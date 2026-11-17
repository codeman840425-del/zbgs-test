"""Read-only tool/source inspection. Writes evidence, never installs or executes SLIM."""
import datetime
import hashlib
import importlib.util
import importlib.metadata
import json
from pathlib import Path
import shutil
import subprocess
import sys
import sysconfig
import urllib.request

BASE = Path(__file__).resolve().parent
ROOT = BASE.parents[1]


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'Codex-SLIM-readiness-research'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def write(name, value):
    (BASE / name).write_bytes((json.dumps(value, indent=2) + '\n').encode())


environment = {'python': sys.version, 'executable': sys.executable, 'platform': sysconfig.get_platform(),
    'modules': {name: (s.origin if (s := importlib.util.find_spec(name)) else None)
        for name in ['igl', 'numpy', 'scipy', 'cmake', 'ninja', 'tetgen', 'pyvista']},
    'commands': {name: shutil.which(name) for name in ['cmake', 'cl', 'clang', 'clang++', 'g++', 'ninja', 'git']}}
scopes = ['C:/Program Files/Microsoft Visual Studio', 'C:/Program Files (x86)/Microsoft Visual Studio',
    'C:/Program Files/CMake', 'C:/Program Files (x86)/Windows Kits', 'C:/msys64', 'C:/vcpkg',
    str(ROOT / 'experiments/tools')]
environment['searchedInstallScopes'] = {p: {'exists': Path(p).exists(),
    'children': [q.name for q in Path(p).iterdir()] if Path(p).exists() else []} for p in scopes}
environment['eigenSearch'] = {'scope': 'project scripts/experiments plus listed conventional install roots',
    'foundHeaders': [], 'limit': 'No full-disk claim. Project rg found no Eigen headers or libigl checkout.'}
from packaging.tags import sys_tags
environment['supportsCp312Abi3WinAmd64'] = any(str(t) == 'cp312-abi3-win_amd64' for t in sys_tags())
environment['packageVersions'] = {name: importlib.metadata.version(name) for name in ['numpy', 'scipy', 'packaging']}
blender_python = ROOT / 'experiments/tools/blender-4.5.9-windows-x64/4.5/python/bin/python.exe'
code = "import importlib.util,sys,json; print(json.dumps({'python':sys.version,'igl':bool(importlib.util.find_spec('igl')),'cmake':bool(importlib.util.find_spec('cmake')),'ninja':bool(importlib.util.find_spec('ninja'))}))"
environment['blenderBundledPython'] = json.loads(subprocess.check_output([str(blender_python), '-B', '-c', code]))
environment['operationsNotPerformed'] = ['install', 'compile', 'tetrahedralize', 'SLIM solve', 'shape export', 'GPU/browser']
write('environment.json', environment)

binding = '1336e57322356b6b7fa66119bccd658c6a127cdf'
core = 'f68f01c23ac82351e2543ce8c529b6d4c89fdf16'
files = [('libigl/libigl-python-bindings', binding, path) for path in
    ['src/slim.cpp', 'src/MappingEnergyType.cpp', 'CMakeLists.txt', 'pyproject.toml', 'LICENSE.MPL2']]
files += [('libigl/libigl', core, path) for path in
    ['include/igl/slim.h', 'include/igl/slim.cpp', 'include/igl/flip_avoiding_line_search.cpp', 'include/igl/volume.cpp',
     'tutorial/709_SLIM/main.cpp', 'LICENSE.MPL2']]
records = []
for repo, commit, path in files:
    url = f'https://raw.githubusercontent.com/{repo}/{commit}/{path}'
    data = fetch(url)
    text = data.decode('utf-8', errors='replace')
    records.append({'repository': repo, 'commit': commit, 'path': path, 'url': url,
        'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
        'observedSymbols': [word for word in ['slim_precompute', 'slim_solve', 'SLIMData',
            'SYMMETRIC_DIRICHLET', 'F.cols() == 4', 'soft_const_p', 'flip_avoiding_line_search'] if word in text]})
    if path == 'CMakeLists.txt':
        records[-1]['dependencyLines'] = [line.strip() for line in text.splitlines()
            if any(token in line for token in ['GIT_TAG', 'GIT_REPOSITORY', 'CXX_STANDARD', 'cmake_minimum'])]
    if path == 'src/slim.cpp':
        records[-1]['bindingObservations'] = {'FColumnsDocumented': [3, 4], 'directCoreCall': True,
            'constraintInput': 'Eigen::VectorXi b + Eigen::MatrixXd bc + scalar soft_p',
            'generalBarycentricConstraintMatrixBinding': False, 'runtimeInvoked': False}
    if path == 'include/igl/volume.cpp':
        records[-1]['signedVolumeFormula'] = '-(a-d).dot((b-d).cross(c-d))/6'
package = json.loads(fetch('https://pypi.org/pypi/libigl/2.6.3/json'))
wheels = [{key: row[key] for key in ['filename', 'url', 'digests', 'size', 'requires_python', 'upload_time_iso_8601', 'yanked']}
    for row in package['urls'] if 'win_amd64' in row['filename']]
write('official-source-readback.json', {'observedUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'bindingRelease': {'tag': '2.6.3', 'commit': binding}, 'corePinnedByRelease': core,
    'files': records, 'pypiWindowsWheels': wheels, 'wheelDownloadedOrImported': False,
    'metadataRuntimeAgreementVerified': False})
print(json.dumps({'status': 'readiness-research-only', 'officialFilesRead': len(records), 'windowsWheels': len(wheels)}))
