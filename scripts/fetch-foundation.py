"""Restore the exact preserved candidate; never silently replace a changed file."""
import hashlib,io,pathlib,urllib.request,zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
TARGET=ROOT/'prototype/public/assets/foundation/base-female.vrm'
EXPECTED='1995f174f6c8f2211f3c56c9e5fe4f9daf27ee5e648f129479582a259238149b'
if TARGET.exists():
    assert hashlib.sha256(TARGET.read_bytes()).hexdigest()==EXPECTED, 'Existing candidate differs; will not overwrite'
else:
    with urllib.request.urlopen('https://opengameart.org/sites/default/files/base_female.zip',timeout=60) as response:
        archive=response.read()
    assert hashlib.sha256(archive).hexdigest()=='bf2717cff70b40a278df56e137dbb699c6499551096fa4c005e9aeca1de68eb3'
    with zipfile.ZipFile(io.BytesIO(archive)) as z: data=z.read('Base_Female.vrm')
    assert hashlib.sha256(data).hexdigest()==EXPECTED
    TARGET.parent.mkdir(parents=True,exist_ok=True);TARGET.write_bytes(data)
print('Candidate verified:',TARGET)
