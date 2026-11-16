"""Two controlled rejection checks in the isolated export only; restore original bytes."""
from pathlib import Path
import json,subprocess,sys,hashlib
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).resolve().parent;WORK=(ROOT/'analysis/face-visible-retained-v2-checkout').resolve();assert WORK.is_relative_to((ROOT/'analysis').resolve())and WORK.is_dir();rows=[]
def run():
 r=subprocess.run([sys.executable,'scripts/mouth-visible-v2/verify-retained.py'],cwd=WORK,capture_output=True,text=True,encoding='utf-8');return {'exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr}
source=WORK/'assets-source/mouth-visible-v2/generated/female-mouth-width-88-v2/editable.blend';held=source.with_name('editable.blend.negative-held');assert not held.exists();source.rename(held)
try:
 r=run();assert r['exitCode']!=0 and 'Missing retained file'in r['stderr'];rows.append({'case':'canonical-editable-absent','result':r})
finally:held.rename(source)
recipe=WORK/'assets-source/mouth-visible-v2/female-mouth-width.recipe.json';original=recipe.read_bytes()
try:
 recipe.write_bytes(original+b' ');r=run();assert r['exitCode']!=0 and 'Hash/size mismatch'in r['stderr'];rows.append({'case':'recipe-byte-mismatch-without-identity-change','result':r})
finally:recipe.write_bytes(original)
final=run();assert final['exitCode']==0
result={'scope':'Only isolated Git-export copies temporarily renamed/modified and restored; no original workspace source was modified or deleted.','cases':rows,'restoredRetainedVerification':final,'recipeRestoredSha256':hashlib.sha256(recipe.read_bytes()).hexdigest(),'passed':True};(HERE/'negative-receipt.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps({'passed':True,'cases':[x['case']for x in rows],'restoredExitCode':final['exitCode']}))
