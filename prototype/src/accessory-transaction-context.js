import {validateAccessories} from './accessory-recipe.js';

// A final-look descriptor is data, not permission to bypass the currently worn
// hat. Only the whole-look coordinator owns the transition to synchronous commit.
const contexts=new WeakMap();
export function createAccessoryTransactionContext(actor,accessories){
 if(!actor.vrm)throw Error('Whole-look transaction requires the actual VRM instance');
 const value=structuredClone(accessories);
 validateAccessories(actor.profile.sha256,value);
 const token=Object.freeze(Object.create(null));
 const state={actor,value,phase:'preparing'};contexts.set(token,state);
 return{token,
  beginCommit(){if(state.phase!=='preparing')throw Error('整套附件事务已关闭或已提交');state.phase='committing';},
  close(){state.phase='closed';contexts.delete(token);},
 };
}
export function readAccessoryTransactionContext(token,bodySha,vrm){
 const state=contexts.get(token);
 if(!state||state.phase==='closed'||state.actor.profile.sha256!==bodySha||state.actor.vrm!==vrm)throw Error('无效或已关闭的整套附件事务');
 return structuredClone(state.value);
}
export function assertAccessoryTransactionCommit(token,vrm){
 if(token!==undefined&&(contexts.get(token)?.phase!=='committing'||contexts.get(token)?.actor.vrm!==vrm))throw Error('附件依赖修改必须由整套造型同步提交');
}
