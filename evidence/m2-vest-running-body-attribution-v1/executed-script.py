"""Attribute the observed light waist patch to actual paused runtime surfaces.

Pixel centers and full dumped triangles, not a speculative clothing correction.
The fixed screenshot rectangle is specific to this capture's half-front camera.
"""
import argparse, hashlib, importlib.util, json
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('vest_diagnosis', ROOT/'scripts/diagnose-representative-vest-source.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
p = argparse.ArgumentParser(); p.add_argument('capture'); p.add_argument('output'); args = p.parse_args()
capture, output = Path(args.capture).resolve(), Path(args.output).resolve()
output.mkdir(exist_ok=False)
mask_path = ROOT/'prototype/public/assets/body-coverage-risk-v1/female-top.json'
mask = json.loads(mask_path.read_text())
masked = {tuple(t): f for t,f in zip(mask['selectedTriangles'],mask['selectedFaceIds'])}
report = {'scope':'Specific actual running poses, full dumped body/top triangle projection at selected screenshot pixel centers',
          'sourceBuild':'ed2153a2d822','cases':[], 'inputs':{},
          'limits':['Different real runs have recorded phases, not asserted identical skeletal poses.',
                    'Original torso coverage IDs are compared as diagnostic evidence only; no derived mask is installed.',
                    'Pixel rule is bounded to the observed pale waist patch, not a general segmentation algorithm.',
                    'Ray gap is distance between hits on this ray, not global signed surface penetration.',
                    'Only body/top/pants dumped surfaces are compared; no automatic claim of complete renderer emulation.']}
def read(path):
    raw = path.read_bytes(); report['inputs'][str(path.relative_to(ROOT))]={'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)}
    return raw
read(mask_path)
for identifier in ['female','female-round-full-v2','female-soft-wide-v2']:
    data = json.loads(read(capture/(identifier+'.json')))
    image_path = capture/(identifier+'.png'); read(image_path); im = Image.open(image_path).convert('RGB'); pixels = np.asarray(im)
    prepared=[]
    for mesh in data['meshes']:
        if not mesh['visible'] or not all(n['visible'] for n in mesh['ancestors']): continue
        positions=np.array(mesh['worldPositions']); faces=np.array(mesh['indices']).reshape(-1,3)
        projected,w=module.project(positions,data['camera'])
        prepared.append((mesh,positions,faces,projected,w))
    rows=[]
    for y in range(420,451):
        for x in range(490,566):
            rgb=pixels[y,x]
            if not (rgb[0]>180 and rgb[1]>170 and rgb[2]>155): continue
            hits=[]; point=np.array([2*(x+.5)/im.width-1,1-2*(y+.5)/im.height])
            for mesh,positions,faces,projected,w in prepared:
                hit=module.cover(point,projected[faces,:2],projected[faces,2])
                if hit is None: continue
                ti,screen_bary,depth=hit; bary=screen_bary/w[faces[ti]];bary/=bary.sum()
                hits.append({'role':mesh['role'],'mesh':mesh['name'],'triangle':ti,'indices':faces[ti].tolist(),
                    'depth':depth,'world':(bary@positions[faces[ti]]).tolist()})
            hits.sort(key=lambda h:h['depth']); top=next((h for h in hits if h['role']=='top'),None)
            body=next((h for h in hits if h['role']=='body'),None)
            if top and body:
                rows.append({'pixel':[x,y],'rgb':rgb.tolist(),'nearestRole':hits[0]['role'],'body':body,'top':top,
                    'bodyAhead':body['depth']<top['depth'],
                    'rayGapM':float(np.linalg.norm(np.array(body['world'])-top['world'])),
                    'originalCoveredFace':masked.get(tuple(body['indices']))})
    ahead=[r for r in rows if r['bodyAhead'] and r['nearestRole']=='body']
    report['cases'].append({'id':identifier,'snapshot':data['snapshot'],'coverage':data['equipment']['equipment']['bodyCoverage'],
        'selectedPalePixelsWithBodyAndTop':len(rows),'bodyAheadPixels':len(ahead),
        'bodyAheadRayGapRangeMm':([min(r['rayGapM'] for r in ahead)*1000,max(r['rayGapM'] for r in ahead)*1000] if ahead else None),
        'bodyAheadPixelsInOriginalCoveredTriangles':sum(r['originalCoveredFace'] is not None for r in ahead),
        'pixels':rows})
(output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
(output/'executed-script.py').write_bytes(Path(__file__).read_bytes())
print(json.dumps([{k:v for k,v in row.items() if k not in ['pixels','snapshot','coverage']} for row in report['cases']],ensure_ascii=False))
