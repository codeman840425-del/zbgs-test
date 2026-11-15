function syncFoundationControls(a) {
  if (!a.config) return;
  document.querySelectorAll("[data-outfit]").forEach(button =>
    button.setAttribute("aria-pressed", String(Number(button.dataset.outfit) === controller.outfit)));
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
  let nextAvatar, nextMotion, committed = false;
  const notices = [];
  try {
    // Prepare completely off-scene; the current avatar remains usable on failure.
    nextAvatar = await loadFoundationAvatar({scene:world,renderer,bodyType,attachToScene:false});
    if (request !== bodySelectionGeneration) return {applied:false,cancelled:true};
    nextAvatar.root.position.copy(avatar.root.position);
    const clips = await loadRetargetedMotions(nextAvatar.vrm,{avatarSha256:nextAvatar.profile.sha256});
    if (request !== bodySelectionGeneration) return {applied:false,cancelled:true};
    const colors = avatar.appearance.getState();
    const hairStyle = nextAvatar.appearance.getState().availableStyles.includes(colors.hairStyle) ? colors.hairStyle : 'original';
    if (hairStyle !== colors.hairStyle) notices.push('原发型未适配此身体，已使用该人物原发型');
    const applied = await nextAvatar.appearance.set({hairStyle,hairColor:colors.hairColor,skinTone:colors.skinTone,eyeColor:colors.eyeColor,lipColor:colors.lipColor});
    if (!applied.applied) throw new Error(applied.reason || '外观配置加载失败');
    if (request !== bodySelectionGeneration) return {applied:false,cancelled:true};
    const initialRole = avatar.config.outfits.find(entry => entry.index === controller.outfit)?.role;
    nextAvatar.setOutfit(nextAvatar.config.outfits.find(entry => entry.role === initialRole)?.index ?? 0);
    nextAvatar.setDebugBody(inspection.bodyMode === 'base'); nextAvatar.setDynamics(inspection.dynamics);
    nextMotion = createMotion(nextAvatar.vrm,nextAvatar.root,clips,nextAvatar.profile.motion);
    // Prepare this detached actor's real materials against the room lights.
    // Capture current controller/camera state only after this asynchronous wait.
    await renderer.compileAsync(nextAvatar.root,camera,world);
    if (request !== bodySelectionGeneration) return {applied:false,cancelled:true};
    const oldRole = avatar.config.outfits.find(entry => entry.index === controller.outfit)?.role;
    const outfit = nextAvatar.config.outfits.find(entry => entry.role === oldRole)?.index ?? 0;
    if (!nextAvatar.config.outfits.some(entry => entry.role === oldRole)) notices.push('原服装没有此身体版型，已切到裤装');
    nextAvatar.setOutfit(outfit);
    nextAvatar.setDebugBody(inspection.bodyMode === 'base'); nextAvatar.setDynamics(inspection.dynamics);
    nextMotion.setCorrections({...correctionLayers[inspection.corrections]});
    const oldAvatar = avatar, oldMotion = motion;
    const saved = {position:avatar.root.position.clone(),yaw:controller.yaw,camera:cameraMode,
      cameraPosition:camera.position.clone(),cameraTarget:controls.target.clone(),speed:controller.maxSpeed,
      paused:controller.paused,rate:controller.playbackRate,simulationTime:controller.simulationTime,
      seated:['sit','stand'].includes(controller.mode)||controller.seatAlign,
      active:controller.mode!=='idle',danceId:motion.getDance()?.id};
    if (saved.seated) { saved.position.fromArray(seatTargets(nextMotion).approach); notices.push('更换身体后回到椅前站位，请重新入座以验证接触'); }
    else if (saved.active) notices.push('当前动作已结束，可用新身体重新播放');
    // Every asset-dependent operation remains owned by the preparation locals.
    // No old actor/controller state is changed if one of these calls fails.
    nextAvatar.root.position.copy(saved.position); nextAvatar.root.rotation.y = saved.yaw;
    nextMotion.reset(); nextMotion.setAction('idle');
    nextMotion.update(0,{distanceDelta:0,speed:0,moving:false,action:'idle',turning:false});
    nextAvatar.livePresentation?.setAction('idle');
    nextAvatar.update(0); nextAvatar.root.updateMatrixWorld(true);
    nextAvatar.resetSecondary(); nextAvatar.updateGarment(0,0,chairBounds);
    const dance = nextMotion.getDances().find(entry => entry.id === saved.danceId) || nextMotion.getDances().find(entry => entry.id === 'rokoko-5359146-30s-v1') || nextMotion.getDances()[0];
    if (dance) nextMotion.setDance(dance.id);
    const oldTasks = [controller.behaviorTasks.active(),...controller.behaviorTasks.pending()].filter(Boolean);
    if (request !== bodySelectionGeneration) return {applied:false,cancelled:true};

    // Attach before transferring ownership: an attachment error still disposes
    // the prepared actor. This synchronous section cannot render a mixed frame.
    world.add(nextAvatar.root);
    avatar = nextAvatar; motion = nextMotion; nextAvatar = null; nextMotion = null;
    committed = true;
    // Reset only command/path state. Calling controller.reset() would teleport
    // and re-pose the old actor and also overwrite camera/speed preferences.
    Object.assign(controller, {
      executingRequest:null, deferredBehavior:null, pending:null,
      path:[], target:null, afterWalk:null, seatAlign:false, pathTurn:null, curveTurnSign:null,
      sequence:[], sequenceIndex:-1, sequenceTime:0,
      mode:'idle', lastAction:'idle', modeTime:0, turning:false, turnRemaining:0,
      speed:0, actualSpeed:0, distance:0, yaw:saved.yaw, outfit,
      simulationTime:saved.simulationTime, maxSpeed:saved.speed,
      paused:saved.paused, playbackRate:saved.rate, lastFrameTime:performance.now(),
      seatToken:null, lastGreetingRequest:null, pointerDown:null,
    });
    marker.visible = false;
    // Cleanup and presentation are independent after commit. A failed UI write
    // must not report that the old (already replaced) character was retained.
    const finish = (label, work) => {
      try { work(); } catch (error) { notices.push(`${label}：${error.message || error}`); }
    };
    finish('转向状态清理失败', () => controller.turnPolicy.reset(saved.yaw));
    for (const task of oldTasks) finish('旧动作清理失败', () => controller.behaviorTasks.cancel(task.requestId,'body-replaced'));
    controller.lastGreetingRequest = null;
    finish('座位占用清理失败', () => seatLeases.disposeOwner(controller.actorId));
    finish('旧人物移除失败', () => oldAvatar.root.removeFromParent());
    finish('旧动作资源清理失败', () => oldMotion.dispose());
    finish('旧人物资源清理失败', () => oldAvatar.dispose());
    finish('序列界面更新失败', () => controller.cancelSequence());
    finish('服装界面更新失败', () => syncFoundationControls(avatar));
    finish('舞蹈界面更新失败', () => populateDanceSelect(document.querySelector('select[aria-label="舞蹈样件"]')));
    finish('附件界面更新失败', () => {
      document.querySelector('#speaking-button').textContent = '讲话演示';
      for (const [kind,label] of [['mic','麦克风'],['glasses','眼镜']]) {
        document.querySelector(`[data-accessory-kind="${kind}"]`).textContent = '装备'+label;
        document.querySelector(`[data-accessory-status="${kind}"]`).textContent = '';
      }
    });
    finish('骨骼辅助更新失败', () => createDebugHelpers());
    finish('调试界面更新失败', () => syncInspectionUI());
    cameraMode = saved.camera; cameraTween = null; controls.enabled = !fixedViews.has(cameraMode);
    camera.position.copy(saved.cameraPosition); controls.target.copy(saved.cameraTarget);
    followPosition.copy(avatar.root.position);
    finish('镜头界面更新失败', () => { updateFixedCamera(); syncViewButtons(); });
    finish('地址更新失败', () => {
      const url = new URL(location.href); url.searchParams.set('body',bodyType); history.replaceState(history.state,'',url);
    });
    finish('状态界面更新失败', () => refreshUI());
    return {applied:true,bodyType,notice:notices.join('；')};
  } catch (error) {
    if (committed) return {applied:true,bodyType,notice:[...notices,`人物已切换，后续更新失败：${error.message || error}`].join('；')};
    if (request === bodySelectionGeneration) bodySelection.error = error.message;
    return {applied:false,reason:error.message};
  } finally {
    try { nextMotion?.dispose(); } finally { nextAvatar?.dispose(); }
    if (request === bodySelectionGeneration) bodySelection.loading = false;
  }
}
