from pathlib import Path
import os
R=Path(__file__).resolve().parents[3];mode=os.environ.get('SKIRT_OBSERVATION','moving');assert mode in ('moving','static')
folder='native-full-observation-v1' if mode=='moving' else 'native-static-control-v1'
source=R/'scripts/m1-assets/simple-skirt/render-two-quad-diagnostic.py';s=source.read_text(encoding='utf-8').replace('native-author-trial-v1',folder).replace('for frameNumber in [1,7,18]:','for frameNumber in [42]:' if mode=='moving' else 'for frameNumber in [18]:')
if mode=='static':s=s.replace("fr=cap['frames'][frameNumber-1]","fr=cap['frames'][0]")
s=s.replace('selected frames1,7,18, not a complete real-time video','selected terminal saved frame only; rejected observation, not real-time video')
exec(compile(s,str(source),'exec'),globals())
