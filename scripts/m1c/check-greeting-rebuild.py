"""Repeat export and actual parameter edit regression; writes ignored output only."""
import hashlib, importlib.util, json, pathlib, subprocess, sys
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[2]
CANON = ROOT / 'assets-source/m1c-gesture'
OUT = ROOT / 'output/m1c-gesture-rebuild'
OUT.mkdir(parents=True, exist_ok=True)
cfg = json.loads((CANON / 'wave-left-v1.config.json').read_text())
def build(config, name):
    subprocess.run([sys.executable, str(ROOT/'scripts/m1c/build-greeting-wave.py'),
                    '--config', str(config), '--output', str(OUT/name)], check=True,
                   stdout=subprocess.DEVNULL, cwd=ROOT)
    return OUT/name/'greeting-wave-left-v1.glb'
repeat = build(CANON/'wave-left-v1.config.json', 'repeat')
original = CANON/'generated/greeting-wave-left-v1.glb'
assert repeat.read_bytes() == original.read_bytes(), 'Repeat export differs'
cfg['wristWaveDegrees'] = 20
editConfig = OUT/'edited-config.json'
editConfig.write_text(json.dumps(cfg, indent=2)+'\n')
edited = build(editConfig, 'edited')
spec = importlib.util.spec_from_file_location('source_glb', ROOT/'scripts/qa-m1c-source.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
a, b = m.GLB(original.read_bytes()), m.GLB(edited.read_bytes())
times = np.linspace(0, cfg['duration'], 673)
aw, ar, _ = a.evaluate('Greeting_Wave_Left_Once_v1', times)
bw, br, _ = b.evaluate('Greeting_Wave_Left_Once_v1', times)
i = a.byname['hand_l']
angle = np.rad2deg(2*np.arccos(np.clip(abs(np.sum(ar[i]*br[i], axis=1)), 0, 1)))
unchanged = [a.byname[n] for n in ['root','pelvis','foot_l','foot_r','hand_r']]
error = float(np.max(abs(aw[:,unchanged]-bw[:,unchanged])))
assert angle.max() > 1 and error < 1e-7
result = {'repeatByteIdentical': True,
          'canonicalSha256': hashlib.sha256(original.read_bytes()).hexdigest(),
          'edit': {'wristWaveDegrees': [14,20], 'maximumLeftWristRotationDifferenceDegrees': float(angle.max()),
                   'rootHipsFeetRightHandWorldMatrixMaximumDifference': error,
                   'editedSha256': hashlib.sha256(edited.read_bytes()).hexdigest()},
          'scope': 'Offline source export; not target VRM or runtime validation'}
(CANON/'generated/rebuild-check.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(result, indent=2))
