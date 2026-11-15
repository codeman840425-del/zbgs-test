import {captureAppearanceRecipe,applyAppearanceRecipe,appearanceDraftKey} from './appearance-recipe.js';
// DOM binding only: appearance ownership and camera framing stay in the controller.
export function bindAppearanceWorkbench({ controller }) {
  const url = new URL(window.location.href);
  const panel = document.querySelector('#appearance-workbench');
  if (!panel || url.searchParams.get('workbench') !== 'appearance') return () => {};
  document.body.classList.add('appearance-workbench');
  document.querySelector('h1').textContent = '角色外观与动作工作台';
  panel.hidden = false;
  const form = panel.querySelector('#appearance-form');
  const fields = panel.querySelector('#appearance-fields');
  const status = panel.querySelector('#appearance-status');
  const body = document.querySelector('#appearance-body');
  const identityFields = document.querySelector('#appearance-identity-fields');
  const groupButtons = [...identityFields.querySelectorAll('[data-appearance-group]')];
  const bodyGroups = {
    female: [
      { id: 'female', label: '原版' },
      { id: 'm1a-jaw-v1', label: '下颌变化' },
      { id: 'm1a-waisthip-v1', label: '腰胯变化' },
    ],
    male: [
      { id: 'male', label: '原版' },
      { id: 'm2-male-jaw-v1', label: '下颌变化' },
    ],
  };
  const groupFor = bodyType => Object.keys(bodyGroups).find(group => bodyGroups[group].some(item => item.id === bodyType));
  const style = panel.querySelector('#appearance-hair-style');
  const hair = panel.querySelector('#appearance-hair-color');
  const skin = panel.querySelector('#appearance-skin-tone');
  const eye = panel.querySelector('#appearance-eye-color');
  const lip = panel.querySelector('#appearance-lip-color');
  const colorNote = panel.querySelector('#appearance-face-color-note');
  const note = panel.querySelector('#appearance-style-note');
  const geometryPanel=document.createElement('details');
  geometryPanel.id='appearance-geometry';
  geometryPanel.innerHTML='<summary>面部几何 · 有限样件</summary><p class="appearance-hint" id="face-geometry-note">嘴宽 ±4%；其他五官参数仍在制作。</p><label for="mouth-width">嘴宽变化（%）</label><div class="appearance-pair"><input id="mouth-width" type="number" min="-4" max="4" step="0.1" value="0"><button type="button" id="mouth-width-reset">只恢复嘴宽</button></div><label for="brow-sample">眉部位置对照</label><select id="brow-sample"><option value="none">原位</option><option value="height1-spacing1-v1">上移 1 mm · 两侧各外移 1 mm</option></select><p class="appearance-hint">眉部目前只有这一个组合样件，不代表连续调整范围已通过。</p>';
  geometryPanel.insertAdjacentHTML('beforeend','<label for="nose-sample">鼻尖位置对照</label><select id="nose-sample"><option value="none">原位</option><option value="tip-forward05-v1">鼻尖向前 0.5 mm</option></select><p class="appearance-hint">鼻部仅此端点，未开放连续范围。</p>');
  fields.prepend(geometryPanel);
  geometryPanel.insertAdjacentHTML('beforeend','<label for="eye-sample">眼裂宽度对照</label><select id="eye-sample"><option value="none">原位</option><option value="aperture-width101-v1">眼裂宽 +1%</option></select><p class="appearance-hint">眼部仅此端点，未开放连续范围。</p>');
  const eyeGeometry=geometryPanel.querySelector('#eye-sample');
  const nose=geometryPanel.querySelector('#nose-sample');
  const mouth=geometryPanel.querySelector('#mouth-width'),faceNote=geometryPanel.querySelector('#face-geometry-note'),brow=geometryPanel.querySelector('#brow-sample');
  const draftPanel=document.createElement('div');draftPanel.className='appearance-pair';
  draftPanel.innerHTML='<button type="button" id="appearance-save">保存此基模草稿</button><button type="button" id="appearance-restore">恢复已保存草稿</button>';
  fields.append(draftPanel);
  const listeners = [];
  let disposed = false, busy = false;
  let roomView = url.searchParams.get('view') === 'room';
  let [framing, direction] = (url.searchParams.get('view') || 'inspect-face-front').replace(/^inspect-/, '').split('-');
  if (!['face', 'half', 'full'].includes(framing)) framing = 'face';
  if (!['front', 'side', 'back'].includes(direction)) direction = 'front';
  const on = (node, event, fn) => { node.addEventListener(event, fn); listeners.push(() => node.removeEventListener(event, fn)); };
  const message = (text, error = false) => { status.textContent = text; status.dataset.error = String(error); };
  const actor = () => controller.actor;
  const state = () => actor().appearance.getState();
  const setBusy = value => {
    busy = value; fields.disabled = value; identityFields.disabled = value;
    form.setAttribute('aria-busy', String(value));
    identityFields.setAttribute('aria-busy', String(value));
    for(const button of document.querySelectorAll('[data-outfit]'))button.disabled=value;
  };

  // Move the original nodes after main has bound them; never clone controls or
  // reimplement their action, accessory, pause, outfit or diagnostic handlers.
  const aside = panel.closest('aside');
  const navigation = aside.querySelector('#workbench-navigation');
  const pages = aside.querySelector('#workbench-pages');
  const appearancePage = pages.querySelector('#workbench-page-appearance');
  const actionsPage = pages.querySelector('#workbench-page-actions');
  const inspectionPage = pages.querySelector('#workbench-page-inspection');
  // Identity is global, not part of the independently scrolling tool sidebar.
  document.querySelector('#app > header').append(identityFields);
  navigation.insertBefore(status, navigation.querySelector('.workbench-tabs'));
  const toolbar = panel.querySelector('#workbench-camera-toolbar');
  const viewport = document.querySelector('.viewport');
  const preview = document.createElement('div'); preview.className = 'workbench-preview';
  viewport.before(preview); preview.append(toolbar, viewport);
  const roomButton = viewport.querySelector('[data-camera="room"]');
  toolbar.append(roomButton);
  viewport.querySelector('.camera-tools').hidden = true;
  const move = (selector, destination) => {
    const node = aside.querySelector(selector);
    if (node) destination.append(node);
    return node;
  };
  appearancePage.append(panel);
  const outfitsTitle = move('#outfits-title', appearancePage);
  outfitsTitle.firstChild.textContent = '服装 ';
  move('.outfits', appearancePage);
  const danceSlot = panel.querySelector('#appearance-dance-slot');
  const actionButtons = aside.querySelector('.buttons:not(.routes)');
  const danceButton = actionButtons.querySelector('[data-action="dance"]');
  const idleButton = actionButtons.querySelector('[data-action="idle"]');
  const transport = navigation.querySelector('#workbench-transport');
  transport.append(aside.querySelector('#pause'), idleButton);
  const actionsTitle = move('#actions-title', actionsPage);
  actionsTitle.textContent = '基础移动';
  actionsPage.append(actionButtons);
  move('.control', actionsPage);
  move('.routes', actionsPage);
  move('.playback', actionsPage); // Retains the original reset button.
  const foundationActions = aside.querySelector('.foundation-actions');
  if (foundationActions) {
    // The final existing button owns comparison-instance creation/removal.
    const peer = foundationActions.lastElementChild;
    if (peer?.tagName === 'BUTTON') inspectionPage.append(peer);
    for (const link of foundationActions.querySelectorAll('a')) link.hidden = true;
    const heading = document.createElement('h3'); heading.textContent = '直播互动';
    actionsPage.append(heading, foundationActions);
  }
  actionsPage.append(danceSlot);
  move('#foundation-legend', inspectionPage);
  move('#sequence', inspectionPage);
  move('.sequence-progress', inspectionPage);
  move('#sequence-label', inspectionPage);
  move('.debug-controls', inspectionPage);
  move('details:not(#appearance-geometry)', inspectionPage);
  navigation.hidden = false; pages.hidden = false;
  const tabs = [...navigation.querySelectorAll('[data-workbench-tab]')];
  function selectTab(name, focus = false) {
    for (const tab of tabs) {
      const selected = tab.dataset.workbenchTab === name;
      tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
      if (selected && focus) tab.focus();
    }
    pages.scrollTop = 0;
  }
  for (const tab of tabs) {
    on(tab, 'click', () => selectTab(tab.dataset.workbenchTab));
    on(tab, 'keydown', event => {
      const index = tabs.indexOf(tab);
      const target = event.key === 'ArrowRight' ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
      if (target >= 0) { event.preventDefault(); selectTab(tabs[target].dataset.workbenchTab, true); }
    });
  }
  // These are DOM UI surfaces, never room-navigation targets. Existing main
  // also checks event.target against its canvas; keep that boundary intact.
  for (const surface of [toolbar, aside]) {
    for (const type of ['pointerdown', 'pointerup', 'click']) on(surface, type, event => event.stopPropagation());
  }
  function sync() {
    const actual = state();
    const actualBody = actor().profile.bodyType;
    const group = groupFor(actualBody);
    if (!group) throw Error('当前人物不在此工作台的已有样件中');
    body.replaceChildren(...bodyGroups[group].map(({ id, label }) => {
      const option = document.createElement('option'); option.value = id; option.textContent = label; return option;
    }));
    body.value = actualBody;
    for (const button of groupButtons) button.setAttribute('aria-pressed', String(button.dataset.appearanceGroup === group));
    const styles = (actual.availableStyles || ['original']).map(v => typeof v === 'string' ? v : v.id);
    const options = (actual.styleOptions || styles.map(id => ({ id, label: id === 'original' ? '原发型' : '可用发型' })))
      .filter(option => styles.includes(option.id));
    style.replaceChildren(...options.map(({ id, label }) => {
      const option = document.createElement('option'); option.value = id; option.textContent = label; return option;
    }));
    style.value = actual.hairStyle;
    hair.value = actual.hairColor;
    skin.value = actual.skinTone;
    eye.disabled = typeof actual.eyeColor !== 'string';
    lip.disabled = typeof actual.lipColor !== 'string';
    eye.value = actual.eyeColor || 'original';
    lip.value = actual.lipColor || 'original';
    colorNote.textContent = [
      eye.disabled ? '此人物瞳色暂不可用。' : '瞳色调整虹膜，保留瞳孔与高光。',
      lip.disabled ? '此人物唇色暂不可用。' : '唇色可独立选择。',
    ].join('');
    note.textContent = actual.bodyMode==='base' ? '基础人体当前无发；返回穿衣模式后恢复所选发型。' : '这里只列出此人物可用的发型，无发保留眉毛与睫毛。';
    const geometry=actor().facialGeometry?.getState();
    mouth.disabled=!geometry?.available;mouth.value=String(Math.round((geometry?.mouthWidth||0)*1000)/10);
    geometryPanel.querySelector('#mouth-width-reset').disabled=!geometry?.available;
    brow.disabled=!geometry?.browAvailable;brow.value=geometry?.browSample||'none';
    nose.disabled=!geometry?.noseAvailable;nose.value=geometry?.noseSample||'none';
    eyeGeometry.disabled=!geometry?.eyeAvailable;eyeGeometry.value=geometry?.eyeSample||'none';
    faceNote.textContent=geometry?.available?'真实嘴宽几何 ±4%；眉位、鼻尖各一个样件，眼部参数尚未接入。':'当前派生身体尚未适配此参数，原版男女可验证。';
  }
  async function apply(patch) {
    if (busy || disposed) return;
    setBusy(true);
    message('正在更新外观…');
    try {
      const result = await controller.command({ type: 'appearance', ...patch });
      if (disposed) return;
      if (result?.applied === false || result?.ok === false || result?.error || result?.reason) throw Error(result?.reason || result?.error || '此外观暂不可用');
      sync();
      message('外观已更新');
    } catch (error) {
      if (!disposed) {
        try { sync(); } catch { /* Preserve the original actionable failure. */ }
        message(`未能更新：${error.message || error}。可以重新选择后重试。`, true);
      }
    } finally {
      if (!disposed) setBusy(false);
    }
  }
  function camera() {
    const name = roomView ? 'room' : `inspect-${framing}-${direction}`;
    try {
      controller.cameraPreset(name);
      for (const button of toolbar.querySelectorAll('[data-inspect-framing]')) button.setAttribute('aria-pressed', String(!roomView && button.dataset.inspectFraming === framing));
      for (const button of toolbar.querySelectorAll('[data-inspect-direction]')) button.setAttribute('aria-pressed', String(!roomView && button.dataset.inspectDirection === direction));
      roomButton.setAttribute('aria-pressed', String(roomView));
      const next = new URL(window.location.href); next.searchParams.set('view', name);
      window.history.replaceState(window.history.state, '', next);
    } catch (error) { message(`镜头切换失败：${error.message || error}`, true); }
  }
  on(form, 'submit', event => event.preventDefault());
  async function changeMouth(value){
    if(busy||disposed)return;
    setBusy(true);message('正在更新嘴部几何…');
    try{const r=await controller.command({type:'faceGeometry',mouthWidth:value});if(!r?.applied)throw Error(r?.reason||'几何更新未完成');sync();message('嘴宽已更新，眨眼和讲话可继续检查');}
    catch(e){sync();message(String(e.message||e),true);}finally{setBusy(false);}
  }
  on(mouth,'change',()=>changeMouth(Number(mouth.value)/100));
  on(geometryPanel.querySelector('#mouth-width-reset'),'click',()=>changeMouth(0));
  on(brow,'change',async()=>{
    if(busy||disposed)return;
    setBusy(true);message('正在更新眉部几何…');
    try{const r=await controller.command({type:'faceGeometry',browSample:brow.value});if(!r?.applied)throw Error(r?.reason||'眉部更新未完成');sync();message('眉位已更新；请用正侧面和表情检查贴面效果');}
    catch(e){sync();message(String(e.message||e),true);}finally{setBusy(false);}
  });
  on(nose,'change',async()=>{
    if(busy||disposed)return;
    setBusy(true);message('正在更新鼻部几何…');
    try{const r=await controller.command({type:'faceGeometry',noseSample:nose.value});if(!r?.applied)throw Error(r?.reason||'鼻部更新未完成');sync();message('鼻尖已更新；请用侧面和表情检查形状与阴影');}
    catch(e){sync();message(String(e.message||e),true);}finally{setBusy(false);}
  });
  on(eyeGeometry,'change',async()=>{
    if(busy||disposed)return;
    setBusy(true);message('正在更新眼部几何…');
    try{const r=await controller.command({type:'faceGeometry',eyeSample:eyeGeometry.value});if(!r?.applied)throw Error(r?.reason||'眼部更新未完成');sync();message('眼裂样件已更新；请检查半闭眼、单眼和注视时的边缘与阴影');}
    catch(e){sync();message(String(e.message||e),true);}finally{setBusy(false);}
  });
  on(draftPanel.querySelector('#appearance-save'),'click',()=>{
    try{const recipe=captureAppearanceRecipe(controller);localStorage.setItem(appearanceDraftKey(actor().profile.bodyType),JSON.stringify(recipe));message('此基模草稿已保存；重新打开此基模时自动恢复');}
    catch(e){message('保存失败：'+e.message,true);}
  });
  async function restoreDraft(automatic=false){
    if(busy||disposed)return;
    let raw;
    try{raw=localStorage.getItem(appearanceDraftKey(actor().profile.bodyType));}catch(e){message('无法读取本机草稿：'+e.message,true);return;}
    if(!raw){if(!automatic)message('此基模还没有保存的草稿');return;}
    setBusy(true);message('正在恢复此基模草稿…');
    try{const result=await applyAppearanceRecipe(controller,JSON.parse(raw));if(!result.applied&&!result.cancelled)throw Error(result.reason||'恢复未完成');sync();message(result.cancelled?'较新的操作已保留，旧草稿恢复已停止':result.notice||'已恢复此基模保存的外观、几何与服装');}
    catch(e){sync();message(String(e.message||e),true);}finally{setBusy(false);}
  }
  on(draftPanel.querySelector('#appearance-restore'),'click',()=>restoreDraft());
  for(const button of document.querySelectorAll('[data-body-mode]'))on(button,'click',()=>sync());
  on(style, 'change', () => apply({ hairStyle: style.value }));
  on(hair, 'change', () => apply({ hairColor: hair.value }));
  on(skin, 'change', () => apply({ skinTone: skin.value }));
  on(eye, 'change', () => apply({ eyeColor: eye.value }));
  on(lip, 'change', () => apply({ lipColor: lip.value }));
  on(panel.querySelector('#appearance-reset'), 'click', () => {
    const actual = state();
    apply({ hairStyle: 'original', hairColor: 'original', skinTone: 'original',
      ...(typeof actual.eyeColor === 'string' ? { eyeColor: 'original' } : {}),
      ...(typeof actual.lipColor === 'string' ? { lipColor: 'original' } : {}),
    });
  });
  async function selectBody(requestedBody) {
    if (busy) return;
    let restoreSelected=false;
    const scrollTop = pages.scrollTop;
    setBusy(true);
    message('正在切换人物，当前人物会保留到加载完成…');
    try {
      const result = await controller.command({ type: 'bodySelect', bodyType: requestedBody });
      if (disposed) return;
      if (!result?.applied && !result?.cancelled) throw Error(result?.reason || '人物切换未完成');
      sync();
      if (result?.applied) {
        restoreSelected=actor().profile.bodyType===requestedBody;
        // Read the committed actor, not the requested identity or stale URL.
        // Camera/tab state is owned separately and must not be reset here.
        const next = new URL(window.location.href);
        next.searchParams.set('body', actor().profile.bodyType);
        window.history.replaceState(window.history.state, '', next);
      }
      message(result?.cancelled ? '已保留最新选择的人物' : result?.notice ? `人物已切换。${result.notice}` : '人物已切换，镜头与配色已保留');
    } catch (error) {
      if (!disposed) {
        try { sync(); } catch { /* Preserve the actionable loading error. */ }
        message(`未能切换：${error.message || error}。当前人物已保留，可以重试。`, true);
      }
    } finally {
      if (!disposed) {
        setBusy(false);
        pages.scrollTop = scrollTop;
        if(restoreSelected)await restoreDraft(true);
      }
    }
  }
  on(body, 'change', () => selectBody(body.value));
  for (const button of groupButtons) on(button, 'click', () => {
    const group = button.dataset.appearanceGroup;
    if (group !== groupFor(actor().profile.bodyType)) selectBody(group);
  });
  for (const button of toolbar.querySelectorAll('[data-inspect-framing]')) on(button, 'click', () => { roomView = false; framing = button.dataset.inspectFraming; camera(); });
  for (const button of toolbar.querySelectorAll('[data-inspect-direction]')) on(button, 'click', () => { roomView = false; direction = button.dataset.inspectDirection; camera(); });
  // main's original room handler already applies the camera; only sync UI here.
  on(roomButton, 'click', () => {
    roomView = true;
    for (const button of toolbar.querySelectorAll('[aria-pressed]')) button.setAttribute('aria-pressed', String(button === roomButton));
    const next = new URL(window.location.href); next.searchParams.set('view', 'room');
    window.history.replaceState(window.history.state, '', next);
  });
  // Reuse the existing selector and its existing event handler, never duplicate it.
  const danceSelect = document.querySelector('select[aria-label="舞蹈样件"]');
  if (danceSelect) {
    danceSelect.id ||= 'appearance-dance';
    const label = document.createElement('label'); label.htmlFor = danceSelect.id; label.textContent = '舞蹈片段';
    danceSlot.append(label, danceSelect);
    danceButton.id = 'appearance-play-dance'; danceButton.textContent = '全身观看所选舞蹈';
    on(danceButton, 'click', () => { roomView = false; framing = 'full'; direction = 'front'; camera(); });
    danceSlot.append(danceButton);
  }
  try {
    if (!actor()?.appearance?.getState) throw Error('当前人物尚未提供外观配置');
    sync(); setBusy(false); message('选择外观，即时查看');
    camera();
    void restoreDraft(true);
  } catch (error) { message(`外观暂不可用：${error.message || error}`, true); }
  return () => { disposed = true; for (const remove of listeners) remove(); };
}
