"""Two instrumented releases with identical test hooks; baseline stays untouched."""
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BUNDLE = pathlib.Path('assets/present_motion_v1_1111_MT-DBfKYVCQ.js')
subprocess.run([sys.executable, str(ROOT/'scripts/build-baseline-fix.py')], check=True)
HOOKS = [
    ('this.player.playBase(`idle_se`,{xfade:0}),this.update(0)}on(e){',
     'this.player.playBase(`idle_se`,{xfade:0}),this.update(0),(window.__actorsLive??=[]).push(this)}on(e){'),
    ('window.__pm=this.api()', 'window.__pm=this.api(),window.__comparisonApp=this'),
    ('destroy(){this.walkTween?.stop(),this.composer.destroy()}},Fn=class',
     'destroy(){window.__actorsLive=(window.__actorsLive??[]).filter(a=>a!==this),this.walkTween?.stop(),this.composer.destroy()}},Fn=class'),
]
CONTROLS = r'''
// TEST-ONLY hooks: identical in before and after. Never imported by the baseline.
window.__lab = {
  get app(){return window.__comparisonApp},
  get scene(){return this.app?.scenes.get(this.app.sceneKey)},
  actors(){return (window.__actorsLive??[]).filter(a=>a.scene===this.scene)},
  actor(index=0){const a=this.actors()[index];if(!a)throw Error('No live actor: call await __lab.room() first');return a},
  async room(){
    if(!this.app)throw Error('Wait for document.documentElement.dataset.appReady === "1"');
    // Use an existing packaged female look, independent of saved player choice.
    const look=this.app.looks.companion('f');
    this.app.bossLook=()=>look;
    this.app.goScene('room',{mode:'opening',phase:'day'});
    for(let i=0;i<120;i++){
      await new Promise(requestAnimationFrame);
      if(this.app.sceneKey==='room'&&this.actors().length)break;
    }
    const scene=this.scene;
    scene.rig.ev=null;scene.rig.follow=null;scene.rig.lowFx=true;
    if(scene.rig.drift){scene.rig.drift.ampX=0;scene.rig.drift.ampY=0;scene.rig.drift.ampZoom=0}
    scene.rig.cut({zoom:1,x:640,y:370});
    scene.rig.base={zoom:1,x:640,y:370};
    for(const d of scene.dirs??[]){d.manual=true;d.until=Infinity}
    document.getElementById('ui').style.visibility='hidden';
    const a=this.actor();a.stopWalk();a.setPosition(640,640);a.player.playOverlay(null,{xfade:0});a.player.playBase('idle_se',{xfade:0});
    return this.state();
  },
  base(name,index=0){const a=this.actor(index);a.stopWalk();a.player.playOverlay(null,{xfade:0});a.player.playBase(name,{xfade:0});return this.state()},
  overlay(name,index=0){this.actor(index).player.playOverlay(name,{xfade:0});return this.state()},
  walk(x,y,speed=120,index=0){return this.actor(index).walkTo(x,y,{speed,then:'idle_se'})},
  position(x,y,index=0){const a=this.actor(index);a.stopWalk();a.setPosition(x,y);return this.state()},
  mirror(value,index=0){this.actor(index).setMirror(value);return this.state()},
  state(){return {label:document.documentElement.dataset.comparisonVariant,scene:this.app?.sceneKey,actors:this.actors().map(a=>a.debugState())}}
};
'''
results=[]
for variant, source, expected in [
    ('before', ROOT/'baseline/packs/present_motion_v1_1111_MT', 'cd550920c54b1f0d5882af3d090b624e0926ad62843ea6d2ad0bb8327bcab900'),
    ('after', ROOT/'comparison-fixed', '4cad139c7d8a49068d0190cbe848d6876f2e9ab6ce77f9f0a784559771d0bd64'),
]:
    dest=ROOT/'comparison-lab'/variant
    original=(source/BUNDLE).read_bytes()
    assert hashlib.sha256(original).hexdigest()==expected, f'Unexpected {variant} input'
    text=original.decode('utf-8')
    for old,new in HOOKS:
        assert text.count(old)==1, f'Hook not unique: {old}'
        text=text.replace(old,new)
    shutil.copytree(source,dest,dirs_exist_ok=True)
    (dest/BUNDLE).write_text(text,encoding='utf-8',newline='')
    (dest/'comparison-controls.js').write_text(CONTROLS,encoding='utf-8',newline='')
    for name in ['index.html','present_motion_v1_1111_MT.html']:
        html=(dest/name).read_text(encoding='utf-8').replace('<html lang="zh-CN">', f'<html lang="zh-CN" data-comparison-variant="{variant}">')
        html=html.replace('</head>','<script src="./comparison-controls.js"></script>\n</head>')
        (dest/name).write_text(html,encoding='utf-8',newline='')
    result={'variant':variant,'inputSha256':expected,'instrumentedSha256':hashlib.sha256(text.encode('utf-8')).hexdigest(),'hookCount':len(HOOKS),'scope':'Instrumented release copy for controlled comparison only'}
    (dest/'INSTRUMENTATION.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    results.append(result)
print(json.dumps(results,indent=2))
