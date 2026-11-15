from pathlib import Path
import hashlib,json
P=Path(__file__).resolve().parents[1];R=P.parents[1]
src=R/'assets-source/hand-contact-v1/scripts/qa-alpha-failure-video.cjs';s=src.read_text();original=s
edits=[
("'rejected-normal-video-'", "'joint-normal-video-'"),
("for(const mode of ['authored'])", "for(const mode of ['legacy','actual'])"),
("'?forearm=calibrated&handSkin=actual&handAlpha=actual&handTarget='+mode", "'?forearm=calibrated&handTarget=authored&handSkin='+mode"),
("status:'rejected cost candidate, not a passing visual demonstration'", "status:'isolated joint proxy A/B; actual normal speed visual acceptance pending'"),
]
for a,b in edits:
 assert s.count(a)==1,a
 s=s.replace(a,b)
(P/'scripts/qa-normal-video.cjs').write_text(s,encoding='utf8',newline='\n')
(P/'scripts/video-adapter.json').write_text(json.dumps({'source':str(src),'sourceNormalizedLFSHA256':hashlib.sha256(original.encode()).hexdigest(),'scope':'same camera and original wallclock source trajectory; legacy/actual hand proxy only; sim/wall counters retained'},indent=2)+'\n',encoding='utf8')
