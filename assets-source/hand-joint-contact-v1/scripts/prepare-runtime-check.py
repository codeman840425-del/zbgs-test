from pathlib import Path
import hashlib,json
P=Path(__file__).resolve().parents[1];R=P.parents[1]
src=R/'assets-source/hand-contact-v1/scripts/qa-alpha-runtime.cjs';s=src.read_text();original=s
edits=[
("proofMode=process.env.QA_HAND_ALPHA||'actual'", "proofMode=process.env.QA_HAND_SKIN_MODE||'actual'"),
("'alpha-equivalence-'+proofMode", "'joint-source-pose-'+proofMode"),
("modes=compareTargets?['lap','authored']:['legacy','calibrated']", "modes=['authored']"),
("'?forearm=calibrated&handSkin=actual&handAlpha='+proofMode+'&handTarget='+mode", "'?forearm=calibrated&handSkin='+proofMode+'&handTarget='+mode"),
("q.frames.push({frame:q.index+1", "const fingerPose={};for(const side of ['left','right'])for(const finger of ['Thumb','Index','Middle','Ring','Little'])for(const part of (finger==='Thumb'?['Metacarpal','Proximal','Distal']:['Proximal','Intermediate','Distal'])){const name=side+finger+part;const normalized=a.vrm.humanoid.getNormalizedBoneNode(name),raw=a.vrm.humanoid.getRawBoneNode(name);fingerPose[name]={normalized:normalized.quaternion.toArray(),raw:raw.quaternion.toArray()};}q.frames.push({fingerPose,frame:q.index+1"),
]
for a,b in edits:
 assert s.count(a)==1,a
 s=s.replace(a,b)
# Script sits one directory deeper than original source, but identical root depth (assets-source/pkg/scripts).
(P/'scripts/qa-joint-source-pose.cjs').write_text(s,encoding='utf8',newline='\n')
(P/'scripts/runtime-adapter.json').write_text(json.dumps({'source':str(src),'sourceNormalizedSHA256':hashlib.sha256(original.encode()).hexdigest(),'scope':'authored actual/legacy only; same270 trajectory and skin capture plus read-only30finger quaternions'},indent=2)+'\n',encoding='utf8')
