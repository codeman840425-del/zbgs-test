// Generated asset registrations; no character-specific movement implementation.
import batch from '../public/assets/m2-representative-batch-v1/runtime-index.json' with {type:'json'};
import revised from '../public/assets/m2-representative-batch-v2/runtime-index.json' with {type:'json'};

if(batch.schema!=='representative-runtime-index-v1' || batch.presets.length!==8 ||
   new Set(batch.presets.map(p=>p.id)).size!==8 ||
   ['female','male'].some(sex=>batch.presets.filter(p=>p.sex===sex).length!==4))
  throw Error('代表预设批次清单不完整');

// V1 stays addressable for saved recipes and before/after evidence. The two
// failed revision-2 requests have no profile or asset and cannot be selected.
const rejected=new Set(['female-long-slender-v2','male-long-lean-v2']);
const expected=new Set(batch.presets.map(p=>p.id+'-v2').filter(id=>!rejected.has(id)));
if(revised.schema!=='representative-runtime-index-v1'||revised.completeBatch!==false||
   revised.declaredBatchSize!==8||revised.presets.length!==6||
   new Set(revised.presets.map(p=>p.id)).size!==6||revised.presets.some(p=>!expected.has(p.id))||
   revised.unpublished.length!==2||new Set(revised.unpublished.map(p=>p.id)).size!==2||
   revised.unpublished.some(p=>!rejected.has(p.id)))throw Error('修订候选与未产出记录不一致');
export const REPRESENTATIVE_PRESETS=[
  ...revised.presets.map(p=>({...p,previewLabel:p.label+' · 修订待验'})),
  ...batch.presets.map(p=>({...p,previewLabel:p.label+' · 初版对照（有缺陷）'})),
];
export const REPRESENTATIVE_PROFILES=Object.fromEntries(REPRESENTATIVE_PRESETS.map(p=>[p.id,p.profile]));
export const REPRESENTATIVE_NO_HAIR=[...batch.noHair,...revised.noHair];
export const REPRESENTATIVE_PALETTE=batch.palette;
export const REPRESENTATIVE_PALETTES=[batch.palette,revised.palette];
export const REPRESENTATIVE_UNPUBLISHED=revised.unpublished;
