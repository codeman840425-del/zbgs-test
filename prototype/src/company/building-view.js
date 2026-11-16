import './building-view.css';

function describeFloors(document) {
  if (!Array.isArray(document?.nodes)) throw new TypeError('Building view requires a company document');
  const nodes = new Map(document.nodes.map(node => [node.id, node]));
  const floors = document.nodes.filter(node => node.kind === 'floor').map((floor, index) => ({
    id: floor.id, name: typeof floor.name === 'string' && floor.name.trim() ? floor.name : `${index + 1}层`,
    level: index + 1, rooms: 0, stations: 0,
  }));
  const byId = new Map(floors.map(floor => [floor.id, floor]));
  for (const node of document.nodes) {
    if (!['room', 'workstation'].includes(node.kind)) continue;
    const visited = new Set();
    let parent = nodes.get(node.parentId);
    while (parent && parent.kind !== 'floor' && !visited.has(parent.id)) {
      visited.add(parent.id);
      parent = nodes.get(parent.parentId);
    }
    const floor = byId.get(parent?.id);
    if (floor) floor[node.kind === 'room' ? 'rooms' : 'stations']++;
  }
  return floors;
}

/** Presentation only. The host loads the selected floor's real 3D scene. */
export function createBuildingView(container, { onSelectFloor, onPresentationChange } = {}) {
  if (!container?.append || !container.ownerDocument) throw new TypeError('Building view requires a DOM container');
  const dom = container.ownerDocument;
  const browser = dom.defaultView;
  function element(tag, className, text) {
    const node = dom.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(className, text) {
    const node = element('button', className, text);
    node.type = 'button';
    return node;
  }
  const root = element('section', 'company-building-view');
  root.setAttribute('aria-label', '大楼总览');
  const heading = element('header', 'company-building-view__heading');
  const title = element('h2', 'company-building-view__title');
  const description = element('p', 'company-building-view__description');
  heading.append(title, description);
  const canvas = element('div', 'company-building-view__canvas');
  const exterior = element('div', 'company-building-view__panel company-building-view__exterior');
  const facadeButton = button('company-building-view__facade');
  const roof = element('span', 'company-building-view__roof');
  roof.setAttribute('aria-hidden', 'true');
  const facadeRows = element('span', 'company-building-view__facade-rows');
  facadeRows.setAttribute('aria-hidden', 'true');
  const plinth = element('span', 'company-building-view__plinth');
  plinth.setAttribute('aria-hidden', 'true');
  facadeButton.append(roof, facadeRows, plinth);
  const enter = element('span', 'company-building-view__enter', '进入大楼');
  facadeButton.append(enter);
  exterior.append(facadeButton);
  const section = element('div', 'company-building-view__panel company-building-view__section');
  const sectionRoof = element('div', 'company-building-view__section-roof');
  sectionRoof.setAttribute('aria-hidden', 'true');
  const floorList = element('div', 'company-building-view__floors');
  floorList.setAttribute('aria-label', '楼层');
  const sectionBase = element('div', 'company-building-view__section-base');
  sectionBase.setAttribute('aria-hidden', 'true');
  section.append(sectionRoof, floorList, sectionBase);
  canvas.append(exterior, section);
  const footer = element('footer', 'company-building-view__footer');
  const back = button('company-building-view__back', '返回大楼外观');
  footer.append(back);
  root.append(heading, canvas, footer);
  root.dataset.presentation = 'exterior';
  section.hidden = true;
  section.inert = true;
  section.setAttribute('aria-hidden', 'true');
  back.hidden = true;
  back.inert = true;
  container.append(root);

  let presentation = 'exterior';
  let disposed = false;
  let animationTimer;
  let floors = [];
  const floorButtons = new Map();
  function layer(node, visible, inert = !visible) {
    node.hidden = !visible;
    node.inert = inert;
    node.setAttribute('aria-hidden', String(inert));
  }
  function stopAnimation() {
    clearTimeout(animationTimer);
    root.classList.remove('is-entering');
  }
  function present(next, animate, moveFocus) {
    if (!['exterior', 'section'].includes(next)) throw new TypeError('Unknown building presentation');
    const previous = presentation;
    const changed = next !== previous;
    stopAnimation();
    presentation = next;
    root.dataset.presentation = next;
    const reduced = browser?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const entering = changed && previous === 'exterior' && next === 'section' && animate && !reduced;
    layer(exterior, next === 'exterior' || entering, next !== 'exterior');
    layer(section, next === 'section');
    back.hidden = next !== 'section';
    back.inert = next !== 'section';
    description.textContent = next === 'section' ? '选择楼层进入俯视' : `共 ${floors.length} 层，进入查看楼层`;
    if (entering) {
      root.classList.add('is-entering');
      animationTimer = setTimeout(() => {
        if (disposed) return;
        root.classList.remove('is-entering');
        layer(exterior, false);
      }, 620);
    }
    if (moveFocus) {
      const target = next === 'section' ? floorButtons.values().next().value ?? back : facadeButton;
      target.focus({ preventScroll: true });
    }
    if (changed) onPresentationChange?.(next);
  }
  facadeButton.onclick = () => present('section', true, true);
  back.onclick = () => present('exterior', false, true);

  return {
    render(document, options = {}) {
      if (disposed) throw new Error('Building view has been disposed');
      const next = options.presentation ?? presentation;
      if (!['exterior', 'section'].includes(next)) throw new TypeError('Unknown building presentation');
      const hadFocus = root.contains(dom.activeElement);
      const focusedFloorId = dom.activeElement?.dataset?.floorId;
      floors = describeFloors(document);
      title.textContent = typeof document.name === 'string' && document.name.trim() ? document.name : '公司大楼';
      facadeButton.setAttribute('aria-label', `${title.textContent}，共${floors.length}层，进入楼层剖面`);
      facadeButton.disabled = !floors.length;
      facadeRows.replaceChildren();
      floorList.replaceChildren();
      floorButtons.clear();
      for (const floor of [...floors].reverse()) {
        const row = element('span', 'company-building-view__window-row');
        if (floor.level === 1) {
          row.classList.add('company-building-view__window-row--ground');
          row.append(element('span', 'company-building-view__window'),
            element('span', 'company-building-view__door'), element('span', 'company-building-view__window'));
        } else {
          for (let index = 0; index < 4; index++) row.append(element('span', 'company-building-view__window'));
        }
        facadeRows.append(row);
        const floorButton = button('company-building-view__floor');
        floorButton.dataset.floorId = floor.id;
        const level = element('span', 'company-building-view__level', `${floor.level}F`);
        const info = element('span', 'company-building-view__floor-info');
        info.append(element('span', 'company-building-view__floor-name', floor.name),
          element('span', 'company-building-view__floor-counts', `${floor.rooms} 间经营房 · ${floor.stations} 个工位`));
        const arrow = element('span', 'company-building-view__arrow', '›');
        arrow.setAttribute('aria-hidden', 'true');
        floorButton.append(level, info, arrow);
        floorButton.onclick = () => onSelectFloor?.(floor.id);
        floorButtons.set(floor.id, floorButton);
        floorList.append(floorButton);
      }
      if (!floors.length) floorList.append(element('p', 'company-building-view__empty', '暂无楼层'));
      present(next, options.animate === true, false);
      if (hadFocus) {
        const target = next === 'section' ? floorButtons.get(focusedFloorId) ?? floorButtons.values().next().value ?? back : facadeButton;
        target.focus({ preventScroll: true });
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopAnimation();
      facadeButton.onclick = null;
      back.onclick = null;
      for (const node of floorButtons.values()) node.onclick = null;
      floorButtons.clear();
      floors = [];
      root.remove();
    },
  };
}
