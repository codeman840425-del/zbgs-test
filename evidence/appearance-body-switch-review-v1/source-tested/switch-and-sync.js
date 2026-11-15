function syncFoundationControls(a) {
  if (!a.config) return;
  document.querySelector('[data-outfit="0"] b').textContent = a.config.pantsLabel;
  document.querySelector('[data-outfit="1"]').hidden = !a.config.ids.skirt;
  const oldTrial = document.querySelector('[data-outfit="2"]');
  oldTrial.hidden = !a.config.ids.shorts;
  if (a.config.ids.shorts) oldTrial.querySelector("b").textContent = a.config.shortsLabel;
  document.querySelector("#foundation-legend").textContent = `${a.config.label}：同一房间与控制器，当前基模独立验证。`;
}

async function switchFoundationBody(bodyType) {
  const request = ++bodySelectionGeneration;
  if (!ready || !avatar?.config) return {applied:false,reason:'人物尚未准备好'};
  bodySelection.requested = bodyType; bodySelection.error = null;
  if (avatar.profile.bodyType === bodyType) { bodySelection.loading = false; return {applied:true,bodyType}; }
  bodySelection.loading = true;
  let nextAvatar, nextMotion;
  try {
    // Prepare completely off-scene; the current avatar remains usable on failure.
    nextAvatar = await loadFoundationAvatar({scene:world,renderer,bodyType,attachToScene:false});
    if (request !== bodySelectionGeneration) return {applied:false,cancelled:true};
    nextAvatar.root.position.copy(avatar.root.position);
    const clips = await loadRetargetedMotions(nextAvatar.vrm,{avatarSha256:nextAvatar.profile.sha256});
    if (request !== bodySelectionGeneration) return {applied:false,cancelled:true};
    const colors = avatar.appearance.getState(), notices = [];
    const hairStyle = nextAvatar.appearance.getState().availableStyles.includes(colors.hairStyle) ? colors.hairStyle : 'original';
    if (hairStyle !== colors.hairStyle) notices.push('原发型未适配此身体，已使用该人物原发型');
    const applied = await nextAvatar.appearance.set({hairStyle,hairColor:colors.hairColor,skinTone:colors.skinTone,eyeColor:colors.eyeColor,lipColor:colors.lipColor});
    if (!applied.applied) throw new Error(applied.reason || '外观配置加载失败');
    if (request !== bodySelectionGeneration) return {applied:false,cancelled:true};
    const oldRole = avatar.config.outfits.find(entry => entry.index === controller.outfit)?.role;
    const outfit = nextAvatar.config.outfits.find(entry => entry.role === oldRole)?.index ?? 0;
    if (!nextAvatar.config.outfits.some(entry => entry.role === oldRole)) notices.push('原服装没有此身体版型，已切到裤装');
    nextAvatar.setOutfit(outfit);
    nextAvatar.setDebugBody(inspection.bodyMode === 'base'); nextAvatar.setDynamics(inspection.dynamics);
    nextMotion = createMotion(nextAvatar.vrm,nextAvatar.root,clips,nextAvatar.profile.motion);
    nextMotion.setCorrections({...correctionLayers[inspection.corrections]});
    const oldAvatar = avatar, oldMotion = motion;
    const saved = {position:avatar.root.position.clone(),yaw:controller.yaw,camera:cameraMode,
      cameraPosition:camera.position.clone(),cameraTarget:controls.target.clone(),speed:controller.maxSpeed,
      paused:controller.paused,rate:controller.playbackRate,simulationTime:controller.simulationTime,
      seated:['sit','stand'].includes(controller.mode)||controller.seatAlign,
      active:controller.mode!=='idle',danceId:motion.getDance()?.id};
    if (saved.seated) { saved.position.fromArray(seatTargets(nextMotion).approach); notices.push('更换身体后回到椅前站位，请重新入座以验证接触'); }
    else if (saved.active) notices.push('当前动作已结束，可用新身体重新播放');
    for (const task of [controller.behaviorTasks.active(),...controller.behaviorTasks.pending()].filter(Boolean))
      controller.behaviorTasks.cancel(task.requestId,'body-replaced');
    controller.cancelSequence(); controller.reset();
    // Synchronous commit: no intermediate frame contains both actors or a T-pose.
    avatar = nextAvatar; motion = nextMotion; nextAvatar = null; nextMotion = null;
    avatar.root.position.copy(saved.position); avatar.root.rotation.y = saved.yaw;
    controller.yaw = saved.yaw; controller.turnPolicy.reset(saved.yaw); controller.modeTime = 0; controller.lastGreetingRequest = null;
    controller.outfit = outfit; controller.simulationTime = saved.simulationTime;
    controller.setSpeed(saved.speed); controller.setPlaybackRate(saved.rate); controller.setPaused(saved.paused);
    motion.reset(); motion.setAction('idle'); motion.update(0,{distanceDelta:0,speed:0,moving:false,action:'idle',turning:false});
    avatar.update(0); avatar.root.updateMatrixWorld(true); avatar.resetSecondary(); avatar.updateGarment(0,0,chairBounds);
    const dance = motion.getDances().find(entry => entry.id === saved.danceId) || motion.getDances().find(entry => entry.id === 'rokoko-5359146-30s-v1') || motion.getDances()[0];
    if (dance) motion.setDance(dance.id);
    oldAvatar.root.removeFromParent(); world.add(avatar.root); oldMotion.dispose(); oldAvatar.dispose();
    syncFoundationControls(avatar); populateDanceSelect(document.querySelector('select[aria-label="舞蹈样件"]'));
    document.querySelector('#speaking-button').textContent = '讲话演示';
    for (const [kind,label] of [['mic','麦克风'],['glasses','眼镜']]) {
      document.querySelector(`[data-accessory-kind="${kind}"]`).textContent = '装备'+label;
      document.querySelector(`[data-accessory-status="${kind}"]`).textContent = '';
    }
    createDebugHelpers(); syncInspectionUI();
    cameraMode = saved.camera; cameraTween = null; controls.enabled = !fixedViews.has(cameraMode);
    camera.position.copy(saved.cameraPosition); controls.target.copy(saved.cameraTarget);
    followPosition.copy(avatar.root.position); updateFixedCamera(); syncViewButtons();
    const url = new URL(location.href); url.searchParams.set('body',bodyType); history.replaceState(history.state,'',url);
    refreshUI();
    return {applied:true,bodyType,notice:notices.join('；')};
  } catch (error) {
    if (request === bodySelectionGeneration) bodySelection.error = error.message;
    return {applied:false,reason:error.message};
  } finally {
    nextMotion?.dispose(); nextAvatar?.dispose();
    if (request === bodySelectionGeneration) bodySelection.loading = false;
  }
}
