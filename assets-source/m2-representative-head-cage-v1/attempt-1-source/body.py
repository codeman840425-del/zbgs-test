"""Factor the exact existing v2 body contribution before its face code."""
import ast
import copy
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import sys

sys.dont_write_bytecode = True
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
module = importlib.util.spec_from_file_location('retained_v1_kernel', ROOT / 'scripts/m2-representative-batch-v1/deform.py')
legacy = importlib.util.module_from_spec(module)
module.loader.exec_module(legacy)


def body_displacement(P, p, context):
    P = np.asarray(P, float)
    j = context['joints']
    only_limbs = {k: (p[k] if k in ['shoulderMass', 'upperArmRadius', 'thighRadius'] else 0) for k in p}
    D = legacy.field(P, only_limbs, context) - P
    hip = j['hips'][1] - .035
    waist = (j['hips'][1] + j['chest'][1]) / 2
    chest = j['chest'][1]
    w_hip = 1 - legacy.smooth((P[:, 1] - hip) / (waist - hip))
    w_chest = legacy.smooth((P[:, 1] - waist) / (chest - waist))
    w_waist = 1 - w_hip - w_chest
    support = legacy.smooth((P[:, 1] - (hip - .17)) / .17) * (1 - legacy.smooth((P[:, 1] - (chest + .10)) / .10))
    dx = P[:, 0] - j['hips'][0]
    hand_limit = min(abs(j['leftHand'][0] - j['hips'][0]) - .08, abs(j['leftLowerArm'][0] - j['hips'][0]) + .10)
    mask = support * (1 - legacy.smooth((abs(dx) - .12) / max(.08, hand_limit - .12)))
    cz = np.interp(P[:, 1], [j['hips'][1], chest], [j['hips'][2], j['chest'][2]])
    width = w_hip * p['hipWidth'] + w_waist * p['waistWidth'] + w_chest * p['chestWidth']
    depth = w_hip * p['hipDepth'] + w_waist * p['waistDepth'] + w_chest * p['chestDepth']
    D[:, 0] += dx * width * mask
    D[:, 2] += (P[:, 2] - cz) * depth * mask
    return D


def reference_body():
    source = ROOT / 'scripts/m2-representative-batch-v2/deform.py'
    tree = ast.parse(source.read_bytes())
    cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'Mapper')
    original = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == 'field')
    nodes = []
    for node in original.body:
        if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name) and node.targets[0].id == 's':
            break
        nodes.append(copy.deepcopy(node))
    function = copy.deepcopy(original)
    function.name = 'reference'
    function.body = nodes + [ast.Return(ast.BinOp(ast.Name('P', ast.Load()), ast.Add(), ast.Name('D', ast.Load())))]
    compiled = ast.fix_missing_locations(ast.Module([function], []))
    namespace = {'np': np, 'legacy': legacy}
    exec(compile(compiled, str(source), 'exec'), namespace)
    return lambda P, p, c: namespace['reference'](SimpleNamespace(p=p, c=c), P)


def extremity_indices(g):
    result = {}
    for mesh_index, mesh in enumerate(g.doc['meshes']):
        node = next(n for n in g.doc['nodes'] if n.get('mesh') == mesh_index)
        skin = g.doc['skins'][node['skin']]
        for p in mesh['primitives']:
            key = p['attributes']['POSITION']
            joints = np.asarray(g.accessor(p['attributes']['JOINTS_0']), int)
            weights = np.asarray(g.accessor(p['attributes']['WEIGHTS_0']))
            chosen = np.array([any(w > .5 and any(t in g.doc['nodes'][skin['joints'][j]]['name'] for t in ['Hand', 'Thumb', 'Index', 'Middle', 'Ring', 'Little', 'Foot', 'Toe']) for j, w in zip(J, W)) for J, W in zip(joints, weights)])
            result[key] = np.flatnonzero(chosen)
    return result
