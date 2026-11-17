"""Existing CPU textured raster for diagnostics, not game/light/visual acceptance."""
import sys
sys.dont_write_bytecode=True
import importlib.util,json,time,hashlib
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'assets-source/m2-source-proportioned-face-v1'
sys.path.insert(0,str(ROOT/'scripts/m2-representative-batch-v1'))
s=importlib.util.spec_from_file_location('preview_original_raster',ROOT/'scripts/m2-representative-batch-v1/preview.py');raster=importlib.util.module_from_spec(s);s.loader.exec_module(raster)
spec=json.loads((BASE/'spec.json').read_bytes());out=BASE/'diagnostic-preview'
if out.exists():raise ValueError('Preserve first diagnostic views')
out.mkdir();started=time.monotonic();H=np.asarray(spec['headOriginM']);font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',19)
source=ROOT/spec['source']['path'];candidate=BASE/'generated'/spec['candidateId']/(spec['candidateId']+'.vrm')
composite=Image.new('RGB',(1440,1040),'#f0f0f0');draw=ImageDraw.Draw(composite)
draw.text((12,8),'GEOMETRY DIAGNOSTIC - CPU texture/light approximation; NOT game/visual acceptance',font=font,fill='#222222')
for row,(label,path) in enumerate([('Original source',source),('Source-proportioned narrow PREVIEW ONLY',candidate)]):
    parts=raster.triangles(path,True)
    for col,(view,angle) in enumerate([('Front',0.),('Three-quarter',np.pi/4),('Side',np.pi/2)]):
        im=raster.render(parts,H+np.array([0,.055,-.015]),.34,angle,(480,460));im.save(out/f'{row}-{view}.png');composite.paste(im,(480*col,70+490*row));draw.text((480*col+8,40+490*row),label+' / '+view,font=font,fill='#222222')
composite.save(out/'source-candidate-three-view.png')
result=dict(schema='source-proportioned-cpu-diagnostic-v1',sourceSHA=hashlib.sha256(source.read_bytes()).hexdigest(),candidateSHA=hashlib.sha256(candidate.read_bytes()).hexdigest(),views=['front','three-quarter','side'],sameCameraAndLighting=True,actualGameRenderer=False,visualAccepted=False,seconds=time.monotonic()-started)
(out/'report.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps(result))
