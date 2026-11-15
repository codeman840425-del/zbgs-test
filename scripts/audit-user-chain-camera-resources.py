"""Offline, bounded analysis of existing 175 logs; never opens a browser."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHAIN = ROOT / 'output/playwright/m1/175a487d5ea3/final-user-02/user-chain/report.json'
LIFE = ROOT / 'output/playwright/m1/175a487d5ea3/final-user-03/lifecycle-fixed/report.json'
OUT = ROOT / 'evidence/user-chain-175-camera-resources/analysis.json'


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def read(p):
    return json.loads(p.read_text(encoding='utf-8'))


chain, life = read(CHAIN), read(LIFE)
assert chain['build'] == life['build'] == '175a487d5ea3'
camera = []
for case in chain['cases']:
    rows = case['frames']
    i = next(i for i in range(1, len(rows)) if any(
        abs(a-b) > 1e-8 for a, b in zip(rows[i]['camera']['position'], rows[i-1]['camera']['position'])))
    prev, now = rows[i-1], rows[i]
    a, b = prev['camera'], now['camera']
    ratios = [(q-t)/(p-t) for p, q, t in zip(a['position'], b['position'], a['target'])]
    nearby = [{'name': x['name'], 'simulationTime': x['state']['snapshot']['simulationTime']}
              for x in case['inputs'] if abs(x['state']['snapshot']['simulationTime']-now['simulationTime']) < 1]
    camera.append({'case': case['config']['name'], 'frameIndex': i,
                   'elapsedSeconds': (now['wallMs']-rows[0]['wallMs'])/1000,
                   'previous': prev, 'firstChanged': now,
                   'targetUnchanged': a['target'] == b['target'],
                   'offsetComponentRatios': ratios, 'ratioSpread': max(ratios)-min(ratios),
                   'nearbyCommandMarks': nearby, 'finalCamera': rows[-1]['camera'],
                   'inputInitiator': 'unknown: no wheel/pointer provenance recorded'})
repeats = []
for r in life['records']:
    if r['kind'] != 'repeat':
        continue
    selected = {k: {n: r[k][n] for n in ['time', 'renderer', 'outfit', 'peer']} for k in ['before', 'loaded', 'after']}
    selected.update({'i': r['i'], 'removedCounters': {key: r['loaded']['renderer'][key]-r['after']['renderer'][key]
                                                    for key in ['geometries', 'textures']}})
    repeats.append(selected)
sources = [ROOT/'prototype/src/main.js', ROOT/'prototype/src/m1-equipment.js', ROOT/'prototype/src/m1-skirt.js',
           ROOT/'prototype/node_modules/three/examples/jsm/controls/OrbitControls.js',
           ROOT/'prototype/node_modules/three/src/renderers/webgl/WebGLGeometries.js',
           ROOT/'prototype/node_modules/three/src/renderers/webgl/WebGLTextures.js']
fixed = ROOT/'experiments/m1-integrated-contact-1/dist'
bundle_evidence = []
for p in sorted((fixed/'assets').glob('*.js')):
    text = p.read_text(encoding='utf-8')
    for needle in ['_getZoomScale(e){', '5.8,4.5,7.8', 'M1_UniformSkirt_Constrained']:
        pos = text.find(needle)
        if pos >= 0:
            bundle_evidence.append({'path': str(p.relative_to(ROOT)), 'sha256': sha(p),
                                    'needle': needle, 'offset': pos, 'excerpt': text[max(0,pos-240):pos+280]})
report = {
    'schema': 'offline-user-chain-camera-resources-audit-v1', 'build': chain['build'],
    'inputs': [{'path': str(p.relative_to(ROOT)), 'sha256': sha(p)} for p in [CHAIN, LIFE]],
    'camera': camera, 'lifecycle': {'initial': life['beforeBackground']['renderer'], 'repeats': repeats,
                                  'final': life['final']['renderer'], 'finalPeer': life['final']['peer'],
                                  'finalOutfit': life['final']['outfit']},
    'fixedBundleEvidence': bundle_evidence,
    'readableCurrentSourceReferencesNotClaimedAs175Snapshot': [{'path': str(p.relative_to(ROOT)), 'sha256': sha(p)} for p in sources],
    'conclusions': {
        'camera': 'Exact initial 0.95 and reciprocal dolly fingerprints; room enables orbit controls. Input initiator and UI misrouting remain unproven.',
        'resources': 'Single +1 geometry/+1 texture coincides with first primary skirt render; subsequent peer removal returns to same plateau. Consistent with lazy render allocation retained for outfit reuse.',
        'limits': ['No browser replay in this audit.', 'No resource UUID/GPU allocation trace; exact allocation ownership inferred, not observed.',
                   'Three peer cycles and 20 seconds cannot establish no leak.', 'Renderer counts are not bytes or all CPU/GPU memory.',
                   'Original room camera changes prevent strict same-camera video comparison.']}}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(OUT)
print(json.dumps({'camera': [{'case':c['case'],'seconds':c['elapsedSeconds'],'ratios':c['offsetComponentRatios']} for c in camera],
                  'resources': report['lifecycle']}, ensure_ascii=False, indent=2))
