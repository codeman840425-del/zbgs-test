"""Read-only actual-source exporter identity audit. Does not import bpy or run Blender."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
sys.dont_write_bytecode = True
import numpy as np
ROOT = Path('F:/gamemake-representative-cage-trial')
OUT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'scripts/production'))
from flow import GLB
module_spec = importlib.util.spec_from_file_location('reviewed_export', OUT / 'snapshot-initial/export.py')
export = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(export)
def sha(data):
    return hashlib.sha256(data).hexdigest()
spec = json.loads((OUT / 'snapshot-initial/spec.json').read_bytes())
rows = []
for sex, source in spec['sources'].items():
    for reference in [source['body']] + source['equipment']:
        data = (ROOT / reference['path']).read_bytes()
        assert sha(data) == reference['sha256']
        g = GLB(data)
        groups = {}
        for mesh in g.doc['meshes']:
            for primitive in mesh['primitives']:
                groups.setdefault(primitive['attributes']['POSITION'], []).append(primitive)
        results = {}
        group_rows = []
        for accessor, primitives in groups.items():
            first = primitives[0]
            assert all(p['attributes']['NORMAL'] == first['attributes']['NORMAL'] for p in primitives)
            assert all(p.get('targets', []) == first.get('targets', []) for p in primitives)
            P = np.asarray(g.accessor(accessor), dtype=np.float32)
            N = np.asarray(g.accessor(first['attributes']['NORMAL']), dtype=np.float32)
            ends, endpoint_normals = [], []
            for t in first.get('targets', []):
                ends.append(P + np.asarray(g.accessor(t['POSITION']), dtype=np.float32))
                endpoint_normals.append(N + np.asarray(g.accessor(t['NORMAL']), dtype=np.float32) if 'NORMAL' in t else N.copy())
            results[accessor] = {'positions': P.copy(), 'normals': N.copy(), 'endpoints': ends, 'endpointNormals': endpoint_normals}
            group_rows.append({'positionAccessor': accessor, 'primitiveCount': len(primitives), 'vertices': len(P), 'morphEndpoints':len(ends), 'normalAndTargetSharingExact':True})
        baked = GLB(export.bake(g, results))
        checks = {}
        for field in ['nodes','skins','materials','textures','images','samplers','extensions','scene','scenes']:
            assert baked.doc.get(field) == g.doc.get(field), field
            checks[field] = True
        assert baked.binary[:len(g.binary)] == g.binary
        assert baked.doc['accessors'][:len(g.doc['accessors'])] == g.doc['accessors']
        max_endpoint_roundtrip = 0.0
        for mesh, other in zip(g.doc['meshes'],baked.doc['meshes']):
            for p, q in zip(mesh['primitives'],other['primitives']):
                assert p['indices']==q['indices']
                for attr, value in p['attributes'].items():
                    if attr not in ['POSITION','NORMAL']:
                        assert q['attributes'][attr]==value
                        assert np.array_equal(g.accessor(value),baked.accessor(q['attributes'][attr]))
                assert np.array_equal(g.accessor(p['attributes']['POSITION']),baked.accessor(q['attributes']['POSITION']))
                assert np.array_equal(g.accessor(p['attributes']['NORMAL']),baked.accessor(q['attributes']['NORMAL']))
                for a,b in zip(p.get('targets',[]),q.get('targets',[])):
                    error=float(np.max(abs(np.asarray(g.accessor(a['POSITION']))-np.asarray(baked.accessor(b['POSITION'])))))
                    max_endpoint_roundtrip=max(max_endpoint_roundtrip,error)
        rows.append({'sex':sex,'source':reference,'sourceShaMatched':True,'exportedInMemoryOnly':True,'sourceBinaryPrefixExact':True,'originalAccessorsExact':True,'retainedDocumentFields':checks,'groups':group_rows,'maxFloat32MorphDeltaRoundtripErrorM':max_endpoint_roundtrip})
report={'scope':'Actual eight original source GLBs/VRMs through inspected exporter with identity positions/normals. No modifier/deformation evaluated. Endpoint subtraction is float32 and reported numerically.','exportScriptSha256':sha((OUT/'snapshot-initial/export.py').read_bytes()),'cases':rows,'sourceCount':len(rows),'blenderRan':False}
(OUT/'export-identity-probe.json').write_bytes((json.dumps(report,indent=2)+'\n').encode())
print(json.dumps({'cases':len(rows),'retainedContracts':True,'maxFloat32MorphDeltaRoundtripErrorM':max(r['maxFloat32MorphDeltaRoundtripErrorM'] for r in rows)}))
