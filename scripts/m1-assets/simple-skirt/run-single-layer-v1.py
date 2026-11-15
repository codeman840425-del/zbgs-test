from pathlib import Path
import os
R=Path(__file__).resolve().parents[3];mode=os.environ.get('SKIRT_OBSERVATION','moving');assert mode in ('static','moving');folder='native-single-layer-'+mode+'-v1';source=R/'scripts/m1-assets/simple-skirt/run-author-cloth-v1.py';text=source.read_text(encoding='utf-8').replace('active-gap-hem-v1/native-author-trial-v1','two-quad-thirds-v1/'+folder).replace('simple-skirt/trial-author-cloth-v1.py','simple-skirt/trial-single-layer-v1.py');exec(compile(text,str(source),'exec'),globals())
