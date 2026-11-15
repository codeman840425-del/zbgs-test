"""Archive the bounded GPU regression, preserving failed and corrected fixtures."""
from pathlib import Path
import hashlib, json, shutil

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DEST = HERE / 'evidence'
RUNS = {
    'initial-blink-mismatch/before': 'output/playwright/m1/269a73423c97/bodydebug-outline-1794708242367',
    'initial-blink-mismatch/after': 'output/playwright/m1/6bc09ad85c3d/bodydebug-outline-1794708254891',
    'sameface/before': 'output/playwright/m1/269a73423c97/bodydebug-outline-1794708377717',
    'sameface/after': 'output/playwright/m1/6bc09ad85c3d/bodydebug-outline-1794708391726',
}

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

index = DEST / 'index.json'
if index.exists():
    rows = json.loads(index.read_text(encoding='utf-8'))['files']
    for row in rows:
        p = DEST / row['path']
        assert p.stat().st_size == row['bytes'] and sha(p) == row['sha256'], p
    print(f'Verified {len(rows)} archived files without ignored output dependencies')
else:
    rows = []
    def copy(source, relative):
        target = DEST / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        assert sha(source) == sha(target)
        rows.append({'path': relative, 'source': source.relative_to(ROOT).as_posix(),
                     'bytes': target.stat().st_size, 'sha256': sha(target)})
    for label, source in RUNS.items():
        folder = ROOT / source
        files = sorted(folder.glob('*.png')) + [folder / 'report.json']
        assert len(files) == 11, folder
        for file in files:
            copy(file, label + '/' + file.name)
    for filename in ['browser-comparison.json', 'browser-comparison-sameface.json']:
        copy(HERE / filename, filename)
    index.write_text(json.dumps({'schemaVersion': 1,
        'scope': 'Initial blink-mismatch failure retained; corrected same-face fixture passes. Static renderer regression only, not action or frame-time acceptance.',
        'files': rows}, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'files': len(rows), 'bytes': sum(r['bytes'] for r in rows)}))
