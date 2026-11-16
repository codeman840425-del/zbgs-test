// Generated asset registrations; no character-specific movement implementation.
import batch from '../public/assets/m2-representative-batch-v1/runtime-index.json' with {type:'json'};

if(batch.schema!=='representative-runtime-index-v1' || batch.presets.length!==8 ||
   new Set(batch.presets.map(p=>p.id)).size!==8 ||
   ['female','male'].some(sex=>batch.presets.filter(p=>p.sex===sex).length!==4))
  throw Error('代表预设批次清单不完整');

export const REPRESENTATIVE_PRESETS=batch.presets;
export const REPRESENTATIVE_PROFILES=Object.fromEntries(batch.presets.map(p=>[p.id,p.profile]));
export const REPRESENTATIVE_NO_HAIR=batch.noHair;
export const REPRESENTATIVE_PALETTE=batch.palette;
