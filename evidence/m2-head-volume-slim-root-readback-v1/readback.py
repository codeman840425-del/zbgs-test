"""Review saved solver results only. No geometry generation or solver invocation."""
from pathlib import Path
import hashlib
import json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).parent
if (OUT / 'report.json').exists():
    raise SystemExit('Preserve previous readback')
BASE = ROOT / 'assets-source/m2-head-volume-slim-v1'
recovery = json.loads((BASE / 'recovered-readback/report.json').read_bytes())
for name, expected in recovery['originalFilesBefore'].items():
    assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected, name
domain = np.load(ROOT / 'assets-source/m2-head-volume-domain-v1/generated/domain.npz')
source = json.loads((ROOT / 'assets-source/m2-head-cage-skin-domain-v1/generated/male.json').read_bytes())
source_points = np.asarray(source['sourceLandmarksM'])
origin = np.asarray(source['rawHeadRestOriginM'])
fig, axes = plt.subplots(1, 2, figsize=(11, 5.3), layout='constrained')
rows = []
for ax, identifier in zip(axes, ['male-long-lean-v2', 'male-round-stocky-v2']):
    path = BASE / 'recovered-readback' / (identifier + '.json')
    report = json.loads(path.read_bytes())
    positions = np.load(BASE / 'generated' / identifier / 'solved-nodes.npz')['positionsM']
    tets = domain['tetrahedra']
    old = domain['nodesM'][tets]
    new = positions[tets]
    old6 = np.einsum('ij,ij->i', old[:, 1]-old[:, 0], np.cross(old[:, 2]-old[:, 0], old[:, 3]-old[:, 0]))
    new6 = np.einsum('ij,ij->i', new[:, 1]-new[:, 0], np.cross(new[:, 2]-new[:, 0], new[:, 3]-new[:, 0]))
    ratio = new6 / old6
    saved = np.load(BASE / 'generated' / identifier / 'tetra-readback.npz')['tetraDeterminants']
    protection = np.linalg.norm((positions-domain['nodesM'])[domain['protectedNodes']], axis=1)
    section = report['original101HorizontalSectionsFloat32']
    desired = np.asarray(section['requestedHalfWidthsM']) * 1000
    actual = np.asarray([np.nan if x is None else x for x in section['actualHalfWidthsM']]) * 1000
    y = np.asarray(section['requestedYMetres']) * 1000
    ax.plot((source_points[1::2, 0]-source_points[::2, 0])*500,
            (source_points[::2, 1]-origin[1])*1000, color='#7b8792', label='Original surface')
    ax.fill_betweenx(y, desired-2, desired+2, color='#f1a340', alpha=.15, label='Target +/- 2 mm')
    ax.plot(desired, y, color='#c16d00', linestyle='--', label='Requested section')
    ax.plot(actual, y, color='#006f99', label='Stored result (Float32)')
    ax.set(title=identifier.replace('-v2',''), xlabel='Half width (mm)', ylabel='Head-local section Y (mm)')
    ax.grid(alpha=.2)
    ax.legend(fontsize=8)
    rows.append({'id': identifier, 'recoveredReportSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                 'minimumActualSignedVolumeRatio': float(ratio.min()),
                 'maximumRatioVersusSavedJacobianDetDifference': float(abs(ratio-saved).max()),
                 'protectedMaximumDisplacementM': float(protection.max()),
                 'protectedNodesOver2Micrometres': int((protection > 2e-6).sum()),
                 'float32SectionMaximumErrorM': section['maximumErrorM'],
                 'missingSections': section['missingSections'], 'productionAdmitted': False})
fig.suptitle('Stored numerical failures - not game renders or accepted character assets', fontsize=12)
fig.savefig(OUT / 'actual-versus-requested-sections.png', dpi=150)
plt.close(fig)
value = {'schema': 'native-head-slim-root-readback-v1', 'solverCalled': False,
         'allOriginalBeforeHashesMatch': True, 'cases': rows,
         'limits': 'Fixed 20-iteration outputs only. Failure is not an infeasibility proof. No contact/VRM/game claim.'}
(OUT / 'report.json').write_bytes((json.dumps(value, indent=2)+'\n').encode())
print(json.dumps(value))
