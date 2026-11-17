"""Recover four local line witnesses from the already recorded CPU palette."""
import importlib.util
import json
from pathlib import Path
import sys

sys.dont_write_bytecode=True
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'evidence/m2-preset-garment-cause-v1'


def module(name,path):
    spec=importlib.util.spec_from_file_location(name,ROOT/path)
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result)
    return result


geometry=module('witness_skin','scripts/m2-vest-layer-fit-v1/geometry.py')
analysis=module('witness_analysis','scripts/m2-preset-garment-cause-v1/analyze.py')
pose=json.loads((OUT/'male-wide-muscular-v2-cpu-idle.json').read_bytes())
live=next(m for m in pose['meshes'] if m['visible'] and 'Tops_01' in m['materialNames'][0])
live={**live,'joints':np.asarray(live['joints']).reshape(-1,4),'weights':np.asarray(live['weights']).reshape(-1,4)}
source=analysis.load('prototype/public/assets/m1b/m1b-uniform-top.glb','Tops_01')
target=np.asarray(live['worldPositionsM']);baseline=geometry.skin(source['positions'],live)
faces=source['faces'];image=analysis.texture(source['model'],source['primitive'])
uv=source['model'].acc(source['primitive']['attributes']['TEXCOORD_0'])
rows=[]
for pair in [(293,1197),(331,1200),(296,1198),(284,1194)]:
    def intersect(points):
        hits=[]
        first,second=points[faces[pair[0]]],points[faces[pair[1]]]
        for a,b in [(first,second),(second,first)]:
            for edge in range(3):
                point=analysis.old_diagnosis.segment_triangle(a[edge],a[(edge+1)%3],b)
                if point is not None and not any(np.linalg.norm(point-old)<1e-10 for old in hits):hits.append(point)
        return {'pointsM':[point.tolist() for point in hits],
            'spanM':max((float(np.linalg.norm(a-b)) for a in hits for b in hits),default=0)}
    colors=[]
    for face in pair:
        coord=uv[faces[face]].mean(0)
        colors.append(image[int(coord[1]*image.shape[0])%image.shape[0],int(coord[0]*image.shape[1])%image.shape[1]].tolist())
    rows.append({'pair':pair,'sourceIndices':[faces[f].tolist()for f in pair],
        'textureCentroidRGBA':colors,'sourceUnderTargetPalette':intersect(baseline),
        'derivedUnderSamePalette':intersect(target)})
report={'schema':'garment-pair-line-witness-v1',
    'scope':'Virtual common idle, not photographed frame. Existing inclusive segment witness supplements official CGAL; line span is not penetration depth.',
    'rows':rows}
(OUT/'male-pair-witnesses.json').write_bytes((json.dumps(report,indent=2)+'\n').encode())
print(json.dumps({'pairs':len(rows),'maximumIntersectionLineSpanM':max(r['derivedUnderSamePalette']['spanM']for r in rows)}))
