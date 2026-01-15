import type { RouteAnalysis } from "../types.js";
import { OVERLAY_CSS, HIGHLIGHT_CSS } from "./styles.js";

export function generateOverlayScript(data: RouteAnalysis): string {
  const treeJson = JSON.stringify(data.componentTree);
  const statsJson = JSON.stringify(data.stats);
  const routeJson = JSON.stringify(data.route);

  return `(function() {
  if (window.__REPO_OVERLAY__) {
    window.__REPO_OVERLAY__.toggle();
    return;
  }

  const OVERLAY_ID = '__repo_overlay_' + Math.random().toString(36).slice(2);

  let TREE = ${treeJson};
  let STATS = ${statsJson};
  let ROUTE = ${routeJson};

  let panelWidth = parseInt(localStorage.getItem('ro-panel-width') || '380', 10);
  let isOpen = false;
  let isLoading = false;
  let currentPath = window.location.pathname;
  let isPaused = false;
  let searchTerm = '';

  const renderCounts = new Map();
  let totalRenders = 0;

  const networkRequests = [];
  const componentNetworkMap = new Map();

  let selectedFiber = null;
  let selectedElement = null;

  function getDomFromFiber(fiber) {
    if (!fiber) return null;
    if (fiber.stateNode instanceof Element) return fiber.stateNode;
    let child = fiber.child;
    while (child) {
      if (child.stateNode instanceof Element) return child.stateNode;
      child = child.child;
    }
    return null;
  }

  function getFiberFromElement(el) {
    const fiber = getReactFiber(el);
    if (!fiber) return null;
    let current = fiber;
    const seen = new Set();
    while (current) {
      if (seen.has(current)) break;
      seen.add(current);
      const name = getFiberName(current);
      if (name && !/^[a-z]/.test(name) && name !== 'Fragment') {
        return current;
      }
      current = current.return;
    }
    return fiber;
  }

  const host = document.createElement('div');
  host.id = OVERLAY_ID;
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = \`${OVERLAY_CSS}\`;
  shadow.appendChild(style);

  const highlightStyle = document.createElement('style');
  highlightStyle.textContent = \`${HIGHLIGHT_CSS}\`;
  document.head.appendChild(highlightStyle);

  const container = document.createElement('div');
  container.style.cssText = '--panel-width:' + panelWidth + 'px';
  shadow.appendChild(container);

  let hoverHighlight = null;
  let selectedHighlight = null;

  function createHoverHighlight() {
    if (hoverHighlight) return hoverHighlight;
    hoverHighlight = document.createElement('div');
    hoverHighlight.className = 'overlay-highlight';
    hoverHighlight.innerHTML = '<span class="label"></span>';
    document.body.appendChild(hoverHighlight);
    return hoverHighlight;
  }

  function showHoverHighlight(el, label) {
    const hl = createHoverHighlight();
    const rect = el.getBoundingClientRect();
    hl.style.cssText = \`
      position:fixed;top:\${rect.top}px;left:\${rect.left}px;
      width:\${rect.width}px;height:\${rect.height}px;display:block;
    \`;
    hl.querySelector('.label').textContent = label;
  }

  function hideHoverHighlight() {
    if (hoverHighlight) hoverHighlight.style.display = 'none';
  }

  function createSelectedHighlight() {
    if (selectedHighlight) return selectedHighlight;
    selectedHighlight = document.createElement('div');
    selectedHighlight.className = 'overlay-highlight selected';
    selectedHighlight.innerHTML = '<span class="label"></span>';
    document.body.appendChild(selectedHighlight);
    return selectedHighlight;
  }

  function showSelectedHighlight(el, label) {
    const hl = createSelectedHighlight();
    const rect = el.getBoundingClientRect();
    hl.style.cssText = \`
      position:absolute;top:\${rect.top + window.scrollY}px;left:\${rect.left + window.scrollX}px;
      width:\${rect.width}px;height:\${rect.height}px;display:block;
    \`;
    hl.querySelector('.label').textContent = label;
  }

  function hideSelectedHighlight() {
    if (selectedHighlight) selectedHighlight.style.display = 'none';
  }

  function getReactFiber(el) {
    const keys = Object.keys(el);
    const fiberKey = keys.find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
    return fiberKey ? el[fiberKey] : null;
  }

  function getFiberName(fiber) {
    if (!fiber?.type) return null;
    const type = fiber.type;
    if (typeof type === 'string') return null;
    if (typeof type === 'function') return type.displayName || type.name || null;
    if (typeof type === 'object') {
      if (type.displayName) return type.displayName;
      if (type.render?.displayName) return type.render.displayName;
      if (type.render?.name) return type.render.name;
    }
    return null;
  }

  function isOverlayElement(el) {
    if (!el) return false;
    let current = el;
    while (current) {
      if (current === host || current.id === OVERLAY_ID) return true;
      if (current === hoverHighlight || current === selectedHighlight) return true;
      current = current.parentElement;
    }
    return false;
  }

  function isOverlayFiber(fiber) {
    if (!fiber) return false;
    let node = fiber.stateNode;
    if (node instanceof Element && isOverlayElement(node)) return true;
    return false;
  }

  let pendingRenderUpdates = new Set();
  let renderUpdateScheduled = false;

  function flushRenderUpdates() {
    renderUpdateScheduled = false;
    if (isPaused) return;

    for (const name of pendingRenderUpdates) {
      const count = renderCounts.get(name) || 0;
      shadow.querySelectorAll(\`.node[data-name="\${name}"] .render-count\`).forEach(el => {
        el.textContent = count;
        el.style.opacity = '1';
      });
    }
    pendingRenderUpdates.clear();

    const totalEl = shadow.querySelector('#total-renders');
    if (totalEl) totalEl.textContent = totalRenders;
  }

  function trackRender(name) {
    if (!name || isPaused) return;
    const count = (renderCounts.get(name) || 0) + 1;
    renderCounts.set(name, count);
    totalRenders++;

    pendingRenderUpdates.add(name);
    if (!renderUpdateScheduled) {
      renderUpdateScheduled = true;
      requestAnimationFrame(flushRenderUpdates);
    }
  }

  function findChangedFibers(fiber, seen) {
    if (!fiber || seen.has(fiber) || isPaused) return;
    seen.add(fiber);

    if (isOverlayFiber(fiber)) return;

    const flags = fiber.flags ?? fiber.effectTag ?? 0;
    const hasUpdate = (flags & 4) !== 0;
    const hasCallback = (flags & 32) !== 0;
    const didWork = hasUpdate || hasCallback || (fiber.alternate && fiber.memoizedState !== fiber.alternate.memoizedState);

    if (didWork) {
      const name = getFiberName(fiber);
      if (name) trackRender(name);
    }

    if (fiber.child) findChangedFibers(fiber.child, seen);
    if (fiber.sibling) findChangedFibers(fiber.sibling, seen);
  }

  function setupRenderTracking() {
    const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!hook) return false;

    const orig = hook.onCommitFiberRoot;
    hook.onCommitFiberRoot = function(rendererID, fiberRoot, ...args) {
      if (orig) orig.call(this, rendererID, fiberRoot, ...args);
      try {
        if (fiberRoot.current) findChangedFibers(fiberRoot.current, new Set());
      } catch {}
    };
    return true;
  }

  setupRenderTracking();

  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || 'unknown';
    const method = args[1]?.method || 'GET';
    const stack = new Error().stack || '';
    const componentName = extractComponentFromStack(stack);
    const startTime = performance.now();

    try {
      const response = await origFetch.apply(this, args);
      const duration = Math.round(performance.now() - startTime);
      recordNetworkCall({ url: url.split('?')[0], method, status: response.status, duration, component: componentName });
      return response;
    } catch (err) {
      const duration = Math.round(performance.now() - startTime);
      recordNetworkCall({ url: url.split('?')[0], method, status: 'error', duration, component: componentName });
      throw err;
    }
  };

  function extractComponentFromStack(stack) {
    for (const line of stack.split('\\n')) {
      const match = line.match(/at\\s+([A-Z][a-zA-Z0-9_]*)/);
      if (match && !['Error', 'Object', 'Function', 'Promise', 'Array'].includes(match[1])) {
        return match[1];
      }
    }
    return null;
  }

  function recordNetworkCall(entry) {
    networkRequests.unshift(entry);
    if (networkRequests.length > 100) networkRequests.pop();
    if (entry.component) {
      const list = componentNetworkMap.get(entry.component) || [];
      list.unshift(entry);
      if (list.length > 20) list.pop();
      componentNetworkMap.set(entry.component, list);
    }
  }

  function getComponentStack(el) {
    const fiber = getReactFiber(el);
    if (!fiber) return [];
    const stack = [];
    let current = fiber;
    const seen = new Set();
    while (current && stack.length < 15) {
      if (seen.has(current)) break;
      seen.add(current);
      const name = getFiberName(current);
      if (name && name.length > 1 && !name.startsWith('_') && name !== 'Fragment' && !/^[a-z]/.test(name)) {
        if (stack.length === 0 || stack[stack.length - 1] !== name) stack.push(name);
      }
      current = current.return;
    }
    return stack;
  }

  function findElementsByComponentName(name) {
    const results = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node;
    while (node = walker.nextNode()) {
      if (isOverlayElement(node)) continue;
      const fiber = getReactFiber(node);
      if (!fiber) continue;
      let current = fiber;
      const seen = new Set();
      while (current) {
        if (seen.has(current)) break;
        seen.add(current);
        if (getFiberName(current) === name) {
          results.push(node);
          break;
        }
        current = current.return;
      }
    }
    return results;
  }

  function getLiveComponentData(el, componentName) {
    const fiber = getReactFiber(el);
    if (!fiber) return { props: null, state: [], networkCalls: [] };

    let targetFiber = fiber;
    let current = fiber;
    const seen = new Set();
    while (current) {
      if (seen.has(current)) break;
      seen.add(current);
      if (getFiberName(current) === componentName) {
        targetFiber = current;
        break;
      }
      current = current.return;
    }

    const liveProps = targetFiber.memoizedProps || {};
    const stateValues = [];
    let stateNode = targetFiber.memoizedState;
    let hookIndex = 0;
    while (stateNode && hookIndex < 10) {
      if (stateNode.memoizedState !== undefined && stateNode.memoizedState !== null) {
        const val = stateNode.memoizedState;
        if (typeof val !== 'function' && typeof val?.current === 'undefined') {
          stateValues.push({ index: hookIndex, value: val });
        }
      }
      stateNode = stateNode.next;
      hookIndex++;
    }

    return { props: liveProps, state: stateValues, networkCalls: componentNetworkMap.get(componentName) || [] };
  }

  function formatValue(val, maxLen = 50) {
    if (val === null) return 'null';
    if (val === undefined) return 'undefined';
    if (typeof val === 'string') return '"' + (val.length > maxLen ? val.slice(0, maxLen) + '...' : val) + '"';
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    if (Array.isArray(val)) return '[' + val.length + ' items]';
    if (typeof val === 'object') {
      const keys = Object.keys(val);
      return keys.length === 0 ? '{}' : '{' + keys.slice(0, 3).join(', ') + (keys.length > 3 ? '...' : '') + '}';
    }
    if (typeof val === 'function') return 'fn()';
    return String(val).slice(0, maxLen);
  }

  function nodeMatchesSearch(node, term) {
    if (!term) return true;
    const lower = term.toLowerCase();
    if ((node.component?.name || '').toLowerCase().includes(lower)) return true;
    if (node.file.toLowerCase().includes(lower)) return true;
    for (const child of node.children) {
      if (nodeMatchesSearch(child, term)) return true;
    }
    return false;
  }

  function getParentName(nodeId) {
    const parts = nodeId.split('-').map(Number);
    if (parts.length < 2) return null;
    let current = TREE;
    for (let i = 0; i < parts.length - 1; i++) {
      const node = current[parts[i]];
      if (!node) return null;
      if (i === parts.length - 2) return node.component?.name || null;
      current = node.children || [];
    }
    return null;
  }

  function getSiblingIndex(nodeId) {
    const parts = nodeId.split('-').map(Number);
    if (parts.length === 0) return 0;
    
    let current = TREE;
    for (let i = 0; i < parts.length - 1; i++) {
      current = current[parts[i]]?.children || [];
    }
    
    const idx = parts[parts.length - 1];
    const node = current[idx];
    if (!node?.component?.name) return 0;
    
    const name = node.component.name;
    let sibIdx = 0;
    for (let i = 0; i < idx; i++) {
      if (current[i]?.component?.name === name) sibIdx++;
    }
    return sibIdx;
  }

  function getFiberParentName(el) {
    const fiber = getReactFiber(el);
    if (!fiber) return null;
    let current = fiber.return;
    const seen = new Set();
    while (current) {
      if (seen.has(current)) break;
      seen.add(current);
      const name = getFiberName(current);
      if (name) return name;
      current = current.return;
    }
    return null;
  }

  function getFiberSiblingIndex(el, componentName) {
    const fiber = getReactFiber(el);
    if (!fiber?.return) return 0;
    
    let child = fiber.return.child;
    let idx = 0;
    while (child) {
      if (child === fiber) return idx;
      if (getFiberName(child) === componentName) idx++;
      child = child.sibling;
    }
    return 0;
  }

  function findBestMatchingElement(node, nodeId) {
    if (!node.component) return null;
    const name = node.component.name;
    const allMatches = findElementsByComponentName(name);
    if (allMatches.length === 0) return null;
    if (allMatches.length === 1) return allMatches[0];

    const parentName = getParentName(nodeId);
    const sibIdx = getSiblingIndex(nodeId);

    for (const el of allMatches) {
      if (getFiberParentName(el) === parentName && getFiberSiblingIndex(el, name) === sibIdx) {
        return el;
      }
    }

    for (const el of allMatches) {
      if (getFiberParentName(el) === parentName) return el;
    }

    return allMatches[0];
  }

  function findAllMatchingElements(node, nodeId) {
    if (!node.component) return [];
    const name = node.component.name;
    const allMatches = findElementsByComponentName(name);
    if (allMatches.length <= 1) return allMatches;

    const parentName = getParentName(nodeId);
    const sibIdx = getSiblingIndex(nodeId);

    const withParent = allMatches.filter(el => getFiberParentName(el) === parentName);
    if (withParent.length === 0) return allMatches;

    const exactMatch = withParent.find(el => getFiberSiblingIndex(el, name) === sibIdx);
    if (exactMatch) {
      return [exactMatch, ...withParent.filter(el => el !== exactMatch)];
    }

    return withParent;
  }

  function findNodeById(nodes, id, prefix = '') {
    for (let i = 0; i < nodes.length; i++) {
      const nodeId = prefix ? prefix + '-' + i : String(i);
      if (nodeId === id) return nodes[i];
      if (nodes[i].children.length) {
        const found = findNodeById(nodes[i].children, id, nodeId);
        if (found) return found;
      }
    }
    return null;
  }

  let lastClickedNodeId = null;
  let cycleIndex = 0;
  let detailOverlay = null;
  let currentDetailNode = null;
  let currentDetailDomEl = null;
  let currentTab = 'props';

  function renderTree(nodes, depth = 0, prefix = '') {
    return nodes.map((node, i) => {
      const nodeId = prefix ? prefix + '-' + i : String(i);
      const hasChildren = node.children.length > 0;
      const comp = node.component;
      const fileName = node.file.split('/').pop() || node.file;
      const name = comp?.name || '—';
      const isClient = comp?.isClientComponent;
      const hooks = comp?.hooks?.length ? comp.hooks.slice(0, 2).join(', ') + (comp.hooks.length > 2 ? '...' : '') : '';
      const renderCount = renderCounts.get(name) || 0;
      const matches = nodeMatchesSearch(node, searchTerm);
      const childrenHtml = hasChildren ? '<div class="children">' + renderTree(node.children, depth + 1, nodeId) + '</div>' : '';

      const nextjsType = comp?.nextjsFileType;
      const nextjsBadge = nextjsType ? '<span class="badge nextjs">' + nextjsType.toUpperCase() + '</span>' : '';

      return \`
        <div class="node \${matches ? '' : 'hidden'}" data-depth="\${depth}" data-name="\${name}" data-file="\${node.file}" data-id="\${nodeId}">
          <div class="node-header">
            <span class="toggle">\${hasChildren ? '▼' : '•'}</span>
            <span class="name">\${name}</span>
            <span class="info-btn" title="View details">…</span>
            <span class="render-count" style="\${renderCount === 0 ? 'opacity:0.3' : ''}">\${renderCount}</span>
            <span class="file">\${fileName}</span>
            <span class="badge \${isClient ? 'client' : 'server'}">\${isClient ? 'C' : 'S'}</span>
            \${nextjsBadge}
            \${hooks ? '<span class="hooks">' + hooks + '</span>' : ''}
          </div>
          \${childrenHtml}
        </div>
      \`;
    }).join('');
  }

  function renderPanel() {
    container.innerHTML = \`
      <div class="panel \${isOpen ? 'open' : ''}">
        <div class="resize-handle"></div>
        <div class="header">
          <div class="header-row">
            <h2>🧩 Component Overlay</h2>
            <button class="pause-btn \${isPaused ? 'paused' : ''}">\${isPaused ? '▶ Resume' : '⏸ Pause'}</button>
          </div>
          <div class="stats">
            <div class="stat"><span class="stat-value">\${STATS.totalComponents}</span><span class="stat-label">total</span></div>
            <div class="stat"><span class="stat-value">\${STATS.clientComponents}</span><span class="stat-label">client</span></div>
            <div class="stat"><span class="stat-value">\${STATS.serverComponents}</span><span class="stat-label">server</span></div>
            <div class="stat"><span class="stat-value" id="total-renders" style="color:#f85149">\${totalRenders}</span><span class="stat-label">renders</span></div>
          </div>
          <div class="route">\${ROUTE}</div>
        </div>
        <div class="search">
          <input type="text" placeholder="Search components..." value="\${searchTerm}">
        </div>
        <div class="tree">\${renderTree(TREE)}</div>
      </div>
      <button class="toggle-btn \${isOpen ? 'open' : ''}">\${isOpen ? '✕' : '🔍'}</button>
    \`;

    container.style.setProperty('--panel-width', panelWidth + 'px');
    attachPanelEvents();
  }

  function attachPanelEvents() {
    const panel = shadow.querySelector('.panel');
    const toggleBtn = shadow.querySelector('.toggle-btn');
    const resizeHandle = shadow.querySelector('.resize-handle');
    const searchInput = shadow.querySelector('.search input');
    const pauseBtn = shadow.querySelector('.pause-btn');

    toggleBtn.addEventListener('click', e => { e.stopPropagation(); e.stopImmediatePropagation(); toggle(); }, { capture: true });

    let isResizing = false;
    resizeHandle.addEventListener('mousedown', e => {
      e.stopPropagation(); e.stopImmediatePropagation();
      isResizing = true;
      resizeHandle.classList.add('dragging');
    }, { capture: true });

    document.addEventListener('mousemove', e => {
      if (!isResizing) return;
      panelWidth = Math.max(280, Math.min(800, window.innerWidth - e.clientX));
      container.style.setProperty('--panel-width', panelWidth + 'px');
      localStorage.setItem('ro-panel-width', panelWidth.toString());
    });

    document.addEventListener('mouseup', () => {
      isResizing = false;
      if (resizeHandle) resizeHandle.classList.remove('dragging');
    });

    searchInput.addEventListener('input', e => {
      e.stopPropagation(); e.stopImmediatePropagation();
      searchTerm = e.target.value;
      const tree = shadow.querySelector('.tree');
      if (tree) tree.innerHTML = renderTree(TREE);
      attachNodeEvents();
    }, { capture: true });

    pauseBtn.addEventListener('click', e => {
      e.stopPropagation(); e.stopImmediatePropagation();
      isPaused = !isPaused;
      pauseBtn.textContent = isPaused ? '▶ Resume' : '⏸ Pause';
      pauseBtn.classList.toggle('paused', isPaused);
      if (isPaused) disableInspectMode();
      else if (isOpen) enableInspectMode();
    }, { capture: true });

    attachNodeEvents();
  }

  function attachNodeEvents() {
    shadow.querySelectorAll('.node-header').forEach(header => {
      const node = header.parentElement;

      function selectNode() {
        const name = node.dataset.name;
        const nodeId = node.dataset.id;

        shadow.querySelectorAll('.node-header.selected').forEach(el => el.classList.remove('selected'));
        header.classList.add('selected');

        const treeNode = findNodeById(TREE, nodeId);
        let domEl = null;

        if (selectedFiber && getFiberName(selectedFiber) === name) {
          domEl = selectedElement || getDomFromFiber(selectedFiber);
        }

        if (domEl && document.contains(domEl)) {
          showSelectedHighlight(domEl, name);
          domEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          hideSelectedHighlight();
        }

        selectedFiber = null;
        selectedElement = null;

        return { treeNode, domEl };
      }

      header.addEventListener('click', e => {
        e.stopPropagation(); e.stopImmediatePropagation();
        if (e.target.classList.contains('toggle')) {
          if (node.querySelector('.children')) node.classList.toggle('collapsed');
          return;
        }
        if (e.target.classList.contains('info-btn')) {
          const { treeNode, domEl } = selectNode();
          if (treeNode) showDetailDialog(treeNode, domEl);
          return;
        }
        selectNode();
      }, { capture: true });

      header.addEventListener('mouseenter', e => {
        e.stopPropagation();
        const name = node.dataset.name;
        const nodeId = node.dataset.id;
        const treeNode = findNodeById(TREE, nodeId);
        if (treeNode) {
          const domEl = findBestMatchingElement(treeNode, nodeId);
          if (domEl) showHoverHighlight(domEl, name);
        }
      }, { capture: true });

      header.addEventListener('mouseleave', e => {
        e.stopPropagation();
        hideHoverHighlight();
      }, { capture: true });

      header.addEventListener('dblclick', e => {
        e.stopPropagation(); e.stopImmediatePropagation();
        window.open('vscode://file/' + node.dataset.file);
      }, { capture: true });
    });
  }

  function showDetailDialog(node, domEl) {
    currentDetailNode = node;
    currentDetailDomEl = domEl;
    currentTab = 'props';

    if (!detailOverlay) {
      detailOverlay = document.createElement('div');
      detailOverlay.className = 'detail-overlay';
      detailOverlay.style.display = 'none';
      shadow.appendChild(detailOverlay);

      detailOverlay.addEventListener('click', e => {
        e.stopPropagation(); e.stopImmediatePropagation();
        if (e.target === detailOverlay || e.target.classList.contains('detail-close')) hideDetailDialog();
        if (e.target.classList.contains('detail-tab')) {
          const newTab = e.target.dataset.tab;
          if (newTab && newTab !== currentTab) { currentTab = newTab; renderDetailContent(); }
        }
      }, { capture: true });
    }

    renderDetailContent();
    detailOverlay.style.display = 'flex';
  }

  function hideDetailDialog() {
    if (detailOverlay) detailOverlay.style.display = 'none';
    currentDetailNode = null;
    currentDetailDomEl = null;
  }

  function renderDetailContent() {
    if (!detailOverlay || !currentDetailNode) return;

    const node = currentDetailNode;
    const domEl = currentDetailDomEl;
    const comp = node.component;
    const live = domEl && comp?.name ? getLiveComponentData(domEl, comp.name) : { props: {}, state: [], networkCalls: [] };
    const networkCalls = live.networkCalls.length > 0 ? live.networkCalls : (componentNetworkMap.get(comp?.name) || []);

    const tabs = [
      { id: 'props', label: 'Props', count: comp?.props?.length || 0 },
      { id: 'live', label: 'Live Values', count: Object.keys(live.props || {}).filter(k => !k.startsWith('__') && k !== 'children').length },
      { id: 'state', label: 'State', count: live.state?.length || 0 },
      { id: 'hooks', label: 'Hooks', count: comp?.hooks?.length || 0 },
      { id: 'network', label: 'Network', count: networkCalls.length },
    ];

    const tabsHtml = tabs.map(t => '<button class="detail-tab ' + (currentTab === t.id ? 'active' : '') + '" data-tab="' + t.id + '">' + t.label + (t.count ? ' (' + t.count + ')' : '') + '</button>').join('');

    let contentHtml = '';

    if (currentTab === 'props') {
      if (comp?.props?.length) {
        contentHtml = comp.props.map(p => '<div class="detail-row"><div class="detail-key">' + (p.optional ? '<span class="detail-optional">?</span>' : '') + p.name + '</div><div class="detail-type">' + p.type + '</div></div>').join('');
      } else contentHtml = '<div class="detail-empty">No props defined</div>';
    } else if (currentTab === 'live') {
      const liveProps = Object.entries(live.props || {}).filter(([k]) => !k.startsWith('__') && k !== 'children');
      if (liveProps.length) {
        contentHtml = liveProps.map(([k, v]) => '<div class="detail-row"><div class="detail-key">' + k + '</div><div class="detail-value">' + formatValue(v, 100) + '</div></div>').join('');
      } else contentHtml = '<div class="detail-empty">No live props available</div>';
    } else if (currentTab === 'state') {
      if (live.state?.length) {
        contentHtml = live.state.map(s => '<div class="detail-row"><div class="detail-key">useState[' + s.index + ']</div><div class="detail-value">' + formatValue(s.value, 100) + '</div></div>').join('');
      } else contentHtml = '<div class="detail-empty">No state hooks found</div>';
    } else if (currentTab === 'hooks') {
      if (comp?.hooks?.length) {
        contentHtml = '<div class="hooks-list">' + comp.hooks.map(h => '<span class="hook-tag">' + h + '</span>').join('') + '</div>';
      } else contentHtml = '<div class="detail-empty">No hooks used</div>';
    } else if (currentTab === 'network') {
      if (networkCalls.length) {
        contentHtml = networkCalls.map(n => '<div class="net-row"><div class="net-method">' + n.method + '</div><div class="net-url" title="' + n.url + '">' + n.url + '</div><div class="net-status ' + (n.status >= 400 || n.status === 'error' ? 'err' : 'ok') + '">' + n.status + '</div><div class="net-time">' + n.duration + 'ms</div></div>').join('');
      } else contentHtml = '<div class="detail-empty">No network requests tracked</div>';
    }

    const nextjsTypeBadge = comp?.nextjsFileType ? '<span class="badge nextjs">' + comp.nextjsFileType.toUpperCase() + '</span>' : '';

    detailOverlay.innerHTML = \`
      <div class="detail-dialog">
        <div class="detail-header">
          <div>
            <h3>\${comp?.name || 'Unknown'}</h3>
            <div class="file">\${node.file}</div>
            <div class="badges">
              <span class="badge \${comp?.isClientComponent ? 'client' : 'server'}">\${comp?.isClientComponent ? 'Client' : 'Server'}</span>
              \${nextjsTypeBadge}
            </div>
          </div>
          <button class="detail-close">×</button>
        </div>
        <div class="detail-tabs">\${tabsHtml}</div>
        <div class="detail-content">\${contentHtml}</div>
      </div>
    \`;
  }

  let inspectMoveHandler = null;
  let inspectClickHandler = null;

  function enableInspectMode() {
    inspectMoveHandler = e => {
      if (isOverlayElement(e.target)) return;
      const stack = getComponentStack(e.target);
      const label = stack.length > 0 ? stack.slice(0, 3).join(' → ') : e.target.tagName.toLowerCase();
      showHoverHighlight(e.target, label);
    };

    inspectClickHandler = e => {
      if (isOverlayElement(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const fiber = getFiberFromElement(e.target);
      const name = fiber ? getFiberName(fiber) : null;
      const domEl = fiber ? getDomFromFiber(fiber) : e.target;

      console.log('%c🧩 Selected:', 'color: #d2a8ff; font-weight: bold', name || 'Unknown', domEl);

      if (name) {
        selectedFiber = fiber;
        selectedElement = domEl;

        const stack = getComponentStack(e.target);
        const nodeId = selectTreeNodeByStack(stack);
        showSelectedHighlight(domEl, name);
      }
    };

    document.addEventListener('mousemove', inspectMoveHandler);
    document.addEventListener('click', inspectClickHandler, true);
  }

  function disableInspectMode() {
    if (inspectMoveHandler) document.removeEventListener('mousemove', inspectMoveHandler);
    if (inspectClickHandler) document.removeEventListener('click', inspectClickHandler, true);
    hideHoverHighlight();
    hideSelectedHighlight();
  }

  function selectTreeNodeByStack(stack) {
    const result = findNodeByAncestry(TREE, stack, '', []);
    if (result && selectTreeNodeById(result.nodeId)) return result.nodeId;

    for (const name of stack) {
      const fallback = findFirstNodeWithName(TREE, name);
      if (fallback && selectTreeNodeById(fallback.nodeId)) return fallback.nodeId;
    }
    return null;
  }

  function findNodeByAncestry(nodes, stack, prefix, currentPath) {
    if (stack.length === 0) return null;
    const targetName = stack[0];
    const parentNames = stack.slice(1);

    let bestMatch = null;
    let bestScore = -1;

    for (let i = 0; i < nodes.length; i++) {
      const nodeId = prefix ? prefix + '-' + i : String(i);
      const nodeName = nodes[i].component?.name;
      const newPath = nodeName ? [...currentPath, nodeName] : currentPath;

      if (nodeName === targetName) {
        let score = 0;
        const pathRev = [...currentPath].reverse();
        for (let j = 0; j < Math.min(parentNames.length, pathRev.length); j++) {
          if (parentNames[j] === pathRev[j]) score += 10 - j;
        }
        if (score > bestScore || (score === bestScore && !bestMatch)) {
          bestScore = score;
          bestMatch = { node: nodes[i], nodeId };
        }
      }

      if (nodes[i].children.length) {
        const childResult = findNodeByAncestry(nodes[i].children, stack, nodeId, newPath);
        if (childResult && childResult.score > bestScore) {
          bestScore = childResult.score;
          bestMatch = childResult;
        }
      }
    }

    if (bestMatch) bestMatch.score = bestScore;
    return bestMatch;
  }

  function findFirstNodeWithName(nodes, name, prefix = '') {
    for (let i = 0; i < nodes.length; i++) {
      const nodeId = prefix ? prefix + '-' + i : String(i);
      if (nodes[i].component?.name === name) return { node: nodes[i], nodeId };
      if (nodes[i].children.length) {
        const found = findFirstNodeWithName(nodes[i].children, name, nodeId);
        if (found) return found;
      }
    }
    return null;
  }

  function selectTreeNodeById(nodeId) {
    const nodeEl = shadow.querySelector('.node[data-id="' + nodeId + '"]');
    if (!nodeEl) return false;

    let parent = nodeEl.parentElement;
    while (parent && parent !== shadow) {
      if (parent.classList.contains('node') && parent.classList.contains('collapsed')) {
        parent.classList.remove('collapsed');
      }
      parent = parent.parentElement;
    }

    shadow.querySelectorAll('.node-header.selected').forEach(el => el.classList.remove('selected'));
    const header = nodeEl.querySelector(':scope > .node-header');
    if (header) {
      header.classList.add('selected');
      setTimeout(() => header.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }
    return true;
  }

  async function reloadData() {
    const newPath = window.location.pathname;
    if (isLoading) return;

    isLoading = true;
    currentPath = newPath;

    const tree = shadow.querySelector('.tree');
    if (tree) tree.innerHTML = '<div class="loading"><div class="loading-spinner"></div><div class="loading-text">Analyzing route...</div></div>';

    try {
      const res = await fetch('/__overlay_data.json?route=' + encodeURIComponent(newPath));
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      TREE = data.componentTree;
      STATS = data.stats;
      ROUTE = data.route;
      isLoading = false;
      renderPanel();
    } catch (err) {
      isLoading = false;
      if (tree) tree.innerHTML = '<div class="loading"><div class="loading-text" style="color:#f85149;">Error: ' + err.message + '</div></div>';
    }
  }

  function checkRouteChange() {
    if (window.location.pathname !== currentPath && !isLoading) reloadData();
  }

  function toggle() {
    isOpen = !isOpen;
    const panel = shadow.querySelector('.panel');
    const btn = shadow.querySelector('.toggle-btn');
    if (panel) panel.classList.toggle('open', isOpen);
    if (btn) { btn.classList.toggle('open', isOpen); btn.textContent = isOpen ? '✕' : '🔍'; }
    document.body.style.marginRight = isOpen ? panelWidth + 'px' : '';

    if (isOpen && !isPaused) enableInspectMode();
    else disableInspectMode();
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && detailOverlay?.style.display === 'flex') {
      e.preventDefault(); e.stopPropagation();
      hideDetailDialog();
      return;
    }
    if (e.ctrlKey && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      toggle();
    }
    if (e.ctrlKey && e.shiftKey && e.key === 'P') {
      e.preventDefault();
      isPaused = !isPaused;
      const btn = shadow.querySelector('.pause-btn');
      if (btn) { btn.textContent = isPaused ? '▶ Resume' : '⏸ Pause'; btn.classList.toggle('paused', isPaused); }
      if (isPaused) disableInspectMode();
      else if (isOpen) enableInspectMode();
    }
  });

  window.addEventListener('popstate', checkRouteChange);
  setInterval(checkRouteChange, 500);

  document.body.appendChild(host);
  renderPanel();
  toggle();

  window.__REPO_OVERLAY__ = {
    toggle,
    show: () => { if (!isOpen) toggle(); },
    hide: () => { if (isOpen) toggle(); },
    setWidth: w => { panelWidth = w; shadow.querySelector(':host').style.setProperty('--panel-width', w + 'px'); localStorage.setItem('ro-panel-width', w.toString()); },
    reload: reloadData
  };
})();`;
}

export function generateBookmarklet(data: RouteAnalysis): string {
  return `javascript:${encodeURIComponent(generateOverlayScript(data))}`;
}
