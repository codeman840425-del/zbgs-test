"""Summarize the bounded hand control without inference or modifying raw data."""
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'evidence/dance-video-pose-v1'


def sha(data):
    return hashlib.sha256(data).hexdigest()


raw_file = OUT / 'hand-roi-results.raw.json'
results = json.loads(raw_file.read_text(encoding='utf-8'))
snapshot = (OUT / 'sequence.raw.json.gz').read_bytes()
uncompressed = gzip.decompress(snapshot)
expected = json.loads((OUT / 'summary.json').read_text(encoding='utf-8'))
assert sha(snapshot) == expected['raw_snapshot']['sha256']
assert sha(uncompressed) == expected['raw_sequence_sha256']
local = ROOT / 'analysis/dance-reference-v1/results/sequence.json'
if local.exists():
    assert local.read_bytes() == uncompressed
rows = []
for comparison in results['comparisons']:
    rows.append({
        'frame': comparison['source_frame_index'],
        'source_seconds': comparison['source_seconds'],
        'full_image_1280_count': len(comparison['full_1280_image_hands']),
        'rois': [{'pose_named_side': r['input']['pose_named_side'],
                  'native_512_count': r['native_count'],
                  'same_fov_171_count': r['low_count']} for r in comparison['rois']],
    })
report = {
    'source_manifest': 'source.json',
    'inputs_manifest': 'hand-roi-inputs.json',
    'raw_control_output': raw_file.name,
    'raw_control_output_sha256': sha(raw_file.read_bytes()),
    'comparisons': rows,
    'native_roi_with_detection': sum(r['native_512_count'] > 0 for row in rows for r in row['rois']),
    'low_roi_with_detection': sum(r['same_fov_171_count'] > 0 for row in rows for r in row['rois']),
    'roi_count': sum(len(row['rois']) for row in rows),
    'visual_observation': {
        'review_image_local_only': 'analysis/dance-reference-v1/hand-roi-control/comparison.jpg',
        'missing': ['299 left: face/hair occlusion', '599 right: incomplete hand absent from fixed body-wrist ROI'],
        '479_right_low_second_detection': 'Crop edge includes another partly visible hand. Association is ambiguous; not a verified false positive or proof that more detections are better.',
        'accuracy': 'Most detected wrist/palm positions lie near visible hands qualitatively. No quantitative point accuracy or complete-finger acceptance.',
    },
    'conclusion': 'Both native512 and same-FOV171 detect in 10/12 ROIs. Framing/apparent hand scale helps versus whole1280 image, but native4K pixel-detail superiority and pixel resolution as the exclusive cause are not established.',
    'scope': 'Six independent IMAGE samples, same thresholds; not temporal tracking, not a full720 ROI run, no raw-video fusion or correction.',
    'raw_sequence_integrity': {
        'snapshot_sha256': sha(snapshot),
        'decompressed_sha256': sha(uncompressed),
        'matches_original_summary': True,
        'matches_local_raw_if_present': True if local.exists() else None,
    },
}
(OUT / 'hand-roi-summary.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
manifest_path = OUT / 'tooling-manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
for name in ['diagnose_turn_pairing.py', 'hand_roi_control.py', 'summarize_hand_roi.py']:
    path = Path('scripts/pose-reference') / name
    manifest[str(path)] = sha((ROOT / path).read_bytes())
manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(json.dumps({'roi_with_detection_native_low': [report['native_roi_with_detection'], report['low_roi_with_detection']], 'raw_integrity': report['raw_sequence_integrity']}, indent=2))
