"""Read-only attribution of fixed source shape risks. No parameter/output edits."""
import hashlib
import argparse
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'scripts/m2-representative-batch-v1'))
import numpy as np
import deform

OUT = Path(__file__).resolve().parent


def pin(path):
    raw = path.read_bytes()
    return {'path': path.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(raw).hexdigest()}


def primitive(g, token):
    return next(p for m in g.doc['meshes'] for p in m['primitives'] if token in g.doc['materials'][p['material']]['name'])


def arrays(g, token):
    p = primitive(g, token)
    return np.array(g.accessor(p['attributes']['POSITION'])), np.array(g.accessor(p['indices']), int).reshape(-1, 3)


def sections(P, F, levels, head=None):
    Q = P-head if head is not None else P
    triangles = Q[F]; result = []
    for y in levels:
        selected = triangles[(triangles[:, :, 1].min(1) <= y)&(triangles[:, :, 1].max(1) >= y)]
        intersections = []
        for i in range(3):
            a, b = selected[:, i], selected[:, (i+1)%3]
            t = (y-a[:, 1])/np.where(abs(b[:, 1]-a[:, 1]) > 1e-12, b[:, 1]-a[:, 1], np.inf)
            q = a+t[:, None]*(b-a); keep = (t >= 0)&(t <= 1)&(abs(b[:, 1]-a[:, 1]) > 1e-12)
            if head is not None: keep &= (q[:, 2] < -.025)&(abs(q[:, 0]) < .115)
            intersections.extend(q[keep])
        if not intersections: continue
        q = np.array(intersections); right = q[np.argmax(q[:, 0])]
        result.append({'yM': float(y), 'widthM': float(q[:, 0].max()-q[:, 0].min()), 'rightPoint': right.tolist()})
    return result


def face_edges(old, new, F, H):
    used = np.unique(F); q = old-H; edge_set = {tuple(sorted((int(a), int(b)))) for f in F for a, b in zip(f, np.roll(f, -1))}
    rows = []
    for a, b in edge_set:
        midpoint = (q[a]+q[b])/2
        if not (-.035 < midpoint[1] < .025 and midpoint[2] < -.025 and .025 < abs(midpoint[0]) < .105): continue
        edge = old[b]-old[a]; changed = new[b]-new[a]
        angle = np.degrees(np.arccos(np.clip(np.dot(edge, changed)/max(np.linalg.norm(edge)*np.linalg.norm(changed), 1e-20), -1, 1)))
        rows.append({'vertices': [a, b], 'headLocalMidpointM': midpoint.tolist(), 'sourceLengthM': float(np.linalg.norm(edge)),
            'newLengthM': float(np.linalg.norm(changed)), 'edgeDirectionChangeDegrees': float(angle),
            'displacementDifferenceM': float(np.linalg.norm((new[b]-old[b])-(new[a]-old[a])))})
    rows.sort(key=lambda r: r['edgeDirectionChangeDegrees'], reverse=True)
    return {'selectedEdges': len(rows), 'largestDirectionChanges': rows[:12]}


def continuous_face_sections(P, F, levels, H, parameters, context):
    triangles = (P-H)[F]; result = []
    for y in levels:
        selected = triangles[(triangles[:, :, 1].min(1) <= y)&(triangles[:, :, 1].max(1) >= y)]
        samples = []
        for triangle in selected:
            ends = []
            for i in range(3):
                a, b = triangle[i], triangle[(i+1)%3]
                if abs(b[1]-a[1]) < 1e-12: continue
                t = (y-a[1])/(b[1]-a[1])
                if 0 <= t <= 1: ends.append(a+t*(b-a))
            if len(ends) >= 2:
                samples.extend(ends[0]+np.linspace(0, 1, 41)[:, None]*(ends[1]-ends[0]))
        source = np.array(samples)+H; target = deform.field(source, parameters, context)-H
        # Upper cheek band has zero vertical displacement, so it is the same section.
        assert abs(target[:, 1]-y).max() < 1e-8
        keep = (target[:, 2] < -.025)&(abs(target[:, 0]) < .115)
        result.append({'yM': float(y), 'widthM': float(np.ptp(target[keep, 0])), 'sourceSurfaceSamples': len(samples)})
    return result


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--room-root'); args = parser.parse_args()
    package = ROOT/'assets-source/m2-representative-batch-v1'; spec = json.loads((package/'spec.json').read_bytes())
    source_body_path = ROOT/spec['sources']['female']['body']['path']; source_top_path = ROOT/spec['sources']['female']['equipment'][0]['path']
    source_body = deform.GLB(source_body_path.read_bytes()); source_top = deform.GLB(source_top_path.read_bytes())
    context = deform.source_context(source_body); H = context['joints']['head']
    top, top_faces = arrays(source_top, 'Tops_01_CLOTH'); skin, body_faces = arrays(source_body, 'Body_00_SKIN'); face, face_faces = arrays(source_body, 'Face_00_SKIN')
    top_ids = np.unique(top_faces); hem_y = top[top_ids, 1].min(); hem_ids = top_ids[top[top_ids, 1] < hem_y+.06]
    torso_y = np.linspace(hem_y+.003, hem_y+.26, 27); face_y = np.linspace(-.030, .045, 76)
    report = {'inputs': [pin(source_body_path), pin(source_top_path), pin(package/'spec.json'), pin(ROOT/'scripts/m2-representative-batch-v1/deform.py')],
        'original': {'topHemMinYM': float(hem_y), 'torsoSections': sections(top, top_faces, torso_y), 'faceSections': sections(face, face_faces, face_y, H)},
        'jointLandmarksM': {k: context['joints'][k].tolist() for k in ['head', 'hips', 'chest', 'neck']}, 'variants': []}
    for identifier in ['female-round-full', 'female-long-slender']:
        variant = next(v for v in spec['variants'] if v['id'] == identifier); folder = package/'generated'/identifier
        target_body_path = folder/'avatar.vrm'; target_top_path = folder/(identifier+'-top.glb')
        target = deform.GLB(target_body_path.read_bytes()); target_top = deform.GLB(target_top_path.read_bytes())
        mapped, TF = arrays(target_top, 'Tops_01_CLOTH'); mapped_face, FF = arrays(target, 'Face_00_SKIN')
        mapped_skin, BF = arrays(target, 'Body_00_SKIN')
        assert np.array_equal(TF, top_faces) and np.array_equal(FF, face_faces)
        p = variant['parameters']; zero = {k: 0 for k in p}; at = hem_ids[np.argmax(abs(mapped[hem_ids, 0]-top[hem_ids, 0]))]
        point = top[[at]]; contributions = {}
        for name, keys in [('waist', ['waistWidth', 'waistDepth']), ('hip', ['hipWidth', 'hipDepth']), ('chest', ['chestWidth', 'chestDepth']),
                           ('thigh', ['thighRadius']), ('shoulder-arm', ['shoulderMass', 'upperArmRadius']), ('face', ['jawWidth', 'cheekWidth', 'chinLengthM', 'chinProjectionM'])]:
            isolated = {**zero, **{k: p[k] for k in keys}}
            contributions[name] = (deform.field(point, isolated, context)-point)[0].tolist()
        delta = mapped[at]-top[at]
        assert np.max(abs(sum(np.array(v) for v in contributions.values())-delta)) < 1e-7
        body_near = np.unique(body_faces); body_near = body_near[(abs(skin[body_near, 1]-point[0, 1]) < .015)&(abs(skin[body_near, 0]) < .25)]
        surface = source_top.doc['materials'][primitive(source_top, 'Tops_01_CLOTH')['material']]
        assert surface == target_top.doc['materials'][primitive(target_top, 'Tops_01_CLOTH')['material']]
        report['inputs'].extend([pin(target_body_path), pin(target_top_path)])
        report['variants'].append({'id': identifier, 'parameters': p, 'topMaterialIdentical': True,
            'topologyAndIndicesIdentical': True, 'hemVertexAttribution': {'vertex': int(at), 'sourceM': point[0].tolist(), 'targetM': mapped[at].tolist(),
                'displacementM': delta.tolist(), 'componentsM': contributions, 'totalLateralScale': float((mapped[at, 0]-context['joints']['hips'][0])/(top[at, 0]-context['joints']['hips'][0]))},
            'hemSourceBandWidthM': float(np.ptp(top[hem_ids, 0])), 'hemTargetBandWidthM': float(np.ptp(mapped[hem_ids, 0])),
            'bodySameSourceYBandWidthM': {'source': float(np.ptp(skin[body_near, 0])), 'target': float(np.ptp(mapped_skin[body_near, 0]))},
            'exactHemHeightSections': {'yM': float(point[0, 1]), 'sourceTop': sections(top, top_faces, [point[0, 1]]),
                'targetTop': sections(mapped, TF, [point[0, 1]]), 'sourceBody': sections(skin, body_faces, [point[0, 1]]), 'targetBody': sections(mapped_skin, BF, [point[0, 1]])},
            'torsoSections': sections(mapped, TF, torso_y), 'faceSections': sections(mapped_face, FF, face_y, H),
            'continuousFieldUpperCheekSections': continuous_face_sections(face, face_faces, np.linspace(.015, .04, 26), H, p, context),
            'lowerCheekEdges': face_edges(face, mapped_face, face_faces, H)})
    # Field derivative at the actual top side. This measures the cumulative field, not a new candidate.
    row = report['variants'][0]; q = np.array(row['hemVertexAttribution']['sourceM'])[None, :]
    row['hemJacobian'] = deform.jacobian(q, row['parameters'], context, np.array([False]))[0].tolist()
    report['sourceResourcesWritten'] = False
    room_root = Path(args.room_root) if args.room_root else ROOT/'evidence/m2-representative-room-374-v1'
    report['roomImages'] = []
    for variant in report['variants']:
        for name in ['base-stage.png', 'full-front-stage.png', 'seated-stage.png']:
            path = room_root/variant['id']/name
            if path.exists(): report['roomImages'].append({'path': 'evidence/m2-representative-room-374-v1/'+variant['id']+'/'+name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    (OUT/'measurements.json').write_bytes((json.dumps(report, indent=2)+'\n').encode())
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(1, 2, figsize=(11, 6))
    for label, record, color in [('Original', report['original'], '#333333'), ('Round/full', report['variants'][0], '#b83a3a'), ('Long/slender', report['variants'][1], '#26768a')]:
        section = record['torsoSections']; axes[0].plot([q['widthM']*1000 for q in section], [q['yM'] for q in section], label=label, color=color)
        section = record['faceSections']; axes[1].plot([q['widthM']*500 for q in section], [q['yM']*1000 for q in section], label=label+' exported mesh', color=color)
    dense = report['variants'][0]['continuousFieldUpperCheekSections']
    axes[1].plot([q['widthM']*500 for q in dense], [q['yM']*1000 for q in dense], '--', color='#b83a3a', label='Round/full continuous field')
    axes[0].set(xlabel='Actual top cross-section width (mm)', ylabel='Source rest height (m)', title='Overlapping bands amplify lower hem')
    axes[1].set(xlabel='Half-width of front Face SKIN (mm)', ylabel='Raw head-local height (mm)', title='New cheek reversal also exists before triangulation')
    for ax in axes: ax.grid(alpha=.2); ax.legend(fontsize=8)
    fig.tight_layout(); fig.savefig(OUT/'source-contours.png', dpi=170); plt.close(fig)
    for r in report['variants']:
        print(r['id'],json.dumps({k:r[k] for k in ['hemVertexAttribution','hemSourceBandWidthM','hemTargetBandWidthM','bodySameSourceYBandWidthM']}))
        print('faceEdges',r['lowerCheekEdges']['largestDirectionChanges'][:3])


if __name__ == '__main__': main()
