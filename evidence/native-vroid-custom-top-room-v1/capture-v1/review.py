"""CPU readback of captured switching states and pixels. No new browser run."""
import hashlib
import json
import pathlib
import numpy as np
import imageio_ffmpeg
from PIL import Image, ImageDraw

BASE = pathlib.Path(__file__).resolve().parent
r = json.loads((BASE / 'run-1/report.json').read_text(encoding='utf-8'))
summary = {'schema': 'native-custom-top-room-review-v1', 'build': r['build'], 'commit': r['commit'],
    'pausedRestoreStateExact': r['pausedOriginalRestoreExact'], 'pixelComparisons': [],
    'firstPausedCustomAlpha': r['transitions'][1]['captures'][0]['observation']['firstDrawGPUAlpha'],
    'postClipEquipmentRestore': r['afterClipRestore']['state']['equipment'],
    'finalScreenBadgeStale': True, 'finalScreenBadgeActualState': 'original equipment restored, badge still custom',
    'fullFactoryAdmitted': False, 'navigationTested': False}
sheet = Image.new('RGB', (1560, 455), 'white')
draw = ImageDraw.Draw(sheet)
for camera in ['front', 'cuffs', 'side']:
    a = np.asarray(Image.open(BASE / 'run-1' / ('original-before-' + camera + '.png')).convert('RGBA'))
    b = np.asarray(Image.open(BASE / 'run-1' / ('original-restored-' + camera + '.png')).convert('RGBA'))
    c = np.asarray(Image.open(BASE / 'run-1' / ('custom-first-paused-' + camera + '.png')).convert('RGBA'))
    def diff(x, y):
        d = np.max(np.abs(x.astype(int) - y.astype(int)), axis=2)
        yy, xx = np.where(d > 0)
        return {'changedPixels': int(np.count_nonzero(d)), 'maximumChannelDifference': int(d.max()),
            'bboxXYXY': None if not len(xx) else [int(xx.min()), int(yy.min()), int(xx.max()+1), int(yy.max()+1)]}
    summary['pixelComparisons'].append({'camera': camera, 'originalVsRestored': diff(a,b), 'originalVsCustom': diff(a,c)})
for i, name in enumerate(['original-before', 'custom-first-paused', 'original-restored']):
    image = Image.open(BASE / 'run-1' / (name + '-cuffs.png')).convert('RGB')
    image.thumbnail((520,407));sheet.paste(image,(i*520,30));draw.text((i*520+8,8),name,fill='black')
sheet.save(BASE / 'cuff-switch-comparison.png')
clip = r['clips'][0]
video = clip['pureClip']
stream = imageio_ffmpeg.read_frames(str(BASE / 'run-1' / video['file']))
metadata = next(stream);stream.close()
summary['video'] = {**video, 'metadata': metadata, 'wallSeconds': clip['elapsedSeconds'],
    'motionSeconds': clip['appliedSeconds'], 'cycles': clip['cycles'],
    'maximumRawFrameDeltaSeconds': max(f['rawDeltaSeconds'] for f in clip['clockFrames']),
    'scope': 'Pure canvas clip with first-RAF epoch, shared createMotion treadmill. Full Playwright film includes diagnostics.'}
summary['restoredOriginalIdentity'] = [{'id': e['id'], 'sha256': e['sha256'], 'visible': e['visible']} for e in r['afterClipRestore']['state']['equipment']]
(BASE / 'review-readback.json').write_bytes((json.dumps(summary, indent=2)+'\n').encode('utf-8'))
print(json.dumps(summary))
