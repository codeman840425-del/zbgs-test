"""Read existing GLB/capture/trial results; no Blender, physics, browser or source edits.
Run from a restored checkout with the codex/simple-skirt-v1 worktree available.
"""
import argparse
import ast
import gzip
import hashlib
import json
from pathlib import Path
import struct
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--worktree', type=Path, default=ROOT/'experiments/m1-simple-skirt-worktree')
p.add_argument('--output', type=Path, default=ROOT/'evidence/author-motion-input-review.json')
args = p.parse_args()
R = args.worktree.resolve()
S = R/'assets-source/m1/simple-skirt-v1'
A = S/'two-quad-thirds-v1'
src = R/'scripts/m1-assets/simple-skirt/trial-author-cloth-v1.py'
assert hashlib.sha256(src.read_bytes()).hexdigest() == 'ddd5ea2793e6e80de2b3dd23b014c3e57b5592770e5b55d9855bfb35fa256be2'
# Extract only the existing GLB accessor reader. Never execute trial top-level code.
tree = ast.parse((R/'scripts/m1-assets/simple-skirt/gate-active-gap-v1.py').read_text(encoding='utf-8'))
ctx = {'np': np, 'json': json, 'struct': struct}
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'load'], type_ignores=[]), 'frozen-glb-reader', 'exec'), ctx)
raw, doc, read = ctx['load'](A/'m1-sixfold-skirt-two-quad-thirds-v1.glb')
assert hashlib.sha256(raw).hexdigest() == '02950240c98021c63ae78be5058d248709e7a12a4449782ecb03dd43663f9bc7'
pr = doc['meshes'][0]['primitives']
P = np.concatenate([read(x['attributes']['POSITION']) for x in pr])
J = np.concatenate([read(x['attributes']['JOINTS_0']) for x in pr])
W = np.concatenate([read(x['attributes']['WEIGHTS_0']) for x in pr])
skin = doc['skins'][0]
names = [doc['nodes'][i]['name'] for i in skin['joints']]
inverse = read(skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
prep = json.loads((A/'native-author-trial-v1/preparation.json').read_text(encoding='utf-8'))
rmap = np.array(prep['renderToSim'])
reps = np.array([np.where(rmap == i)[0][0] for i in range(max(rmap)+1)])
fixed = prep['fixedVertices']
capturepath = S/'active-gap-hem-v1/continuous-input-v1/capture.json.gz'
assert hashlib.sha256(capturepath.read_bytes()).hexdigest() == 'e494fa798bd954554b430635f43d4aa4417d346aac6391511c08502daebc6d58'
capture = json.loads(gzip.decompress(capturepath.read_bytes()))
posed, rows, prev = [], [], None
for i, f in enumerate(capture['frames'][:18]):
    mats = np.array([np.array(f['bones'][n]).reshape(4, 4).T for n in names])
    for c in f['controls']:
        mats[names.index(c['name'])] = np.array(c['privateWorld']).reshape(4, 4).T
    palette = mats @ inverse
    q = sum(np.einsum('nij,nj->ni', palette[J[:, k]], np.c_[P, np.ones(len(P))])*W[:, k, None] for k in range(4))[:, :3][reps]
    posed.append(q)
    row = {'frame': i+1, 'actionSeconds': f['actionSeconds'], 'simulationTime': f['snapshot']['simulationTime'], 'mode': f['snapshot']['mode'], 'modeTime': f['snapshot']['modeTime'], 'sitProgress': f['snapshot']['motion'].get('sitProgress')}
    if prev is not None:
        row['pinMaxStepMetres'] = float(np.linalg.norm(q[fixed]-posed[-2][fixed], axis=1).max())
        row['collidersMaxStepMetres'] = {m['name']: float(np.linalg.norm(np.array(m['positions']).reshape(-1, 3)-np.array(prev['colliders'][j]['positions']).reshape(-1, 3), axis=1).max()) for j, m in enumerate(f['colliders'])}
        row['sourceSimDt'] = f['snapshot']['simulationTime']-prev['snapshot']['simulationTime']
    rows.append(row)
    prev = f
result = json.loads((A/'native-author-trial-v1/result.json').read_text(encoding='utf-8'))
out = {'scope': 'Read-only existing capture + source GLB LBS; no new physics or Blender evaluation', 'sourceSha256': hashlib.sha256(raw).hexdigest(), 'captureSha256': hashlib.sha256(capturepath.read_bytes()).hexdigest(), 'trialSha256': hashlib.sha256(src.read_bytes()).hexdigest(), 'rows': rows, 'maximumRecordedPinResidualMetres': max(x['fixedPointResidualMetres'] for x in result['summaries']), 'massPerVertex': .15, 'weldedVertices': len(reps), 'sumAssignedVertexMass': .15*len(reps), 'selfNarrowDistanceMetres': 2*.005/10, 'selfResponseTargetMetres': 2*.005*8/9/10}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(out, indent=2)+'\n', encoding='utf-8')
print(json.dumps({'output': str(args.output), 'sha256': hashlib.sha256(args.output.read_bytes()).hexdigest(), 'frames': len(rows), 'physicsExecuted': False}))
