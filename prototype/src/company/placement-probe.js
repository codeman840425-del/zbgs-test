import {CompanyError} from './document.js';

// Check the same candidate layout and real meshes without publishing or saving it.
// The UI caches snapped coordinates and yields between checks. Final apply retains
// authority for revision/lease and renderer preflight checks.
export async function createPlacementProbe({session,catalog,templates,assetLibrary,resource}) {
  const original=session.document,revision=session.scene.revision;
  let disposed=false;
  const geometry=session.scene.createPlacementProbe();
  if(resource)await assetLibrary?.preload([resource]);
  return {
    check(operations){
      try{
        if(disposed||session.scene.revision!==revision||session.document.id!==original.id)
          throw new CompanyError('revision-conflict','placement','The layout has changed; start placement again');
        return geometry.check(operations);
      }catch(error){return {valid:false,error};}
    },
    visual:id=>geometry.visual(id),
    dispose(){disposed=true;geometry.dispose();},
  };
}
