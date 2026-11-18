import * as THREE from 'three';
import {validateCharacterRecord} from './character-record.js';
import {restoreRuntimeCharacterRecord, captureRuntimeCharacterRecord} from './character-runtime-record.js';
import {foundationProfile} from './foundation-profiles.js';
import {loadFoundationAvatar} from './foundation-avatar.js';
import {loadRetargetedMotions} from './motion-source.js';
import {createMotion} from './motion.js';
import {recordedOutfitIndex} from './outfit-selection.js';

// Shared by a room controller and a bare game consumer. No workbench fields,
// local drafts, UI events or separate animation clock are involved.
export function createRecordAppearanceController(actor) {
  return {
    actor, outfit: actor.getOutfitInfo().index, outfitRevision: 0, isPeer: true,
    async prepareOutfit(selection) {
      const previous = this.outfit, revision = this.outfitRevision;
      const update = await actor.prepareOutfit(selection);
      return {
        isCurrent: () => this.actor === actor && this.outfitRevision === revision && update.isCurrent(),
        commit: () => { update.commit(); this.outfit = selection; this.outfitRevision = revision + 1; },
        rollback: () => { update.rollback(); this.outfit = previous; this.outfitRevision++; },
        dispose: () => update.dispose(),
      };
    },
  };
}

/** Prepare a complete recorded character off-scene. Only attach after success.
 * Caller owns scene slots, movement/behavior and the single simulation clock.
 * Aborted network work may finish, but cannot attach and releases its candidate.
 */
export async function prepareRecordedCharacter(input, {
  scene, renderer, position = [0, 0, 0], isCurrent = () => true, signal,
  createController = ({avatar}) => createRecordAppearanceController(avatar),
} = {}) {
  const record = structuredClone(input);
  const current = () => !signal?.aborted && isCurrent();
  const ensureCurrent = () => {
    if (!current()) throw Object.assign(new Error('Character consumption cancelled'), {code: 'record-cancelled'});
  };
  if (!scene?.isScene || !renderer) throw new TypeError('Game scene and renderer required');
  if (!Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite)) throw new TypeError('Finite world position required');
  const worldPosition = [...position];
  await validateCharacterRecord(record, {validationCallback: () => ({status: 'pending'})});
  const base = record.appearanceRecipe?.base;
  const profile = foundationProfile(base?.bodyType);
  if (profile.sha256 !== base?.sha256) throw new Error('Recorded body resource version unavailable');
  const outfitIndex = recordedOutfitIndex(profile, record.appearanceRecipe.equipment);
  ensureCurrent();
  let avatar, motion, controller, disposed = false, attached = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    // The owner callback only handles behavior/seat state; shared assets below
    // always have one disposer, even if cleanup of the controller fails.
    try { controller?.disposeRecordController?.(); }
    finally { try { motion?.dispose(); } finally { avatar?.dispose(); } }
  };
  try {
    avatar = await loadFoundationAvatar({
      scene, renderer, bodyType: base.bodyType, attachToScene: false, initialOutfit: outfitIndex,
      nativeHairCenter: record.nativeHairCenter ?? null,
    });
    ensureCurrent();
    avatar.root.position.fromArray(worldPosition);
    const clips = await loadRetargetedMotions(avatar.vrm, {
      avatarSha256: avatar.getAssetProfile().sha256,
      targetFloorY: avatar.root.getWorldPosition(new THREE.Vector3()).y,
    });
    ensureCurrent();
    motion = createMotion(avatar.vrm, avatar.root, clips, avatar.profile.motion);
    controller = createController({avatar, motion, actorId: record.identity.id, position: worldPosition, outfitIndex});
    const restored = await restoreRuntimeCharacterRecord(controller, record, {isCurrent: current});
    ensureCurrent();
    if (!restored.applied) throw new Error(restored.reason || 'Complete character restoration failed');
    const instance = {
      avatar, motion, controller,
      identity: Object.freeze({...record.identity}),
      revision: record.revision, recordSha256: record.integrity.recordSha256,
      attach() {
        ensureCurrent();
        if (disposed) throw new Error('Character already released');
        if (!attached) { scene.add(avatar.root); attached = true; }
        return instance;
      },
      // Same update ordering as CharacterScene. This is the presentation entry;
      // a full room controller can instead use its existing simulate(dt).
      update(dt, state = {}, colliders = []) {
        if (disposed) throw new Error('Character already released');
        if (!Number.isFinite(dt) || dt < 0) throw new TypeError('Seconds delta must be finite and nonnegative');
        motion.update(dt, state);
        avatar.update(dt, {action: state.action ?? 'idle'});
        avatar.root.updateMatrixWorld(true);
        avatar.updateGarment(motion.getMetrics().sitProgress, dt, colliders);
      },
      // Read the current look as a proposed next revision of the loaded record.
      // This operation leaves the bound revision and its provenance intact.
      async capture() {
        if (disposed) throw new Error('Character already released');
        const result = await captureRuntimeCharacterRecord(controller, {previous: record, expectedRevision: record.revision});
        if (disposed) throw new Error('Character already released');
        return result;
      },
      dispose,
    };
    instance.update(0, {action: 'idle'});
    avatar.resetSecondary();
    ensureCurrent();
    return instance;
  } catch (error) {
    dispose();
    throw error;
  }
}
