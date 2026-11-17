import {captureAppearanceRecipe,applyAppearanceRecipe,appearanceDraftKey,exportAppearanceRecipe,readAppearanceRecipeFile} from './appearance-recipe.js';
import {queryAppearanceCandidates} from './appearance-candidates.js';
import {HAIRSTYLES} from './hairstyle-catalog.js';
import {FOUNDATION_PROFILES} from './foundation-profiles.js';
import {REPRESENTATIVE_PRESETS} from './representative-batch.js';
import {appearanceColorPresets} from './appearance-color-policy.js';
import {HAIR_COLORS,SKIN_TONES} from './character-appearance.js';
import {EYE_COLORS,LIP_COLORS} from './facial-palette.js';
import earManifest from '../public/assets/m2-paired-ear-accessory-v1/manifest.json' with {type:'json'};
import hatFit from '../public/assets/m2-hat-hair-v1/fit.json' with {type:'json'};
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
      { id: 'female', label: '原始脸型与身形' },
      { id: 'm1a-jaw-v1', label: '下颌变化' },
      { id: 'm1a-waisthip-v1', label: '腰胯变化' },
      { id: 'native-female-843ac-v1', label: '原生可编辑候选 · 接入验证' },
    ],
    male: [
      { id: 'male', label: '原始脸型与身形' },
      { id: 'm2-male-jaw-v1', label: '下颌变化' },
      { id: 'm2-male-lower-leg-v1', label: '小腿比例样件' },
      { id: 'native-male-7586-v1', label: '原生可编辑候选 · 接入验证' },
    ],
  };
  const diagnosticPresets = new Map(REPRESENTATIVE_PRESETS.map(preset => [preset.id, preset]));
  for(const preset of REPRESENTATIVE_PRESETS)bodyGroups[preset.sex].push({id:preset.id,label:preset.previewLabel,diagnostic:true});
  const groupFor = bodyType => Object.keys(bodyGroups).find(group => bodyGroups[group].some(item => item.id === bodyType));
  const style = panel.querySelector('#appearance-hair-style');
  const hair = panel.querySelector('#appearance-hair-color');
  const skin = panel.querySelector('#appearance-skin-tone');
  const eye = panel.querySelector('#appearance-eye-color');
  const lip = panel.querySelector('#appearance-lip-color');
  const colorFields=[[hair,'hairColor',HAIR_COLORS],[skin,'skinTone',SKIN_TONES],[eye,'eyeColor',EYE_COLORS],[lip,'lipColor',LIP_COLORS]];
  const colorLabels={original:'原色',black:'黑色',brown:'棕色',blonde:'金色',warm:'暖色',deep:'深色',blue:'蓝色',green:'绿色',violet:'紫色',rose:'玫瑰色',coral:'珊瑚色',mauve:'豆沙色'};
  const colorNote = panel.querySelector('#appearance-face-color-note');
  const note = panel.querySelector('#appearance-style-note');
  const geometryPanel=document.createElement('details');
  geometryPanel.id='appearance-geometry';
  geometryPanel.innerHTML='<summary>五官局部调整</summary><p class="appearance-hint" id="face-geometry-note">读取当前基模可用的几何样件…</p><label for="mouth-width">嘴宽变化（%）</label><div class="appearance-pair"><input id="mouth-width" type="number" min="-4" max="4" step="0.1" value="0"><button type="button" id="mouth-width-reset">只恢复嘴宽</button></div><label for="brow-sample">眉部位置对照</label><select id="brow-sample"><option value="none">原位</option><option value="height1-spacing1-v1">上移 1 mm · 两侧各外移 1 mm</option></select><p class="appearance-hint">眉位按已制作的组合样件选择，正侧面均可比较。</p>';
  geometryPanel.insertAdjacentHTML('beforeend','<label for="nose-sample">鼻尖位置对照</label><select id="nose-sample"><option value="none">原位</option><option value="tip-forward05-v1">鼻尖向前 0.5 mm</option></select><p class="appearance-hint">鼻尖使用已制作端点，切到侧面可比较轮廓。</p>');
  const shapePanel=document.createElement('section');shapePanel.id='appearance-shape-samples';
  const shapeLabel=identityFields.querySelector('label[for="appearance-body"]'),shapeNote=identityFields.querySelector('#appearance-body-note');
  shapeLabel.textContent='基础人物与有限改形样件';
  shapeNote.textContent='选择已制作的脸型或身形对照；当前样件分别验证，不能叠加为任意组合。';
  shapePanel.append(shapeLabel,body,shapeNote);
  fields.prepend(shapePanel,geometryPanel);
  const diagnosticsLink=document.createElement('button');diagnosticsLink.type='button';diagnosticsLink.id='appearance-open-diagnostics';
  diagnosticsLink.textContent='查看未通过的批次对照';shapePanel.append(diagnosticsLink);
  geometryPanel.insertAdjacentHTML('beforeend','<label for="eye-sample">眼裂宽度对照</label><select id="eye-sample"><option value="none">原位</option><option value="aperture-width101-v1">眼裂宽 +1%</option></select><p class="appearance-hint">眼裂宽度使用已制作端点，需结合眨眼和视线检查。</p>');
  const eyeGeometry=geometryPanel.querySelector('#eye-sample');
  const nose=geometryPanel.querySelector('#nose-sample');
  const mouth=geometryPanel.querySelector('#mouth-width'),faceNote=geometryPanel.querySelector('#face-geometry-note'),brow=geometryPanel.querySelector('#brow-sample');
  const mouthSample=document.createElement('select');mouthSample.id='mouth-width-sample';mouthSample.setAttribute('aria-label','嘴宽离散样件');mouthSample.innerHTML='<option value="0">原位</option><option value="0.04">嘴宽 +4%</option>';mouthSample.hidden=true;mouth.parentElement.prepend(mouthSample);
  const samplesPanel=document.createElement('details');samplesPanel.id='appearance-validation-samples';samplesPanel.open=true;
  samplesPanel.innerHTML=`<summary>验证样件</summary>
    <p class="appearance-hint">技术候选。长发坐下时发梢仍可能明显上甩，可在“检查”查看原速证据。</p>
    <div class="appearance-pair">
      <div><label for="appearance-surface-freckles">雀斑</label><select id="appearance-surface-freckles" aria-describedby="appearance-surface-note appearance-samples-status"></select></div>
      <div><label for="appearance-surface-blush">腮红</label><select id="appearance-surface-blush" aria-describedby="appearance-surface-note appearance-samples-status"></select></div>
    </div><p id="appearance-surface-note" class="appearance-hint"></p>
    <div class="appearance-pair">
      <div><label for="appearance-ears">耳饰</label><select id="appearance-ears" aria-describedby="appearance-ears-note appearance-samples-status"><option value="none">不装备</option><option value="left">仅左耳</option><option value="right">仅右耳</option><option value="pair">左右成对</option></select></div>
      <div><label for="appearance-hat">帽子</label><select id="appearance-hat" aria-describedby="appearance-hat-note appearance-samples-status"><option value="none">不装备</option><option value="single">帽子样件</option></select></div>
    </div><p id="appearance-ears-note" class="appearance-hint"></p><p id="appearance-hat-note" class="appearance-hint"></p>
    <p class="appearance-hint">新配方与草稿一并保存耳饰、帽子和适配版本；旧版配方保留原语义。</p>
    <p id="appearance-samples-status" class="appearance-hint" role="status" aria-live="polite"></p>`;
  fields.append(samplesPanel);
  const freckles=samplesPanel.querySelector('#appearance-surface-freckles'),blush=samplesPanel.querySelector('#appearance-surface-blush');
  const ears=samplesPanel.querySelector('#appearance-ears'),hat=samplesPanel.querySelector('#appearance-hat');
  const surfaceNote=samplesPanel.querySelector('#appearance-surface-note'),earsNote=samplesPanel.querySelector('#appearance-ears-note'),hatNote=samplesPanel.querySelector('#appearance-hat-note');
  const samplesStatus=samplesPanel.querySelector('#appearance-samples-status');
  const draftPanel=document.createElement('div');draftPanel.className='appearance-pair';
  draftPanel.innerHTML='<button type="button" id="appearance-save">保存此基模草稿</button><button type="button" id="appearance-restore">恢复已保存草稿</button>';
  fields.append(draftPanel);
  const filePanel=document.createElement('div');filePanel.className='appearance-pair';
  filePanel.innerHTML='<button type="button" id="appearance-download">下载配方</button><button type="button" id="appearance-read">读取配方</button><input type="file" accept=".json,application/json" hidden aria-label="读取外观配方 JSON">';
  fields.append(filePanel);
  const fileNote=document.createElement('p');fileNote.className='appearance-hint';fileNote.textContent='文件仅含此外观、几何与服装的参数及资源版本，不含账户、动作、镜头或资源本体；读取前请选择对应基模。';fields.append(fileNote);
  const recipeFile=filePanel.querySelector('input');

  const listeners = [];
  let disposed = false, busy = false;
  let sampleOperation=0,pendingSampleActor=null,sampleActor=null,candidateActor=null,candidateQuery=null;
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
    diagnosticSelect.disabled=value;diagnosticReturn.disabled=value;
    for(const button of document.querySelectorAll('[data-outfit]'))button.disabled=value;
    syncSamples();
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
  const diagnosticWarning=document.createElement('section');diagnosticWarning.id='workbench-diagnostic-warning';diagnosticWarning.hidden=true;
  diagnosticWarning.innerHTML='<strong>未通过的诊断样件</strong><p id="workbench-diagnostic-reason"></p><button type="button" id="workbench-diagnostic-return">返回基础人物</button>';
  preview.insertBefore(diagnosticWarning,viewport);
  const diagnosticReturn=diagnosticWarning.querySelector('button');
  const roomButton = viewport.querySelector('[data-camera="room"]');
  roomButton.textContent = '房间移动';
  roomButton.title = '切到房间全景，点击地面选择移动目的地';
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
  const hasMovement=()=>!!(controller.target||controller.pending?.type==='walk'||
    controller.sequence.slice(Math.max(0,controller.sequenceIndex)).some(step=>step.type==='walk'));
  on(idleButton,'click',()=>message(controller.paused
    ? '停止请求已提交；当前暂停，点击“继续”完成动作过渡。'
    : '停止请求已提交，人物正在恢复站立。'));
  const actionsTitle = move('#actions-title', actionsPage);
  actionsTitle.textContent = '基础移动';
  const movementEntry = document.createElement('button');
  movementEntry.id = 'workbench-room-move'; movementEntry.type = 'button';
  movementEntry.textContent = '在房间中选择移动目的地';
  on(movementEntry,'click',()=>roomButton.click()); actionsPage.append(movementEntry);
  const movementNote = document.createElement('p'); movementNote.className='appearance-hint';
  movementNote.textContent='先选速度，再点击房间地面或下方路线开始移动。暂停时点击“继续”播放。';
  actionsPage.append(movementNote);
  actionsPage.append(actionButtons);
  move('.control', actionsPage);
  move('.routes', actionsPage);
  for(const button of aside.querySelectorAll('[data-speed]')) {
    if(Number(button.dataset.speed)>=1.85)button.textContent='跑步速度';
    on(button,'click',()=>message(hasMovement()?'已调整移动速度。':'速度已选择；请点“房间移动”选择目的地，或启动下方路线。'));
  }
  const movementFeedback=event=>message(event.text,event.error);
  controller.game.events.on('movement-feedback',movementFeedback);
  listeners.push(()=>controller.game.events.off('movement-feedback',movementFeedback));
  const pauseFeedback=paused=>{
    const hasDestination=hasMovement();
    message(paused
      ? hasDestination?'已暂停，目的地保留；点击“继续”恢复移动。':'已暂停；点击“继续”恢复播放。'
      : hasDestination?'已继续，正在前往所选目的地。':'已继续播放。');
  };
  controller.game.events.on('pause-state-changed',pauseFeedback);
  listeners.push(()=>controller.game.events.off('pause-state-changed',pauseFeedback));
  move('.playback', actionsPage); // Retains the original reset button.
  const resetPosition=document.querySelector('#reset');resetPosition.textContent='重置位置与动作';
  // main bound onclick before this workbench is mounted; preserve its reset.
  on(resetPosition,'click',()=>{if(disposed)return;camera();message('位置与动作已重置，速度回到默认；所选镜头已保留');});
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
  move('details:not(#appearance-geometry):not(#appearance-validation-samples)', inspectionPage);
  const previewInfo=document.createElement('section');previewInfo.id='workbench-preview-info';
  previewInfo.innerHTML='<h3>当前预览</h3><p id="workbench-preview-build" class="appearance-hint"></p><p class="appearance-hint">本批次尚未通过：脸部轮廓、人体比例和衣物适配仍有缺陷；尖锥下颌已明确不可用。这里保留初版、修订版与头部试验供复现，不作为成品造型推荐，也不代表八预设完成。</p><p><a id="workbench-hair-evidence" target="_blank" rel="noopener noreferrer">长发前后对照</a> · <a id="workbench-hat-evidence" target="_blank" rel="noopener noreferrer">帽发与动作证据</a> · <a id="workbench-accessory-record-evidence" target="_blank" rel="noopener noreferrer">整套造型保存与恢复</a> · <a id="workbench-batch-evidence" target="_blank" rel="noopener noreferrer">8预设初版对照（374，含未通过项）</a> · <a id="workbench-axial-evidence" target="_blank" rel="noopener noreferrer">头部近景与动作对照</a></p>';
  for(const [id,path] of [['workbench-hair-evidence','/evidence/m2-long-hair-review-e9b-v1/before-after.html'],['workbench-hat-evidence','/evidence/m2-hat-hair-review-6e0-v1/'],['workbench-accessory-record-evidence','/evidence/m2-accessory-record-review-v1/'],['workbench-batch-evidence','/evidence/m2-representative-review-374-v1/'],['workbench-axial-evidence','/evidence/m2-axial-head-room-v1/']]){
    const evidence=new URL(window.location.href);evidence.port='4174';evidence.pathname=path;evidence.search='';evidence.hash='';
    previewInfo.querySelector('#'+id).href=evidence.href;
  }
  inspectionPage.prepend(previewInfo);
  const nativePreview=document.createElement('p');
  const nativeLink=document.createElement('a');
  nativeLink.href='/native-production.html';nativeLink.target='_blank';nativeLink.rel='noopener noreferrer';
  nativeLink.textContent='原生制作：独立服装、面部近景与正常速度对照';
  nativePreview.append(nativeLink);previewInfo.append(nativePreview);
  const diagnosticPanel=document.createElement('details');diagnosticPanel.id='workbench-failed-presets';
  diagnosticPanel.innerHTML='<summary>未通过的批次与失败对照</summary><p class="appearance-hint">这些样件用于定位改形与服装适配缺陷，不能作为可用角色或已完成预设。保留原数据供复现；移到这里不代表模型已修好。</p><label for="workbench-diagnostic-body">选择失败／未通过样件</label><select id="workbench-diagnostic-body"><option value="">请选择诊断样件</option></select>';
  const diagnosticSelect=diagnosticPanel.querySelector('select');
  for(const sex of ['female','male']){
    const group=document.createElement('optgroup');group.label=sex==='female'?'女性批次 · 未通过':'男性批次 · 未通过';
    for(const preset of REPRESENTATIVE_PRESETS.filter(p=>p.sex===sex)){
      const option=document.createElement('option');option.value=preset.id;option.textContent=preset.previewLabel;group.append(option);
    }
    diagnosticSelect.append(group);
  }
  inspectionPage.insertBefore(diagnosticPanel,previewInfo);
  on(diagnosticsLink,'click',()=>{selectTab('inspection');diagnosticPanel.open=true;diagnosticSelect.focus();});
  on(diagnosticSelect,'change',()=>{if(diagnosticSelect.value)selectBody(diagnosticSelect.value);});
  on(diagnosticReturn,'click',()=>selectBody(groupFor(actor().profile.bodyType)));
  function syncPreviewBuild(){
    const info=window.__debug?.buildInfo;
    previewInfo.querySelector('#workbench-preview-build').textContent=info?.shortId
      ?`${info.development?'开发预览':'固定预览'} · 构建 ${info.shortId}`:'正在读取当前预览构建身份…';
  }
  syncPreviewBuild();
  navigation.hidden = false; pages.hidden = false;
  const tabs = [...navigation.querySelectorAll('[data-workbench-tab]')];
  function selectTab(name, focus = false) {
    if(name==='inspection')syncPreviewBuild();
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
  function sampleMessage(text,error=false){
    samplesStatus.textContent=text;samplesStatus.dataset.error=String(error);
    samplesStatus.setAttribute('role',error?'alert':'status');
  }
  function syncSamples(actual=state(),geometry=actor().facialGeometry?.getState()){
    const current=actor();
    if(sampleActor!==current){sampleActor=current;sampleMessage('');}
    if(candidateActor!==current){
      candidateActor=current;
      try{candidateQuery=queryAppearanceCandidates(controller);}catch(error){candidateQuery={surface:{supported:false,reason:'当前人物的样件信息未读取完成'}};}
    }
    const surface=candidateQuery?.surface,earState=current.rigidAccessories?.getState(),hatState=current.headwear?.getState();
    const loading=busy||actual.loading||actual.facialPaletteLoading||geometry?.loading||earState?.status==='loading'||hatState?.status==='loading';
    for(const [select,id] of [[freckles,'freckles'],[blush,'blush']]){
      const choice=surface?.choices?.find(layer=>layer.id===id),selected=actual.surfaceLayers?.find(layer=>layer.id===id);
      const options=[{value:'none',label:'不启用'}];
      if(choice){
        const [min,max]=choice.opacity.range;
        const values=[.5,choice.opacity.default,max,...(selected?[selected.opacity]:[])];
        for(const value of [...new Set(values)].filter(v=>Number.isFinite(v)&&v>=min&&v<=max).sort((a,b)=>a-b))options.push({value:String(value),label:`${Math.round(value*100)}%`});
      }
      select.replaceChildren(...options.map(({value,label})=>{const option=document.createElement('option');option.value=value;option.textContent=label;return option;}));
      select.value=selected?String(selected.opacity):'none';select.disabled=loading||!surface?.supported||!choice;
    }
    surfaceNote.textContent=surface?.supported?'雀斑与腮红可独立选择或叠加。':surface?.reason||'此基模尚未适配雀斑与腮红。';
    const earSupported=earManifest.fits.filter(fit=>fit.baseAvatarSha256===current.profile.sha256).length===1;
    ears.value=earState?.selection??'none';ears.disabled=loading||!earState||(!earSupported&&ears.value==='none');
    earsNote.textContent=earSupported?'耳饰可分别装备左右两侧。':'此基模尚无耳饰适配。';
    const dependency=hatFit.hairDependency,bodySupported=current.profile.sha256===hatFit.targetBodySha256;
    const hairMatches=actual.hairStyle===dependency.styleId&&actual.replacementSHA256===dependency.sha256&&
      actual.hairFit?.sha256===dependency.fitSha256&&actual.hairFit?.version===dependency.fitVersion;
    const neutral=geometry?.mouthWidth===0&&['browSample','noseSample','eyeSample'].every(key=>geometry?.[key]==='none');
    hat.value=hatState?.selection??'none';hat.disabled=loading||!hatState;
    hat.querySelector('option[value="single"]').disabled=!bodySupported||!hairMatches||!neutral;
    hatNote.textContent=!bodySupported?'帽子样件仅适配女性原版。':!hairMatches
      ?'请先在上方“发型”选择长束发样件，再装备帽子。':!neutral
      ?'请先手动恢复嘴宽、眉、鼻、眼到原位，再装备帽子。':hatState?.bodyMode==='base'&&hatState.selection==='single'
      ?'基础模式中帽子暂隐藏，返回穿衣模式后恢复。':'当前帽子与长束发配对，保留完整头发。';
    syncPreviewBuild();
  }
  async function applySample(command,success){
    if(busy||disposed)return;
    const owner=actor(),ticket=++sampleOperation;pendingSampleActor=owner;
    setBusy(true);sampleMessage('正在更新验证样件…');
    try{
      const result=await controller.command(command);
      if(disposed||ticket!==sampleOperation||actor()!==owner)return;
      if(result?.cancelled){sync();sampleMessage('已保留较新的选择。');return;}
      if(!result?.applied)throw Error(result?.reason||result?.error||'样件更新未完成');
      sync();sampleMessage(success);
    }catch(error){
      if(disposed||ticket!==sampleOperation||actor()!==owner)return;
      sync();
      const text=String(error.message||error);
      sampleMessage(/[\u3400-\u9fff]/.test(text)?text:'资源加载或适配核对未完成，请重试。',true);
    }finally{
      if(!disposed&&ticket===sampleOperation&&actor()===owner){pendingSampleActor=null;setBusy(false);}
    }
  }
  function sync() {
    const actual = state();
    const actualBody = actor().profile.bodyType;
    const group = groupFor(actualBody);
    if (!group) {
      body.replaceChildren();
      for (const button of groupButtons) button.setAttribute('aria-pressed', 'false');
      throw Error('当前人物不在此工作台的已有样件中');
    }
    body.replaceChildren(...bodyGroups[group].filter(item=>!item.diagnostic||item.id===actualBody).map(({ id, label, diagnostic }) => {
      const option = document.createElement('option'); option.value = id; option.textContent = diagnostic?'诊断中 · '+label:label; return option;
    }));
    body.value = actualBody;
    const diagnostic=diagnosticPresets.get(actualBody);
    diagnosticSelect.value=diagnostic?actualBody:'';
    diagnosticWarning.hidden=!diagnostic;
    if(diagnostic){
      diagnosticWarning.querySelector('strong').textContent='未通过的诊断样件 · '+diagnostic.label;
      diagnosticWarning.querySelector('p').textContent=actualBody==='male-long-lean-axial-head-v1'
        ?'下半脸呈不合理尖锥，混合口型也有已知缺陷。数值改形完成不等于造型合格；此样件不作成品推荐。'
        :'本批次的人物比例、脸部轮廓或衣服适配仍有缺陷，尚未达到可用预设标准。仅保留失败复现与前后对照。';
    }
    for (const button of groupButtons) button.setAttribute('aria-pressed', String(button.dataset.appearanceGroup === group));
    const styles = (actual.availableStyles || ['original']).map(v => typeof v === 'string' ? v : v.id);
    const options = (actual.styleOptions || styles.map(id => ({ id, label: id === 'original' ? '原发型' : '可用发型' })))
      .filter(option => styles.includes(option.id));
    // Keep real family samples discoverable, but never grant compatibility in UI.
    const unavailable=[...new Map(HAIRSTYLES.filter(entry=>entry.compatibleBodies.includes(FOUNDATION_PROFILES[group].sha256)&&!styles.includes(entry.id)).map(entry=>[entry.id,entry])).values()];
    style.replaceChildren(...options.map(({ id, label }) => {
      const option = document.createElement('option'); option.value = id; option.textContent = label; return option;
    }),...unavailable.map(({id,label})=>{
      const option=document.createElement('option');option.value=id;option.textContent=label+' · 当前样件待适配';option.disabled=true;return option;
    }));
    style.value = actual.hairStyle;
    const previewSupport=actor().config?.previewAppearanceSupport;
    for(const [select,field,presets] of colorFields){
      const choices=appearanceColorPresets(actor().profile.sha256,field,presets);
      select.replaceChildren(...Object.keys(choices).map(value=>{
        const option=document.createElement('option');option.value=value;option.textContent=colorLabels[value]||value;return option;
      }));
      select.value=actual[field]||'original';
      select.disabled=previewSupport?.[field]===false||Object.keys(choices).length<2||typeof actual[field]!=='string';
    }
    colorNote.textContent = [
      eye.disabled ? '此人物瞳色暂不可用。' : previewSupport ? '原生虹膜配色样件；眼白与独立高光保留。' : '瞳色调整虹膜，保留瞳孔与高光。',
      lip.disabled ? '此人物唇色暂不可用。' : '唇色可独立选择。',
    ].join('');
    note.textContent = actual.bodyMode==='base' ? (actual.effectiveHairStyle==='none'?'基础人体当前无发；返回穿衣模式后恢复所选发型。':'此候选的基础模式保留当前发型与皮肤材质，用于检查卸衣后的真实身体。') : previewSupport ? (options.some(option=>!['original','none'].includes(option.id))?'原生发型为技术候选，可切回原发型对照；配色仅开放此人物已接入的选项。':'原生接入候选：目前检查原外观与独立换装。发型替换及配色尚待此基模验证。') : unavailable.length ? '标注“待适配”的发型已有素材，但尚未验证当前脸型或身体；可用项可直接选择。' : '当前列出的发型可用于此样件；无发保留眉毛与睫毛。';
    const geometry=actor().facialGeometry?.getState();
    mouth.disabled=!geometry?.available;mouth.value=String(Math.round((geometry?.mouthWidth||0)*1000)/10);
    const discrete=Array.isArray(geometry?.mouthSupportedValues);
    const extended=!!geometry?.mouthEndpointValues?.length;
    const useSamples=discrete||extended;
    mouth.hidden=useSamples;mouthSample.hidden=!useSamples;mouthSample.disabled=!geometry?.available;
    if(useSamples){
      const values=discrete?[...geometry.mouthSupportedValues]:[-.04,0,.04,...geometry.mouthEndpointValues];
      if(!values.includes(geometry.mouthWidth))values.push(geometry.mouthWidth);
      mouthSample.replaceChildren(...[...new Set(values)].sort((a,b)=>a-b).map(value=>{
        const option=document.createElement('option');option.value=String(value);
        option.textContent=value===0?'原位':`嘴宽 ${value>0?'+':''}${Math.round(value*1000)/10}%`;
        return option;
      }));
    }
    mouthSample.value=String(geometry?.mouthWidth||0);
    geometryPanel.querySelector('label[for="mouth-width"],label[for="mouth-width-sample"]').htmlFor=useSamples?'mouth-width-sample':'mouth-width';
    geometryPanel.querySelector('#mouth-width-reset').disabled=!geometry?.available;
    const labels={
      none:'原位','height1-spacing1-v1':'上移 1 mm · 两侧各外移 1 mm',
      'height3-spacing3-v2':'上移 3 mm · 两侧各外移 3 mm',
      'tip-forward05-v1':'鼻尖向前 0.5 mm','tip-forward2-v2':'鼻尖向前 2 mm',
      'aperture-width101-v1':'眼裂宽 +1%','aperture-width105-v2':'眼裂宽 +5%',
    };
    for(const [select,key] of [[brow,'brow'],[nose,'nose'],[eyeGeometry,'eye']]){
      const ids=geometry?.[key+'Samples']||[...select.options].map(o=>o.value);
      select.replaceChildren(...ids.map(id=>{const option=document.createElement('option');option.value=id;option.textContent=labels[id]||id;return option;}));
      select.disabled=!geometry?.[key+'Available'];select.value=geometry?.[key+'Sample']||'none';
    }
    faceNote.textContent=!geometry?.available?'此基模尚无面部几何配方。':extended
      ?'大幅对照：嘴宽 ±12%、眉位 3 mm、鼻尖 2 mm、眼裂宽 +5%。旧小幅样件保留；新幅度是离散样件，不代表任意组合已验收。'
      :discrete?'此下颌样件嘴宽仅原位 / +4%；眉、鼻、眼几何尚未适配。':'真实嘴宽几何 ±4%；眉、鼻、眼按已制作样件选择。';
    syncSamples(actual,geometry);
  }
  const appearanceChanged = event => {
    if (disposed || event?.actor !== actor()) return;
    if(pendingSampleActor&&pendingSampleActor!==actor()){sampleOperation++;pendingSampleActor=null;setBusy(false);}
    try { sync(); }
    catch (error) { message(`人物已更新，工作台同步未完成：${error.message || error}`, true); }
  };
  controller.game.events.on('appearance-state-changed', appearanceChanged);
  listeners.push(() => controller.game.events.off('appearance-state-changed', appearanceChanged));
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
  function reflectCamera(name) {
      if(name!=='room'&&!name.startsWith('inspect-'))return;
      roomView=name==='room';
      if(!roomView)[,framing,direction]=name.split('-');
      for (const button of toolbar.querySelectorAll('[data-inspect-framing]')) button.setAttribute('aria-pressed', String(!roomView && button.dataset.inspectFraming === framing));
      for (const button of toolbar.querySelectorAll('[data-inspect-direction]')) button.setAttribute('aria-pressed', String(!roomView && button.dataset.inspectDirection === direction));
      roomButton.setAttribute('aria-pressed', String(roomView));
      const hint=viewport.querySelector('.scene-bottom > span:last-child');
      if(hint)hint.textContent=roomView?'点击地面移动 · 拖动观察 · 滚轮缩放':'外观审查镜头 · 点击“房间移动”选择目的地';
      const next = new URL(window.location.href); next.searchParams.set('view', name);
      window.history.replaceState(window.history.state, '', next);
  }
  controller.game.events.on('camera-changed',reflectCamera);
  listeners.push(()=>controller.game.events.off('camera-changed',reflectCamera));
  function camera() {
    const name = roomView ? 'room' : `inspect-${framing}-${direction}`;
    try {
      controller.cameraPreset(name);
      reflectCamera(name);
    } catch (error) { message(`镜头切换失败：${error.message || error}`, true); }
  }
  for(const [select,id] of [[freckles,'freckles'],[blush,'blush']])on(select,'change',()=>{
    if(select.disabled)return;
    const layers=(state().surfaceLayers??[]).filter(layer=>layer.id!==id);
    if(select.value!=='none')layers.push({id,opacity:Number(select.value)});
    void applySample({type:'appearance',surfaceLayers:layers},'皮肤表面样件已更新。');
  });
  on(ears,'change',()=>{if(!ears.disabled)void applySample({type:'accessory',kind:'ears',value:ears.value},'耳饰已更新。');});
  on(hat,'change',()=>{if(!hat.disabled)void applySample({type:'accessory',kind:'hat',value:hat.value},'帽子已更新。');});
  on(form, 'submit', event => event.preventDefault());
  async function changeMouth(value){
    if(busy||disposed)return;
    setBusy(true);message('正在更新嘴部几何…');
    try{const r=await controller.command({type:'faceGeometry',mouthWidth:value});if(!r?.applied)throw Error(r?.reason||'几何更新未完成');sync();message('嘴宽已更新，眨眼和讲话可继续检查');}
    catch(e){sync();message(String(e.message||e),true);}finally{setBusy(false);}
  }
  on(mouth,'change',()=>changeMouth(Number(mouth.value)/100));
  on(mouthSample,'change',()=>changeMouth(Number(mouthSample.value)));
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
  on(filePanel.querySelector('#appearance-download'),'click',()=>{
    if(busy||disposed)return;
    let objectURL;
    try{
      const text=exportAppearanceRecipe(controller);
      objectURL=URL.createObjectURL(new Blob([text],{type:'application/json'}));
      const link=document.createElement('a');link.href=objectURL;
      link.download=`appearance-${actor().profile.bodyType}.json`;
      document.body.append(link);try{link.click();}finally{link.remove();}
      message('配方已下载；读取时请选择同一基模，文件不包含资源本体');
    }catch(e){message('下载失败：'+e.message,true);}
    finally{if(objectURL)setTimeout(()=>URL.revokeObjectURL(objectURL),1000);}
  });
  on(filePanel.querySelector('#appearance-read'),'click',()=>{if(!busy&&!disposed)recipeFile.click();});
  on(recipeFile,'change',async()=>{
    const file=recipeFile.files?.[0];recipeFile.value='';
    if(!file||busy||disposed)return;
    setBusy(true);message('正在读取配方并核对资源版本…');
    try{
      const result=await readAppearanceRecipeFile(controller,file,{isCancelled:()=>disposed});
      if(disposed)return;
      if(!result.applied&&!result.cancelled)throw Error(result.reason||'读取未完成');
      sync();message(result.cancelled?'较新的操作已保留，文件读取已停止':result.notice||'已从文件恢复配方中的外观、几何、服装和附件；未写入本机草稿');
    }catch(e){if(!disposed){sync();message(String(e.message||e),true);}}
    finally{if(!disposed)setBusy(false);}
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
    reflectCamera('room');
    message(controller.paused?'请选择地面目的地；当前暂停，点击“继续”后移动。':'请点击房间内的地面空位，人物会走向该处。');
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
  return () => { disposed = true; sampleOperation++;pendingSampleActor=null; for (const remove of listeners) remove(); };
}
