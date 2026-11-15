from pathlib import Path
import hashlib,json
R=Path(__file__).resolve().parents[3];P=Path(__file__).resolve().parents[1]
source=R/'assets-source/forearm-collision-v2/scripts/qa-normal-video.cjs';s=source.read_text();original=s
edits=[
("'output/playwright/forearm-'+expected.build,'normal-video-'", "'output/playwright/hand-contact-'+expected.build,'rejected-normal-video-'"),
("for(const mode of ['lap','authored'])", "for(const mode of ['authored'])"),
("'?forearm=calibrated&handTarget='+mode", "'?forearm=calibrated&handSkin=actual&handAlpha=actual&handTarget='+mode"),
("previous:null};", "previous:null,simulatedSeconds:0,simulateSteps:0};\n   const originalSim=c.simulate;c.simulate=function(dt,...args){q.simulatedSeconds+=dt;q.simulateSteps++;return originalSim.call(this,dt,...args);};"),
("playbackRate:s.playbackRate,", "simulatedSeconds:q.simulatedSeconds,simulateSteps:q.simulateSteps,playbackRate:s.playbackRate,"),
("playback:'actual wall clock1x; no frame simulation during recording'", "status:'rejected cost candidate, not a passing visual demonstration',playback:'requested wall clock1x; cumulative actual simulatedSeconds recorded so dt clamp cannot masquerade as normal speed'"),
]
for a,b in edits:
 assert s.count(a)==1,a
 s=s.replace(a,b)
(P/'scripts/qa-alpha-failure-video.cjs').write_text(s,encoding='utf8',newline='\n')
(P/'alpha-proof/video-adapter.json').write_text(json.dumps({'source':str(source),'sourceNormalizedLFSHA256':hashlib.sha256(original.encode()).hexdigest(),'scope':'authored one failed candidate only; labels/output/query and actual simulateSeconds counter; no altered movement or timing'},indent=2)+'\n',encoding='utf8')
