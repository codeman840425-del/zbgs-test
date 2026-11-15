"""Prepare local review diffs and an isolated install, never main runtime mutation."""
from pathlib import Path
import json,hashlib,difflib,re,shutil,argparse
P=Path(__file__).resolve().parents[1];R=P.parents[1];W=R/'experiments/hand-contact-worktree-1/prototype';parser=argparse.ArgumentParser();parser.add_argument('--install',action='store_true');args=parser.parse_args()
sha=lambda b:hashlib.sha256(b).hexdigest()
specs=[('female','female','027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'),('m1a-jaw-v1','jaw','3c11caaed49f6db514acb7678551352afdf1c2893ef92ca93b959a8d09691011'),('m1a-waisthip-v1','waisthip','10778174ece87e3e3a00ecaf5e0c98eef59cd7d762e9bb52daa50162ee1743b5')]
entries={}
for ident,file,bodysha in specs:
 raw=(P/(file+'.profile.json')).read_bytes();profile=json.loads(raw);assert profile['bodySHA256']==bodysha
 entries[ident]={'url':'/assets/hand-joint-contact-v1/'+file+'.json','sha256':sha(raw),'bodySHA256':bodysha}
hand=(R/'assets-source/hand-contact-v1/patch/motion.candidate.js').read_bytes();assert sha(hand)=='f55293dc4d1e965084b43c28f939494a7c13de0d348d355f80f97bf6033b56ab'
motion=hand.replace(b'\r\n',b'\n').decode().replace('createHandContourWorkspace','createJointHandWorkspace').replace('./hand-contour-workspace.mjs','./joint-hand-workspace.mjs')
motion=motion.replace('expectedSHA256:profile.handSurfaceContact.bodySHA256}', 'expectedSHA256:profile.handSurfaceContact.bodySHA256,jointProfile:profile.handSurfaceContact.jointProfile}')
motion=motion.replace('predicted-wrist-translated-authored-skin-contours-not-final-raw-skin','predicted-raw-bone-joint-envelope-not-final-raw-skin').replace('measurement.part="actual-hand-contours"','measurement.part="joint-hand-envelope"')
# Timing field names now describe actual work rather than suggesting current skin sampling.
motion=motion.replace('handSkinMs','jointHandTransformMs').replace('handContourMs','jointHandRailsMs')
def avatar(source):
 assert 'let jointHandCollision'not in source
 source=source.replace('import { validateForearmProfile } from "./forearm-envelope-projection.js";','import { validateForearmProfile } from "./forearm-envelope-projection.js";\nimport { validateJointHandProfile } from "./joint-hand-workspace.mjs";')
 anchor='  const loader = new GLTFLoader();';assert source.count(anchor)==1
 loader='''  let jointHandCollision = null;
  if (config.handSurfaceContact) {
    const response = await fetch(config.handSurfaceContact.url);
    if (!response.ok) throw new Error("Joint-hand profile failed to load");
    const bytes = await response.arrayBuffer();
    const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(n => n.toString(16).padStart(2, "0")).join("");
    if (digest !== config.handSurfaceContact.sha256) throw new Error("Joint-hand profile integrity mismatch");
    jointHandCollision = JSON.parse(new TextDecoder().decode(bytes));
    if (!validateJointHandProfile(jointHandCollision, sha256)) throw new Error("Joint-hand body identity/schema mismatch");
  }
'''
 source=source.replace(anchor,loader+anchor)
 source=re.sub(r'^      handSurfaceContact:.*\n','',source,flags=re.M);source=re.sub(r'^      handOpaqueAlphaProof:.*\n','',source,flags=re.M)
 anchor='      forearmCollisionBodySHA256: sha256,';assert source.count(anchor)==1
 source=source.replace(anchor,anchor+'\n      handSurfaceContact: new URLSearchParams(location.search).get("handSkin") === "legacy" || !jointHandCollision ? null : { bodySHA256: sha256, jointProfile: jointHandCollision },')
 return source
def profiles(source,own_forearms=False):
 source=re.sub(r'^    handSurfaceContact:.*\n','',source,flags=re.M)
 for ident,e in entries.items():
  marker='  female: {'if ident=='female'else'FOUNDATION_PROFILES["'+ident+'"] = {';assert source.count(marker)==1
  config={k:v for k,v in e.items()if k!='bodySHA256'}
  source=source.replace(marker,marker+'\n    handSurfaceContact: '+json.dumps(config)+',')
  if own_forearms and ident!='female':
   actual=R/('prototype/public/assets/m1-variants/forearm-collision-v2/'+ident+'.json');raw=actual.read_bytes();assert json.loads(raw)['bodySHA256']==e['bodySHA256']
   source=source.replace(marker,marker+'\n    forearmCollision: '+json.dumps({'url':'/assets/m1-variants/forearm-collision-v2/'+ident+'.json','sha256':sha(raw)})+',')
 return source
out=P/'portable';out.mkdir(exist_ok=True);manifest={'status':'review only; main not edited','profiles':entries,'files':{},'helperSHA256':sha((P/'joint-hand-workspace.mjs').read_bytes())}
for name,transform in [('motion.js',lambda _:motion),('foundation-avatar.js',avatar),('foundation-profiles.js',profiles)]:
 original=(R/'prototype/src'/name).read_bytes();text=original.replace(b'\r\n',b'\n').decode();candidate=transform(text)
 if name=='motion.js':assert sha(original) in ['3851f2e3b3bc8bd64323d1dc6ed29d869bb2d04f0869927aa39647d55c6cefa2','d6c5c9a9ffbbd01bc45bde575e2824499f09194acc9ab4200b8bf0c9bef5700c'],'Main motion diverged: rebase hunks instead of replacing'
 (out/(name+'.candidate')).write_text(candidate,encoding='utf8',newline='\r\n')
 (out/(name+'.patch')).write_text(''.join(difflib.unified_diff(text.splitlines(True),candidate.splitlines(True),fromfile='a/prototype/src/'+name,tofile='b/prototype/src/'+name)),encoding='utf8',newline='\r\n')
 manifest['files'][name]={'baseRawSHA256':sha(original),'baseNormalizedLFSHA256':sha(text.encode()),'candidateRawSHA256':sha((out/(name+'.candidate')).read_bytes())}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf8')
if args.install:
 before=(W/'src/motion.js').read_bytes();assert sha(before)=='f55293dc4d1e965084b43c28f939494a7c13de0d348d355f80f97bf6033b56ab','Install only from44cd source'
 (W/'src/motion.js').write_text(motion,encoding='utf8',newline='\r\n')
 for name,func in [('foundation-avatar.js',avatar),('foundation-profiles.js',lambda s:profiles(s,True))]:
  source=(W/'src'/name).read_text(encoding='utf8');(W/'src'/name).write_text(func(source),encoding='utf8',newline='\r\n')
 shutil.copyfile(P/'joint-hand-workspace.mjs',W/'src/joint-hand-workspace.mjs')
 dest=W/'public/assets/hand-joint-contact-v1';dest.mkdir(exist_ok=True)
 for ident,file,bodysha in specs:
  shutil.copyfile(P/(file+'.profile.json'),dest/(file+'.json'))
  if ident!='female':
   # These are the independently measured current profiles, not parent female config.
   f=R/('prototype/public/assets/m1-variants/forearm-collision-v2/'+ident+'.json');t=W/('public/assets/m1-variants/forearm-collision-v2/'+ident+'.json');t.parent.mkdir(exist_ok=True);shutil.copyfile(f,t)
 (out/'isolated-install.json').write_text(json.dumps({'beforeMotionRawSHA256':sha(before),'installedMotionRawSHA256':sha((W/'src/motion.js').read_bytes()),'worktree':str(W),'derivedForearmSource':'own exact body-pinned main profiles, separately supplied to old isolated base'},indent=2)+'\n',encoding='utf8')
print(out)
