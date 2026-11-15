from pathlib import Path
import os
R=Path(__file__).resolve().parents[3];mode=os.environ.get('SKIRT_OBSERVATION','moving');assert mode in ('moving','static');folder='native-self025-moving-v1' if mode=='moving' else 'native-self025-static-v1'
source=R/'scripts/m1-assets/simple-skirt/run-author-cloth-v1.py';text=source.read_text(encoding='utf-8').replace('active-gap-hem-v1/native-author-trial-v1','two-quad-thirds-v1/'+folder).replace('simple-skirt/trial-author-cloth-v1.py','simple-skirt/trial-self025-v1.py');exec(compile(text,str(source),'exec'),globals())
