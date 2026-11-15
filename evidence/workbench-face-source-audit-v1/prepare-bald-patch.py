"""Build review-only diff from exact current sources; never write product files."""
from pathlib import Path
import difflib, json, hashlib
ROOT=Path(__file__).resolve().parents[2]; OUT=Path(__file__).resolve().parent
inputs={}; changes={}
def read(p):
 s=(ROOT/p).read_text(encoding='utf-8');inputs[p]=hashlib.sha256((ROOT/p).read_bytes()).hexdigest();return s
def replace(s,a,b):
 assert s.count(a)==1, (a,s.count(a))
 return s.replace(a,b)
p='prototype/src/character-appearance.js';s=read(p);original=s
s=replace(s,"import { HAIRSTYLES } from './hairstyle-catalog.js';","import { HAIRSTYLES } from './hairstyle-catalog.js';\nimport { NO_HAIR_BODIES } from './no-hair-bodies.js';")
s=replace(s,'  const skin = new Set(), hair = new Set(), hairMeshes = [];','  const skin = new Set(), hair = new Set(), hairMeshes = [];\n  let mixedHairMesh = false;')
s=replace(s,'    const materials = materialsOf(mesh);','    const materials = materialsOf(mesh);\n    if (materials.some(m => /_HAIR/.test(m.name)) && !materials.every(m => /_HAIR/.test(m.name))) mixedHairMesh = true;')
s=replace(s,'  const originals = new Map(',"  const noHairAdmission = NO_HAIR_BODIES.find(entry => entry.sha256 === avatarSha256);\n  const canHideHair = Boolean(noHairAdmission && hairMeshes.length && !mixedHairMesh);\n  let bodyMode = 'dressed';\n  const originals = new Map(")
s=replace(s,'  function neutralTexture(texture) {',"""  // Mode changes visibility, never the user's selected style. Loading a cached
  // replacement while in base mode must not make it visible.
  function applyHairVisibility() {
    const effectiveStyle = bodyMode === 'base' ? 'none' : hairStyle;
    hairMeshes.forEach(({ mesh, visible }) => { mesh.visible = effectiveStyle === 'original' && visible; });
    for (const [id, value] of replacements) value.scene.visible = effectiveStyle === id;
  }
  function setBodyMode(mode) {
    if (disposed) return { applied: false, reason: '人物已卸载' };
    if (mode !== 'base' && mode !== 'dressed') return { applied: false, reason: '未知人体模式' };
    if (mode === 'base' && !canHideHair) return { applied: false, reason: '当前身体无发基础尚未准入或缺少独立头发网格' };
    bodyMode = mode; applyHairVisibility();
    return { applied: true };
  }
  function neutralTexture(texture) {""")
s=replace(s,"    if (desiredStyle !== 'original' && !admittedStyles.some(entry => entry.id === desiredStyle))","    if (desiredStyle !== 'original' && !(desiredStyle === 'none' && canHideHair) && !admittedStyles.some(entry => entry.id === desiredStyle))")
s=replace(s,"    if (desiredStyle === 'original') {\n      hairStyle = desiredStyle; loading = false;\n      for (const value of replacements.values()) value.scene.visible = false;\n      hairMeshes.forEach(({ mesh, visible }) => { mesh.visible = visible; });", "    if (desiredStyle === 'original' || desiredStyle === 'none') {\n      hairStyle = desiredStyle; replacement = null; loading = false;\n      applyHairVisibility();")
s=replace(s,"      for (const value of replacements.values()) value.scene.visible = false;\n      applyColors(); replacement.scene.visible = true;\n      hairMeshes.forEach(({ mesh }) => { mesh.visible = false; });\n      hairStyle = desiredStyle; loading = false;", "      hairStyle = desiredStyle; loading = false;\n      applyColors(); applyHairVisibility();")
s=replace(s,"    } catch (e) {\n      if (request === generation)","    } catch (e) {\n      if (disposed || request !== generation) return { applied: false, cancelled: true };\n      if (request === generation)")
s=replace(s,"    set,\n    getState: () => ({ hairStyle, hairColor, skinTone, loading, error, ...facialPalette.getState(),\n      availableStyles: ['original', ...admittedStyles.map(entry => entry.id)],\n      styleOptions: [{id:'original',label:'原发型'}, ...admittedStyles.map(({id,label}) => ({id,label}))],", "    set, setBodyMode,\n    getState: () => ({ hairStyle, hairColor, skinTone, loading, error, bodyMode,\n      effectiveHairStyle: bodyMode === 'base' ? 'none' : hairStyle,\n      noHairAdmission: canHideHair ? { ...noHairAdmission } : null, ...facialPalette.getState(),\n      availableStyles: ['original', ...(canHideHair ? ['none'] : []), ...admittedStyles.map(entry => entry.id)],\n      styleOptions: [{id:'original',label:'原发型'}, ...(canHideHair ? [{id:'none',label:'无发（保留眉睫毛）'}] : []), ...admittedStyles.map(({id,label}) => ({id,label}))],")
changes[p]=(original,s)
p='prototype/src/foundation-avatar.js';s=read(p);original=s
s=replace(s,'  function setDebugBody(value) {\n    debugBody = Boolean(value);',"  function setDebugBody(value) {\n    const appearanceResult = appearance.setBodyMode(value ? 'base' : 'dressed');\n    if (!appearanceResult.applied) throw new Error(appearanceResult.reason);\n    debugBody = Boolean(value);")
changes[p]=(original,s)
records=[
 ('female','027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95','female','source-static-reviewed; runtime-pending'),
 ('male','62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff','male','source-static-reviewed; runtime-pending'),
 ('m1a-jaw-v1','3c11caaed49f6db514acb7678551352afdf1c2893ef92ca93b959a8d09691011','female','derived-local-jaw; scalp-inheritance-candidate; own-runtime-pending'),
 ('m1a-waisthip-v1','10778174ece87e3e3a00ecaf5e0c98eef59cd7d762e9bb52daa50162ee1743b5','female','derived-waisthip; scalp-inheritance-candidate; own-runtime-pending'),
 ('m2-male-jaw-v1','25ac8a8174110d7b0a6bb290ac8cab66ad6939ea522f80cdef62571d2ab24153','male','derived-local-jaw; scalp-inheritance-candidate; own-runtime-pending'),
]
catalog='// Exact implementation admissions, not visual acceptance.\n// Original source audit covers only female/male; derived scalps still need own readback.\nexport const NO_HAIR_BODIES = '+json.dumps([dict(id=i,sha256=h,sourceSkinEvidence=b,status=status,evidence='evidence/workbench-face-source-audit-v1/RESULT.md') for i,h,b,status in records],ensure_ascii=False,indent=2)+';\n'
changes['prototype/src/no-hair-bodies.js']=('',catalog)
patch=''.join(''.join(difflib.unified_diff(a.splitlines(True),b.splitlines(True),fromfile='a/'+p if a else '/dev/null',tofile='b/'+p)) for p,(a,b) in changes.items())
(OUT/'bald.patch').write_text(patch,encoding='utf-8',newline='\n')
(OUT/'bald-inputs.json').write_text(json.dumps({'sourceSHA256':inputs,'patchSHA256':hashlib.sha256(patch.encode()).hexdigest()},indent=2)+'\n',encoding='utf-8')
print('Prepared review-only bald.patch; no product file written.')
