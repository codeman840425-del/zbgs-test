import {validateAccessories} from './accessory-recipe.js';

// A final-look descriptor is data, not permission to bypass the currently worn
// hat. Only the whole-look coordinator owns the transition to synchronous commit.
const contexts=new WeakMap();
export function createAccessoryTransactionContext(actor,accessories,glassesTarget){
 if(!actor.vrm)throw Error('Whole-look transaction requires the actual VRM instance');
 const value=structuredClone(accessories);
 if(value!==undefined)validateAccessories(actor.profile.sha256,value);
 const token=Object.freeze(Object.create(null));
 const state={actor,value,glassesTarget:structuredClone(glassesTarget),phase:'preparing'};contexts.set(token,state);
 return{token,
  beginCommit(){if(state.phase!=='preparing')throw Error('整套附件事务已关闭或已提交');state.phase='committing';},
  close(){state.phase='closed';contexts.delete(token);},
 };
}
function readContext(token,bodySha,vrm){
 const state=contexts.get(token);
 if(!state||state.phase==='closed'||state.actor.profile.sha256!==bodySha||state.actor.vrm!==vrm)throw Error('无效或已关闭的整套附件事务');
 return state;
}
export function readAccessoryTransactionContext(token,bodySha,vrm){
 return structuredClone(readContext(token,bodySha,vrm).value);
}
export function readGlassesTarget(token,bodySha,vrm){
 if(token===undefined)return undefined;
 const state=readContext(token,bodySha,vrm);
 // A target may permit resource preparation. Visible head changes always
 // inspect mounted/pending glasses after any coordinated removal has committed.
 return state.phase==='preparing'?structuredClone(state.glassesTarget):undefined;
}
export function assertAccessoryTransactionCommit(token,vrm){
 if(token!==undefined&&(contexts.get(token)?.phase!=='committing'||contexts.get(token)?.actor.vrm!==vrm))throw Error('附件依赖修改必须由整套造型同步提交');
}
