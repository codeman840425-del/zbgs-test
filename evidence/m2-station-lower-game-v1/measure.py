"""Recompute microphone height against the signed actors' same-frame landmarks."""
import json
from pathlib import Path

folder = Path(__file__).resolve().parent
report = json.loads((folder / 'room-01/report.json').read_bytes())


def span(values):
    return [round(min(values), 3), round(max(values), 3)]


rows = []
for room in report['rooms']:
    for body, group in [('female', 'hold'), ('male', 'maleHold')]:
        snapshots = [sample for session in room['sessions'] for sample in session.get(group, [])]
        poses = [sample.get('physical', sample) for sample in snapshots]
        contacts = [pose['contact'] for pose in poses]
        rows.append({
            'room': room['room'], 'body': body, 'n': len(poses), 'frames': [p['frame'] for p in poses],
            'pickupDistanceCm': span([100 * c['mouthDistance'] for c in contacts]),
            'aboveMouthCm': span([100 * (c['pickupWorld'][1] - c['mouthWorld'][1]) for c in contacts]),
            'aboveEyesCm': span([100 * (c['pickupWorld'][1] - c['eyeWorld'][1]) for c in contacts]),
            'shoePatchHeightsMm': span([1000 * foot['aboveFloorM'] for p in poses for foot in p['feet']['patches']]),
            'sourceRecord': poses[0]['record']
        })

summary = {'build': report['build'], 'package': report['combinedSha256'],
           'units': 'Signed heights are pickup surface first-hit Y minus posed landmark Y', 'samples': rows}
print(json.dumps(summary, indent=2))
