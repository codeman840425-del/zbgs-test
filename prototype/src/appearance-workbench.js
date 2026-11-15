// DOM binding only: appearance ownership and camera framing stay in the controller.
export function bindAppearanceWorkbench({ avatar, controller }) {
  const url = new URL(window.location.href);
  const panel = document.querySelector('#appearance-workbench');
  if (!panel || url.searchParams.get('workbench') !== 'appearance') return () => {};
  document.body.classList.add('appearance-workbench');
  document.querySelector('h1').textContent = '角色外观与动作工作台';
  panel.hidden = false;
  const form = panel.querySelector('#appearance-form');
  const fields = panel.querySelector('#appearance-fields');
  const status = panel.querySelector('#appearance-status');
  const body = panel.querySelector('#appearance-body');
  const style = panel.querySelector('#appearance-hair-style');
  const hair = panel.querySelector('#appearance-hair-color');
  const skin = panel.querySelector('#appearance-skin-tone');
  const note = panel.querySelector('#appearance-style-note');
  const listeners = [];
  let disposed = false, busy = false;
  let [framing, direction] = (url.searchParams.get('view') || 'inspect-face-front').replace(/^inspect-/, '').split('-');
  if (!['face', 'half', 'full'].includes(framing)) framing = 'face';
  if (!['front', 'side', 'back'].includes(direction)) direction = 'front';
  const on = (node, event, fn) => { node.addEventListener(event, fn); listeners.push(() => node.removeEventListener(event, fn)); };
  const message = (text, error = false) => { status.textContent = text; status.dataset.error = String(error); };
  const state = () => avatar.appearance.getState();
  function sync() {
    const actual = state();
    const styles = (actual.availableStyles || ['original']).map(v => typeof v === 'string' ? v : v.id);
    const originalFemale = (url.searchParams.get('body') || 'female') === 'female';
    for (const option of style.options) option.disabled = !styles.includes(option.value) || (option.value === 'female-bob-v1' && !originalFemale);
    style.value = actual.hairStyle;
    hair.value = actual.hairColor;
    skin.value = actual.skinTone;
    note.textContent = originalFemale && styles.includes('female-bob-v1') ? '可切换原发型与齐颈短发。' : '此人物暂时保留原发型，可调整发色与肤色。';
  }
  async function apply(patch) {
    if (busy || disposed) return;
    busy = true;
    fields.disabled = true;
    form.setAttribute('aria-busy', 'true');
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
      if (!disposed) { busy = false; fields.disabled = false; form.setAttribute('aria-busy', 'false'); }
    }
  }
  function camera() {
    const name = `inspect-${framing}-${direction}`;
    try {
      controller.cameraPreset(name);
      for (const button of panel.querySelectorAll('[data-inspect-framing]')) button.setAttribute('aria-pressed', String(button.dataset.inspectFraming === framing));
      for (const button of panel.querySelectorAll('[data-inspect-direction]')) button.setAttribute('aria-pressed', String(button.dataset.inspectDirection === direction));
      const next = new URL(window.location.href); next.searchParams.set('view', name);
      window.history.replaceState(window.history.state, '', next);
    } catch (error) { message(`镜头切换失败：${error.message || error}`, true); }
  }
  on(form, 'submit', event => event.preventDefault());
  on(style, 'change', () => apply({ hairStyle: style.value }));
  on(hair, 'change', () => apply({ hairColor: hair.value }));
  on(skin, 'change', () => apply({ skinTone: skin.value }));
  on(panel.querySelector('#appearance-reset'), 'click', () => apply({ hairStyle: 'original', hairColor: 'original', skinTone: 'original' }));
  body.value = url.searchParams.get('body') || 'female';
  on(body, 'change', () => {
    if (busy) return;
    const next = new URL(window.location.href);
    next.searchParams.set('body', body.value); next.searchParams.set('workbench', 'appearance');
    next.searchParams.set('view', `inspect-${framing}-${direction}`);
    fields.disabled = true; message('正在切换人物…'); window.location.assign(next.href);
  });
  for (const button of panel.querySelectorAll('[data-inspect-framing]')) on(button, 'click', () => { framing = button.dataset.inspectFraming; camera(); });
  for (const button of panel.querySelectorAll('[data-inspect-direction]')) on(button, 'click', () => { direction = button.dataset.inspectDirection; camera(); });
  // Reuse the existing selector and its existing event handler, never duplicate it.
  const danceSelect = document.querySelector('select[aria-label="舞蹈样件"]');
  if (danceSelect) {
    danceSelect.id ||= 'appearance-dance';
    const label = document.createElement('label'); label.htmlFor = danceSelect.id; label.textContent = '舞蹈片段';
    panel.querySelector('#appearance-dance-slot').append(label, danceSelect);
    const play = document.createElement('button'); play.type = 'button'; play.id = 'appearance-play-dance'; play.textContent = '全身观看所选舞蹈';
    on(play, 'click', () => { framing = 'full'; direction = 'front'; camera();
      const result = controller.command({type:'action',name:'dance'});
      if (result?.task?.state === 'failed' || result?.admission === 'rejected') message(result?.task?.reason || result?.reason || '当前状态无法起舞', true);
    });
    const stop = document.createElement('button'); stop.type = 'button'; stop.textContent = '结束舞蹈 / 站立';
    on(stop, 'click', () => controller.command({type:'action',name:'idle'}));
    const row = document.createElement('div'); row.className = 'appearance-pair'; row.append(play, stop);
    panel.querySelector('#appearance-dance-slot').append(row);
  }
  try {
    if (!avatar.appearance?.getState) throw Error('当前人物尚未提供外观配置');
    sync(); fields.disabled = false; message('选择外观，即时查看');
    camera();
  } catch (error) { message(`外观暂不可用：${error.message || error}`, true); }
  return () => { disposed = true; for (const remove of listeners) remove(); };
}
