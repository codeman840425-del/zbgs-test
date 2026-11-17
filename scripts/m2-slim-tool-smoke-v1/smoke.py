"""One fixed identity + one 1mm five-step official 3D tet SLIM smoke."""
import hashlib
import importlib.metadata
import json
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'evidence/m2-slim-tool-smoke-v1'
EXPECTED_PREFIX = ROOT / 'experiments/tools/slim-core-2.6.3/.venv'
result = {'schema': 'slim-core-tet-smoke-v1', 'status': 'running', 'characterSolved': False,
    'runtimeAccepted': False, 'tetgenOrCgalCalled': False, 'parameterSearch': False}
if (OUT / 'result.json').exists():
    raise ValueError('Keep the first result. No repeat in this fixed output.')
started = time.monotonic()
try:
    if Path(sys.prefix).resolve() != EXPECTED_PREFIX.resolve() or sys.prefix == sys.base_prefix:
        raise ValueError('Use the dedicated isolated venv')
    import numpy as np
    import scipy
    import igl
    result.update(python=sys.version, executable=sys.executable, prefix=sys.prefix, basePrefix=sys.base_prefix,
        versions={name: importlib.metadata.version(name) for name in ['libigl', 'numpy', 'scipy']},
        importPaths={'igl': igl.__file__, 'numpy': np.__file__, 'scipy': scipy.__file__},
        actualApiDocstrings={name: getattr(igl, name).__doc__ for name in ['slim_precompute', 'slim_solve']})
    binaries = []
    for name in ['libigl', 'numpy', 'scipy']:
        distribution = importlib.metadata.distribution(name)
        for entry in distribution.files:
            if str(entry).lower().endswith(('.pyd', '.dll')):
                path = Path(distribution.locate_file(entry))
                binaries.append({'distribution': name, 'path': str(path),
                    'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'bytes': path.stat().st_size})
    result['installedBinaryIdentities'] = binaries
    V = np.array([[0., 0., 0.], [1., 0., 0.], [0., 1., 0.], [0., 0., 1.]], dtype=np.float64)
    T = np.array([[0, 1, 2, 3]], dtype=np.int32)
    b = np.arange(4, dtype=np.int32)
    volume = float(np.asarray(igl.volume(V, T)).ravel()[0])
    if not np.isclose(volume, 1 / 6, rtol=0, atol=1e-15):
        raise ValueError('Official volume orientation differs')
    result['inputs'] = {'V': V.tolist(), 'T': T.tolist(), 'b': b.tolist(), 'units': 'metres',
        'sourceVolumeM3': volume, 'energy': 'MappingEnergyType.SYMMETRIC_DIRICHLET', 'softP': 1e5}
    energy = igl.MappingEnergyType.SYMMETRIC_DIRICHLET
    data = igl.slim_precompute(V, T, V.copy(), energy, b, V.copy(), 1e5)
    identity = np.asarray(igl.slim_solve(data, 1)).copy()
    identity_error = float(abs(identity - V).max())
    result['identity'] = {'iterations': 1, 'positions': identity.tolist(), 'maximumErrorM': identity_error,
        'passed': bool(np.isfinite(identity).all() and identity_error <= 1e-9)}
    if not result['identity']['passed']:
        raise ValueError('Identity gate failed')
    bc = V.copy()
    bc[3, 2] += .001
    data = igl.slim_precompute(V, T, V.copy(), energy, b, bc, 1e5)
    moved = np.asarray(igl.slim_solve(data, 5)).copy()
    reference_edges = (V[1:] - V[0]).T
    new_edges = (moved[1:] - moved[0]).T
    jacobian = new_edges @ np.linalg.inv(reference_edges)
    determinant = float(np.linalg.det(jacobian))
    moved_volume = float(np.asarray(igl.volume(moved, T)).ravel()[0])
    passed = bool(np.isfinite(moved).all() and moved_volume > 0 and determinant > .12)
    result['oneMillimetre'] = {'iterations': 5, 'targets': bc.tolist(), 'positions': moved.tolist(),
        'jacobian': jacobian.tolist(), 'determinant': determinant, 'volumeM3': moved_volume,
        'residualsM': (moved - bc).tolist(), 'maximumTargetResidualM': float(abs(moved - bc).max()),
        'maximumActualDisplacementM': float(np.linalg.norm(moved - V, axis=1).max()), 'passed': passed}
    if not passed:
        raise ValueError('Finite/positive-volume/determinant gate failed')
    result['loadedIglModules'] = sorted(name for name in sys.modules if name == 'igl' or name.startswith('igl.'))
    if any('copyleft' in name or 'tetgen' in name or 'cgal' in name for name in result['loadedIglModules']):
        raise ValueError('Unexpected optional copyleft module loaded')
    result['status'] = 'core-three-dimensional-api-smoke-passed'
except Exception as error:
    result.update(status='failed-no-retry', error=str(error))
    raise
finally:
    result['seconds'] = time.monotonic() - started
    (OUT / 'result.json').write_bytes((json.dumps(result, indent=2) + '\n').encode())
print(json.dumps({'status': result['status'], 'seconds': result['seconds'],
    'identityMaximumErrorM': result['identity']['maximumErrorM'],
    'determinant': result['oneMillimetre']['determinant'], 'residualM': result['oneMillimetre']['maximumTargetResidualM']}))
