from pathlib import Path
R=Path(__file__).resolve().parents[3];source=R/'scripts/m1-assets/simple-skirt/run-author-cloth-v1.py';text=source.read_text().replace('active-gap-hem-v1/native-author-trial-v1','two-quad-thirds-v1/native-quality64-moving-v1').replace('simple-skirt/trial-author-cloth-v1.py','simple-skirt/trial-quality64-v1.py');exec(compile(text,str(source),'exec'),globals())
