"""Restore the one audited third-party beta export; no product installation."""
import hashlib,pathlib,urllib.request,zipfile,io
OUT=pathlib.Path(__file__).resolve().parent
URL='https://opengameart.org/sites/default/files/base_male.zip'
ZIP_SHA='8a6049236aae93a31392c56cf2606bd2d3a74711c156e34225616f1ab3cc91b8'
VRM_SHA='ab9af434a229283c192546486f9e6eb9cd855bf7d8d45b5037ac211938cb903c'
p=OUT/'Base_Male.vrm'
if p.exists():
 assert hashlib.sha256(p.read_bytes()).hexdigest()==VRM_SHA,'Existing VRM differs; preserve and inspect it'
 print('Verified existing candidate:',VRM_SHA)
 raise SystemExit(0)
with urllib.request.urlopen(URL,timeout=60) as response:archive=response.read()
assert hashlib.sha256(archive).hexdigest()==ZIP_SHA,'Unexpected archive: do not silently repin'
with zipfile.ZipFile(io.BytesIO(archive)) as z:
 assert z.namelist()==['Base_Male.vrm'],z.namelist()
 data=z.read('Base_Male.vrm')
assert hashlib.sha256(data).hexdigest()==VRM_SHA
p.write_bytes(data)
print('Verified candidate:',VRM_SHA)
