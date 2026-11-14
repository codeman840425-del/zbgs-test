"""Summarize existing fixed live evidence; no browser and no source changes."""
import json
import pathlib
import sys
import cv2

folder = pathlib.Path(sys.argv[1])
reports = json.loads((folder / 'report.json').read_text(encoding='utf8'))
videos = {r['movie']: r for r in json.loads((folder / 'decoded-video-summary.json').read_text(encoding='utf8'))}
summary = []
for report in reports:
    samples = report['samples']
    name = report['inputs']['config']['name']
    expression_ranges = {key: [min(s['expressions'][key] for s in samples), max(s['expressions'][key] for s in samples)] for key in samples[0]['expressions']}
    eyes = [[max(s['eyes'][eye][axis] for s in samples) - min(s['eyes'][eye][axis] for s in samples) for axis in range(4)] for eye in range(2)]
    contact = max(samples, key=lambda s: s['contact']['maxDepth'])
    summary.append({
        'case': name, 'build': report['build']['shortId'], 'sourceDigest': report['build']['sourceDigest'],
        'development': report['build']['development'], 'inputs': report['inputs'],
        'wallDuration': report['wallDuration'], 'video': videos[name + '.webm'],
        'samples': len(samples), 'pageerrors': report['errors'], 'expressionRanges': expression_ranges,
        'rawEyeQuaternionComponentRanges': eyes,
        'maxHandlePenetrationMm': contact['contact']['maxDepth'] * 1000,
        'maxHandlePenetrationSampleTime': contact['t'],
        'maxHandVerticesOver1mm': max(s['contact']['insideHandleOver1mm'] for s in samples),
        'armReachClampSamples': sum(bool(s['live']['arm'] and s['live']['arm']['reachClamped']) for s in samples),
        'latestToggleFinalStatus': report['cleanup']['afterRace']['accessories']['mic']['status'],
        'danceWithMicAllowed': report['cleanup']['dance']['allowed'],
        'remainingAccessoryNodes': report['cleanup']['remainingAccessoryNodes'],
        'fitVerified': samples[-1]['live']['fit']['verified'],
    })
    cap = cv2.VideoCapture(str(folder / (name + '.webm')))
    best = None
    target = 2.65
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        t = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000
        if best is None or abs(t - target) < abs(best[0] - target):
            best = (t, frame)
        if t > target + .1:
            break
    cap.release()
    if best:
        cv2.imwrite(str(folder / (name + '-decoded-blink.png')), best[1])
        summary[-1]['blinkDecodedFrameTimestamp'] = best[0]
(folder / 'compact-summary.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf8')
print(json.dumps([{k: s[k] for k in ['case', 'build', 'samples', 'maxHandlePenetrationMm', 'latestToggleFinalStatus', 'remainingAccessoryNodes']} for s in summary], indent=2))
