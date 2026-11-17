"""CPU readback and unaltered screenshot review sheets; no browser/asset changes."""
import json
import pathlib
from PIL import Image, ImageDraw

BASE = pathlib.Path(__file__).resolve().parent
report = json.loads((BASE / 'run-1/report.json').read_text(encoding='utf-8'))
for camera in ['front', 'side']:
    pairs = [p for p in report['pairedFrames'] if p['camera'] == camera and p['label'].startswith('walk-')]
    sheet = Image.new('RGB', (1040, 1293), 'white')
    draw = ImageDraw.Draw(sheet)
    for row, pair in enumerate(pairs):
        for col, frame in enumerate(pair['frames']):
            image = Image.open(BASE / 'run-1' / frame['image']).convert('RGB')
            image.thumbnail((520, 407))
            x, y = col * 520, row * 431
            sheet.paste(image, (x, y + 24))
            draw.text((x + 4, y + 5), pair['label'] + ' ' + frame['mode'], fill='black')
    sheet.save(BASE / ('walk-' + camera + '-comparison.png'))

pairs = [p for f in report['pairedFrames'] for s in f['frames'] for p in s['observation']['pairs']]
summary = {
    'schema': 'native-equipment-room-visual-readback-v1',
    'programmaticCaptureStatus': report['status'],
    'visualStatus': 'failed-visible-black-garment-regions',
    'maximumWorldGeometryErrorM': max(p['maximumWorldErrorM'] for p in pairs),
    'allPreservedVisibilityUnchanged': all(s['observation']['preservedVisibilityUnchanged'] for f in report['pairedFrames'] for s in f['frames']),
    'allSourceAndIndependentMaterialsMToon': all(m['isMToonMaterial'] for p in pairs for k in ['sourceMaterials', 'independentMaterials'] for m in p[k]),
    'clips': [{
        'mode': c['mode'], 'cycles': c['cycles'], 'wallSeconds': c['elapsedSeconds'],
        'appliedMotionSeconds': c['appliedSeconds'],
        'firstCallbackMinusInitializationSeconds': c['firstCallbackMinusInitializationSeconds'],
        'maximumRawFrameDeltaSeconds': max(f['rawDeltaSeconds'] for f in c['clockFrames']),
        'timeDiscardedBy50msCapSeconds': c['elapsedSeconds'] - c['appliedSeconds'],
    } for c in report['clips']],
    'videoScope': 'Contains initial loading, paused pair captures with instant diagnostic steps and two wall-clock clips. Only the clips are claimed as normal-speed walking.',
    'navigationTested': False,
    'fullFactoryAdmitted': False,
}
(BASE / 'review-readback.json').write_bytes((json.dumps(summary, indent=2) + '\n').encode('utf-8'))
print(json.dumps(summary))
