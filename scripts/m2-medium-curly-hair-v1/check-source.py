"""CPU source projections and bounded head/eye/ear contact diagnostics."""
import json
from pathlib import Path
import sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
from scipy.spatial import cKDTree
ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT/'assets-source/m2-medium-curly-hair-v1'
sys.path.insert(0, str(Path(__file__).parent))
from build import source, sha, encoded, apply
sys.path.insert(0, str(ROOT/'scripts/production'))
from flow import GLB


def segment_hits(a, b, triangles):
    direction = b-a
    edge1, edge2 = triangles[:, 1]-triangles[:, 0], triangles[:, 2]-triangles[:, 0]
    cross = np.cross(direction, edge2)
    det = np.sum(edge1*cross, axis=1)
    reciprocal = np.divide(1, det, out=np.zeros_like(det), where=np.abs(det)>1e-12)
    relative = a-triangles[:, 0]
    u = reciprocal*np.sum(relative*cross, axis=1)
    q = np.cross(relative, edge1)
    v = reciprocal*np.sum(direction*q, axis=1)
    t = reciprocal*np.sum(edge2*q, axis=1)
    return (np.abs(det)>1e-12)&(u>1e-7)&(v>1e-7)&(u+v<1-1e-7)&(t>1e-7)&(t<1-1e-7)


def intersections(hair, skin):
    result = []
    lo, hi = skin.min(1), skin.max(1)
    for index, triangle in enumerate(hair):
        candidates = np.flatnonzero(np.all(hi>=triangle.min(0), axis=1)&np.all(lo<=triangle.max(0), axis=1))
        if not len(candidates):
            continue
        other = skin[candidates]
        hit = np.zeros(len(other), dtype=bool)
        for edge in range(3):
            hit |= segment_hits(triangle[edge], triangle[(edge+1)%3], other)
        for k, face in enumerate(other):
            for edge in range(3):
                if segment_hits(face[edge], face[(edge+1)%3], triangle[None])[0]:
                    hit[k] = True
        result.extend([[index, int(candidates[k])] for k in np.flatnonzero(hit)])
    return result


def main():
    spec = json.loads((BASE/'spec.json').read_text(encoding='utf-8-sig'))
    g, _, cap, _, faces, inverse, _ = source(ROOT/spec['source']['path'], spec['sourceMaterial'])
    skin_parts, draw = [], []
    for mesh in g.doc['meshes']:
        for p in mesh['primitives']:
            name = g.doc['materials'][p['material']]['name']
            if name == spec['sourceMaterial']:
                continue
            positions = apply(np.array(g.accessor(p['attributes']['POSITION'])), inverse)
            triangles = np.array(g.accessor(p['indices']), int).reshape(-1, 3)
            triangles = triangles[np.min(positions[triangles, 1], axis=1)>-.14]
            if not len(triangles):
                continue
            polys = positions[triangles]
            draw.append((name, polys))
            if 'SKIN' in name:
                skin_parts.append(polys)
    skin = np.vstack(skin_parts)
    rows = [('original', cap[faces])]
    checks = []
    for preset in spec['presets']:
        folder = BASE/'budget'/preset['id']
        asset = GLB((folder/'hair.glb').read_bytes())
        p = asset.doc['meshes'][0]['primitives'][0]
        positions = np.array(asset.accessor(p['attributes']['POSITION']))
        triangles = np.array(asset.accessor(p['indices']), int).reshape(-1, 3)
        added = triangles[np.min(triangles, axis=1)>=len(cap)]
        hits = intersections(positions[added], skin)
        hit_vertices = np.unique(added[[h[0] for h in hits]]) if hits else np.array([], int)
        rows.append((preset['id'], positions[triangles]))
        checks.append({'id': preset['id'], 'noncoplanarAddedHairSkinTrianglePairs': len(hits),
                       'intersectionHairBounds': [positions[hit_vertices].min(0).tolist(), positions[hit_vertices].max(0).tolist()] if len(hit_vertices) else None,
                       'intersectionPairs': hits, 'minAddedVertexToSkinVertexM': float(cKDTree(skin.reshape(-1,3)).query(positions[len(cap):])[0].min())})
    fig, axes = plt.subplots(3, 3, figsize=(10, 11), constrained_layout=True)
    for row, (name, hair_triangles) in enumerate(rows):
        for column, view in enumerate(['front', 'side', 'back']):
            ax = axes[row, column]
            all_faces = []; colors = []
            for material, triangles in draw+[('hair', hair_triangles)]:
                color = np.array([.22,.13,.08]) if material == 'hair' else np.array([.84,.68,.56]) if 'SKIN' in material else np.array([.23,.25,.28])
                normals = np.cross(triangles[:,1]-triangles[:,0], triangles[:,2]-triangles[:,0])
                normals /= np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-10)
                light = .65+.35*np.abs(normals@np.array([.35,.7,-.6]))
                all_faces.extend(triangles); colors.extend(color*light[:,None])
            all_faces = np.array(all_faces); colors = np.array(colors)
            if view == 'front':
                projected = all_faces[:,:,[0,1]]; depth = -all_faces[:,:,2].mean(1)
            elif view == 'back':
                projected = all_faces[:,:,[0,1]]*[-1,1]; depth = all_faces[:,:,2].mean(1)
            else:
                projected = all_faces[:,:,[2,1]]; depth = all_faces[:,:,0].mean(1)
            order = np.argsort(depth)
            ax.add_collection(PolyCollection(projected[order], facecolors=np.clip(colors[order],0,1), edgecolors='none'))
            ax.set(xlim=(-.21,.21),ylim=(-.14,.25),aspect='equal',title=name+' / '+view)
            ax.axis('off')
    fig.savefig(BASE/'source-projections.png', dpi=130)
    plt.close(fig)
    report = {'scope': 'Bind-pose strict noncoplanar triangle intersection only, head skin above head-local y=-.14. Overlapping clump roots and hair/cap overlap are intentional. No coplanar/continuous/action or inside-solid proof.',
              'checks': checks, 'projection': 'CPU orthographic triangle painter with flat geometry colors, without game material or GPU lighting equivalence.'}
    (BASE/'source-contact-report.json').write_bytes(encoded(report))
    print(json.dumps([{k:v for k,v in c.items() if k!='intersectionPairs'} for c in checks]))


if __name__ == '__main__':
    main()
