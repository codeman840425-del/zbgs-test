from pathlib import Path
import gzip,json,math,hashlib,struct
R=Path(__file__).resolve().parent;E=R/'evidence'
paths=[E/'baseline/actual-surfaces.json.gz',E/'candidate/actual-surfaces.json.gz']
a,b=[json.loads(gzip.decompress(p.read_bytes()))['timeline']for p in paths]
sub=lambda x,y:[v-u for v,u in zip(x,y)]
norm=lambda x:math.sqrt(sum(v*v for v in x))
rows=[]
for at in [4.708333333333357,4.750000000000026]:
 i=min(range(len(b)),key=lambda i:abs(b[i]['t']-at));assert abs(b[i]['t']-at)<1e-9
 frames=[]
 for j in [i-1,i]:
  c=next(c for c in b[j]['handContacts']if c['side']=='left')
  frames.append({'t':b[j]['t'],'mode':b[j]['mode'],'sourceWrist':c['authoredWrist'],'oldRawWrist':a[j]['wrists'][0]['position'],'newRawWrist':b[j]['wrists'][0]['position'],'initialTarget':c['initialTarget'],'projection':c['garmentProjection'],'forearmProjection':c['iterationTrace'][0]['forearmCorrection'],'palmProjection':c['iterationTrace'][0]['palmCorrection'],'iterations':c['iterationTrace'],'offset':sub(b[j]['wrists'][0]['position'],c['authoredWrist']),'clamped':c['clamped']})
 before,after=frames;sourceDelta=sub(after['sourceWrist'],before['sourceWrist']);offsetDelta=sub(after['offset'],before['offset']);actualDelta=sub(after['newRawWrist'],before['newRawWrist']);pred=[x+y for x,y in zip(sourceDelta,offsetDelta)]
 rows.append({'t':at,'frames':frames,'sourceDelta':sourceDelta,'offsetDelta':offsetDelta,'actualDelta':actualDelta,'sourceStep':norm(sourceDelta),'offsetChange':norm(offsetDelta),'newStep':norm(actualDelta),'sourceAndOffsetSumError':norm(sub(pred,actualDelta)),'maxOldRawVsAuthored':max(math.dist(f['sourceWrist'],f['oldRawWrist'])for f in frames),'alphaRejectedInitial':[f['iterations'][0]['witness']['alphaRejected']for f in frames]})
manifest=json.loads((R/'prototype/public/assets/m1/equipment.json').read_text(encoding='utf8'));entry=next(x for x in manifest['items']if x['id']=='m1-uniform-skirt-open-waist-v1');src=R/'prototype/public/assets/m1'/entry['url'];buf=src.read_bytes();n=struct.unpack_from('<I',buf,12)[0];g=json.loads(buf[20:20+n]);blob=buf[28+n:];attr=g['accessors'][g['meshes'][0]['primitives'][0]['attributes']['POSITION']];v=g['bufferViews'][attr['bufferView']];off=v.get('byteOffset',0)+attr.get('byteOffset',0);positions={i:struct.unpack_from('<fff',blob,off+i*v.get('byteStride',12))for i in [22,25,26,373,376,374]}
report={'baseline':'7a86c24e34aa','candidate':'c182f9e4368f','inputs':{str(p.relative_to(R)):hashlib.sha256(p.read_bytes()).hexdigest()for p in paths+[src]},'scriptSHA':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'events':rows,'witnessSourcePositions':positions,'sharedWitnessEdgeExact':positions[22]==positions[373]and positions[26]==positions[376],'finding':'Source wrist unchanged; discontinuity enters via same solver palm projection dropping 9.73359mm or6.96147mm. No forearm projection or IK clamp. Strongest accepted witness changes/disappears.','unproven':'No per-rail identity or reject reason captured: precise rail silhouette/interval/depth cause cannot be distinguished. Existing 1x normal clips do not contain the same second-path approach transition; visual visibility of these exact events remains unverified.'}
(E/'wrist-snap-cause.json').write_text(json.dumps(report,indent=2));print(json.dumps([{k:r[k]for k in ['t','sourceStep','offsetChange','newStep','sourceAndOffsetSumError','maxOldRawVsAuthored','alphaRejectedInitial']}for r in rows],indent=2))
