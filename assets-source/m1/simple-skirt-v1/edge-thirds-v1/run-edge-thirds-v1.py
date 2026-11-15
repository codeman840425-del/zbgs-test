"""Exact existing60-second runner, distinct trial script/output; no parameter retry."""
from pathlib import Path
import hashlib,json
R=Path(__file__).resolve().parents[3];source=R/'scripts/m1-assets/simple-skirt/run-author-cloth-v1.py';text=source.read_text(encoding='utf-8')
assert text.count("active-gap-hem-v1/native-author-trial-v1")==1 and text.count("simple-skirt/trial-author-cloth-v1.py")==1
text=text.replace("active-gap-hem-v1/native-author-trial-v1","edge-thirds-v1/native-author-trial-v1").replace("simple-skirt/trial-author-cloth-v1.py","simple-skirt/trial-edge-thirds-v1.py")
exec(compile(text,str(source),'exec'),globals())
