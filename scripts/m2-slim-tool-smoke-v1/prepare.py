"""Install three SHA-verified official binary wheels into one dedicated venv."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import sys
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[2]
TOOL = ROOT / 'experiments/tools/slim-core-2.6.3'
OUT = ROOT / 'evidence/m2-slim-tool-smoke-v1'
PACKAGES = [('libigl', '2.6.3', 'libigl-2.6.3-cp312-abi3-win_amd64.whl'),
    ('numpy', '2.4.2', 'numpy-2.4.2-cp313-cp313-win_amd64.whl'),
    ('scipy', '1.18.1', 'scipy-1.18.1-cp313-cp313-win_amd64.whl')]
EXPECTED_IGL = '1d91745ed0e78c56a04539e3231ce6faff49ae0dbe123caa2034e1886fcb2e7d'


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'Codex-isolated-SLIM-smoke'})
    return urllib.request.urlopen(request, timeout=60)


def write(name, value):
    (OUT / name).write_bytes((json.dumps(value, indent=2) + '\n').encode())


if __name__ == '__main__':
    if TOOL.exists() or (OUT / 'prepare-report.json').exists():
        raise ValueError('Keep prior attempt. Dedicated tool/output must be new.')
    if sys.version_info[:2] != (3, 13):
        raise ValueError('This fixed wheel set requires CPython 3.13 x64')
    TOOL.mkdir(parents=True)
    wheelhouse = TOOL / 'wheelhouse'
    wheelhouse.mkdir()
    result = {'schema': 'slim-isolated-prepare-v1', 'status': 'preparing', 'packages': [],
        'globalPythonModified': False, 'systemSitePackages': False, 'sourceCompilation': False}
    try:
        for name, version, filename in PACKAGES:
            metadata_url = f'https://pypi.org/pypi/{name}/{version}/json'
            with fetch(metadata_url) as response:
                metadata = json.load(response)
            row = next(x for x in metadata['urls'] if x['filename'] == filename)
            expected = row['digests']['sha256']
            if name == 'libigl' and expected != EXPECTED_IGL:
                raise ValueError('Official libigl SHA changed from approved readiness pin')
            target = wheelhouse / filename
            with fetch(row['url']) as response, target.open('wb') as output:
                while chunk := response.read(1024 * 1024):
                    output.write(chunk)
            actual = hashlib.sha256(target.read_bytes()).hexdigest()
            if actual != expected:
                raise ValueError('Wheel SHA mismatch: ' + filename)
            licenses = []
            with zipfile.ZipFile(target) as archive:
                for entry in archive.namelist():
                    if entry.endswith('/') or '.dist-info/' not in entry:
                        continue
                    lower = entry.lower()
                    if not ('license' in lower or 'copying' in lower or 'notice' in lower or lower.endswith('/metadata')):
                        continue
                    relative = PurePosixPath(entry)
                    if relative.is_absolute() or '..' in relative.parts:
                        raise ValueError('Unsafe wheel notice path')
                    data = archive.read(entry)
                    destination = OUT / 'wheel-notices' / name / str(relative)
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_bytes(data)
                    licenses.append({'wheelPath': entry, 'evidencePath': destination.relative_to(ROOT).as_posix(),
                        'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)})
            result['packages'].append({'name': name, 'version': version, 'filename': filename,
                'url': row['url'], 'metadataUrl': metadata_url, 'sha256': actual, 'bytes': target.stat().st_size,
                'requiresDist': metadata['info'].get('requires_dist'), 'licenseExpression': metadata['info'].get('license_expression'),
                'notices': licenses})
        lock = ''.join(f"{row['name']}=={row['version']} --hash=sha256:{row['sha256']}\n" for row in result['packages'])
        (OUT / 'requirements.lock').write_bytes(lock.encode())
        venv = TOOL / '.venv'
        subprocess.run([sys.executable, '-m', 'venv', str(venv)], check=True)
        python = venv / 'Scripts/python.exe'
        command = [str(python), '-m', 'pip', 'install', '--disable-pip-version-check', '--no-index',
            '--only-binary=:all:', '--no-deps', '--require-hashes', '--find-links', str(wheelhouse),
            '-r', str(OUT / 'requirements.lock')]
        with (OUT / 'install.log').open('wb') as log:
            subprocess.run(command, check=True, stdout=log, stderr=subprocess.STDOUT,
                env={**os.environ, 'PIP_NO_INPUT': '1'})
        result.update(status='isolated-binary-install-complete', venv=str(venv), python=str(python),
            pipCommand=command, venvConfig=(venv / 'pyvenv.cfg').read_text())
    except Exception as error:
        result.update(status='failed-no-retry', error=str(error))
        raise
    finally:
        write('prepare-report.json', result)
    print(json.dumps({'status': result['status'], 'packages': len(result['packages'])}))
