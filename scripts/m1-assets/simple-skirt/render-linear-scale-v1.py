from pathlib import Path
R=Path(__file__).resolve().parents[3];src=R/'scripts/m1-assets/simple-skirt/render-two-quad-observations-v1.py';s=src.read_text().replace('native-full-observation-v1','native-linear-scale-moving-v1').replace('native-static-control-v1','native-linear-scale-static-v1').replace('in [42]:','in [29]:');exec(compile(s,str(src),'exec'),globals())
