"""Fetch Quaternius's free Standard download via its public no-payment flow."""
import argparse
import hashlib
import http.cookiejar
import io
import json
import pathlib
import re
import urllib.parse
import urllib.request
import zipfile

ROOT=pathlib.Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser()
parser.add_argument('--output',default='analysis/assets/UAL1_Standard.glb')
parser.add_argument('--archive-output',help='Retain the hash-verified official ZIP; an existing verified ZIP can restore the GLB offline')
args=parser.parse_args()
target=ROOT/args.output
archive_target=ROOT/args.archive_output if args.archive_output else None
if archive_target and archive_target.resolve()==target.resolve():
    parser.error('--output and --archive-output must name different files')
base='https://quaternius.itch.io/universal-animation-library'
zip_sha='cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724'
glb_sha='69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997'
if target.exists():
    assert hashlib.sha256(target.read_bytes()).hexdigest()==glb_sha, 'Preserving unexpected existing file'
archive=None
if archive_target and archive_target.exists():
    archive=archive_target.read_bytes()
    assert hashlib.sha256(archive).hexdigest()==zip_sha, 'Preserving unexpected existing archive; inspect before updating pins'
    print('Verified existing official Standard ZIP:',archive_target)
if target.exists() and (archive_target is None or archive is not None):
    print('Verified existing CC0 animation source:', target)
else:
    if archive is None:
        opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        def get(url):
            with opener.open(url,timeout=120) as response:return response.read()
        def csrf(page):return re.search(r'<meta name="csrf_token" value="([^"]+)"',page).group(1)
        def post(url,token,referer):
            request=urllib.request.Request(url,data=urllib.parse.urlencode({'csrf_token':token}).encode(),headers={'Referer':referer})
            with opener.open(request,timeout=60) as response:return json.loads(response.read())
        purchase=get(base+'/purchase').decode()
        free=post(base+'/download_url',csrf(purchase),base+'/purchase')['url']
        page=get(free).decode()
        # Standard is the free listed file. Do not use Pro/Source or bypass access controls.
        assert 'Universal Animation Library[Standard].zip' in page and 'data-upload_id="17958403"' in page
        download=post(base+'/file/17958403?source=game_download',csrf(page),free)
        archive=get(download['url'])
    assert hashlib.sha256(archive).hexdigest()==zip_sha, 'Upstream package changed: inspect before updating pins'
    z=zipfile.ZipFile(io.BytesIO(archive))
    data=z.read('Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb')
    assert hashlib.sha256(data).hexdigest()==glb_sha
    if archive_target and not archive_target.exists():
        archive_target.parent.mkdir(parents=True,exist_ok=True)
        with archive_target.open('xb') as out:out.write(archive)
        print('Saved verified official Standard ZIP:',archive_target)
    if not target.exists():
        target.parent.mkdir(parents=True,exist_ok=True)
        with target.open('xb') as out:out.write(data)
    license_path=ROOT/'prototype/licenses/quaternius-CC0.txt'
    license_path.parent.mkdir(parents=True,exist_ok=True)
    license_path.write_bytes(z.read('Universal Animation Library[Standard]/License.txt'))
    print('Restored and verified CC0 no-root animation source:',target)
print('43 clips; Quaternius Universal Animation Library Standard. See docs/ASSETS.md.')
