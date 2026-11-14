"""Generate a disposable comparison release; this does NOT recover source code."""
import hashlib
import json
import pathlib
import shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'baseline' / 'packs' / 'present_motion_v1_1111_MT'
DEST = ROOT / 'comparison-fixed'
BUNDLE = pathlib.Path('assets/present_motion_v1_1111_MT-DBfKYVCQ.js')
EXPECTED = 'cd550920c54b1f0d5882af3d090b624e0926ad62843ea6d2ad0bb8327bcab900'
OLD = 'm=n+(f*u-p*d)*a,h=r+(f*d+p*u)*o'
NEW = 'm=n+f*a*u-p*o*d,h=r+f*a*d+p*o*u'

original = (SOURCE / BUNDLE).read_bytes()
assert hashlib.sha256(original).hexdigest() == EXPECTED, 'Unexpected baseline: stop rather than patch another version'
text = original.decode('utf-8')
assert text.count(OLD) == 1, 'Expected exactly one bone translation formula'
patched = text.replace(OLD, NEW).encode('utf-8')
shutil.copytree(SOURCE, DEST, dirs_exist_ok=True)
(DEST / BUNDLE).write_bytes(patched)
manifest = {
    'baselineCommit': '92c1ee2b666288526e4ca974187f8b4fc5efb376',
    'baselineBundleSha256': EXPECTED,
    'patchedBundleSha256': hashlib.sha256(patched).hexdigest(),
    'replacements': 1,
    'scope': 'Temporary release-only S*R to R*S child-translation comparison, not full affine hierarchy repair, not recovered source',
    'old': OLD,
    'new': NEW,
    'entry': '/comparison-fixed/index.html',
}
(DEST / 'PATCH-MANIFEST.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(json.dumps(manifest, indent=2))
