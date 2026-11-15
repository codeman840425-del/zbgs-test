from pathlib import Path
R=Path(__file__).resolve().parents[3];s=R/'scripts/m1-assets/simple-skirt/render-two-quad-observations-v1.py';text=s.read_text().replace('native-full-observation-v1','native-self025-moving-v1').replace('native-static-control-v1','native-self025-static-v1').replace('in [42]:','in [45]:');exec(compile(text,str(s),'exec'),globals())
