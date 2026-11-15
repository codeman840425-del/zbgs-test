# Bounded photo / video extraction experiment

Official MediaPipe Tasks only; these scripts are experiment tooling, not a custom pose model. Game source/dependencies and existing VRM skin bindings are untouched.

From `F:/gamemake`, restore a Python 3.13 environment if absent:

```powershell
py -3.13 -m venv analysis/mediapipe-reference/.venv
.\analysis\mediapipe-reference\.venv\Scripts\python.exe -m pip install -r scripts/pose-reference/requirements.lock.txt
.\analysis\mediapipe-reference\.venv\Scripts\python.exe scripts/pose-reference/restore_inputs.py
.\analysis\mediapipe-reference\.venv\Scripts\python.exe scripts/pose-reference/extract.py evidence/real-microphone-pose-v1/headphones.jpg evidence/real-microphone-pose-v1/stage.jpg --out evidence/real-microphone-pose-v1/results-replay
.\analysis\mediapipe-reference\.venv\Scripts\python.exe scripts/pose-reference/extract.py evidence/real-video-pose-v1/dvids-squat-original.mp4 --video --start 15 --end 23 --out evidence/real-video-pose-v1/results-replay
```

Existing approved extraction inputs are not overwritten. Photos are retained in evidence; `sources.py` captures source pages and compares currently served thumbnails, and `verify_photo.py` checks decoded RGB identity for headphones. A current JPEG may differ in metadata while pixels remain identical. The first source-script invocation finished its saved records then failed only printing a Unicode photographer name to the GBK console; the script now prints ASCII-escaped JSON. It was not a download/detection failure.

`review_video.py` reads canonical `results/sequence.json`, emits original/annotated silent H264 1× clips from original per-frame PTS, verifies their decoded timing, and writes temporal metrics. It is not an accuracy test. The overlay's top 48-pixel legend covers a small part of the image; use `source-clip-1x.mp4` for unobscured source viewing. No crop is applied to inference or source clip.

Models are existing official float16 version-path `1` bundles. SHA256, URL, size, and HEAD ETag/local-MD5 match are saved in `model-sources.json`; models were not downloaded again for verification. Python package installed is mediapipe 1.2.3; complete dependency lock retained. MediaPipe library is Apache 2.0 per installed package metadata; source footage licenses and use conditions are independent, in evidence manifests.

Failure behavior: missing PTS or non-increasing millisecond timestamps fail rather than invent timing. Zero detections stay empty. No keypoint score is fabricated. An absent hand is not replaced with a default hand. Only one video should be passed per invocation because task tracking state must not carry between independent sources.

Outputs are predicted joint positions, not rotations, global root motion, mesh weights, or a verified animation. Retargeting must preserve original time, use the target rig's fixed bone lengths, retain documented visibility limits, solve foot/root contact deliberately, and compare the complete motion on both current VRMs at 1× before acceptance. Do not re-skin the existing VRMs.
