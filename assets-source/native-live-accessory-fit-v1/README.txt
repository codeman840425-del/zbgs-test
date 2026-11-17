Native microphone adaptation candidate, 2026-11-17

Inputs: the four exact native source VRMs referenced by compare-hand-sources.py;
existing studio-microphone-v1.glb and evidence/mic-mouth-target/source-anchors.json.
Source permissions remain those recorded with the native VRoid source packages
and the existing project microphone. This package adds no third-party asset license.

Reproduction from repository root (Python NumPy/SciPy; prototype npm ci):
  python scripts/native-live-accessory-fit-v1/fit.py
  python scripts/native-live-accessory-fit-v1/mouth.py
  python scripts/native-live-accessory-fit-v1/compare-hand-sources.py
  node scripts/native-live-accessory-fit-v1/verify-vrm.mjs
  python scripts/native-live-accessory-fit-v1/build-profiles.py
  python scripts/native-live-accessory-fit-v1/package.py
  python scripts/stage-native-live-accessory.py
Check the exact CLI arguments in each script before rerunning source production.
Stage refuses conflicting registered identities and preserves old grip data.

Mechanism: measured skinned source hand fitting, normalized finger pose, raw-hand
microphone transform; independently measured raw-head mouth target. Face and waist
variants reuse female hand data only after actual influenced geometry, weights,
bind/rest matrices and VRM loader readback agree. They retain their own mouth data.
VRM1's existing thumb metacarpal is no longer overwritten by a VRM0 name alias.
The runtime keeps the shared microphone purpose/arm controller. No native-only
motion controller is introduced.

Limits: candidate only. Male thumb/handle sampled penetration reaches 6.202 mm;
actual grip, wrist, speaking/carry and seated transitions require browser review.
The cylinder model is not full microphone or whole-body continuous collision.
Female zero sampled cylinder penetration is not a visual or arbitrary-hand pass.
Source fitting once wrote six legacy files accidentally; restored clean originals
and failed output copies are documented in evidence/native-live-accessory-fit-v1.
