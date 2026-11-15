from pathlib import Path
import os
os.environ['SKIRT_OBSERVATION']='moving';R=Path(__file__).resolve().parents[3];src=R/'scripts/m1-assets/simple-skirt/render-two-quad-observations-v1.py';s=src.read_text().replace('native-full-observation-v1','native-quality64-moving-v1').replace('in [42]:','in [35]:');exec(compile(s,str(src),'exec'),globals())
