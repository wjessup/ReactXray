import { RouteComponentAnalysis } from "./visualize.js";

export function generateOverlayScript(data: RouteComponentAnalysis): string {
  const treeJson = JSON.stringify(data.componentTree);
  const statsJson = JSON.stringify(data.stats);
  const routeJson = JSON.stringify(data.route);

  return `(function() {
  if (window.__REPO_OVERLAY__) {
    window.__REPO_OVERLAY__.toggle();
    return;
  }

  let TREE = ${treeJson};
  let STATS = ${statsJson};
  let ROUTE = ${routeJson};

  let panelWidth = parseInt(localStorage.getItem('ro-panel-width') || '380', 10);
  let isOpen = false;
  let isLoading = false;
  let currentPath = window.location.pathname;

  const styles = document.createElement('style');
  styles.textContent = \`
    body.ro-panel-open {
      margin-right: var(--ro-panel-width, 380px) !important;
      transition: margin-right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    #repo-overlay-panel {
      position: fixed;
      top: 0;
      right: 0;
      width: var(--ro-panel-width, 380px);
      height: 100vh;
      background: #0d1117;
      color: #c9d1d9;
      font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', Menlo, monospace;
      font-size: 12px;
      z-index: 99999;
      transform: translateX(100%);
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-left: 1px solid #30363d;
    }
    #repo-overlay-panel.open { transform: translateX(0); }
    #repo-overlay-toggle {
      position: fixed;
      top: 50%;
      right: 0;
      transform: translateY(-50%);
      width: 28px;
      height: 56px;
      background: #238636;
      color: white;
      border: none;
      border-radius: 6px 0 0 6px;
      cursor: pointer;
      z-index: 99998;
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    #repo-overlay-toggle:hover { background: #2ea043; width: 32px; }
    #repo-overlay-toggle.open { right: var(--ro-panel-width, 380px); }
    .ro-resize-handle {
      position: absolute;
      left: 0;
      top: 0;
      width: 6px;
      height: 100%;
      cursor: ew-resize;
      background: transparent;
      z-index: 100001;
    }
    .ro-resize-handle:hover, .ro-resize-handle.dragging {
      background: #58a6ff;
    }
    .ro-header {
      padding: 12px 16px;
      background: #161b22;
      border-bottom: 1px solid #30363d;
      flex-shrink: 0;
    }
    .ro-header h2 { color: #58a6ff; font-size: 13px; margin: 0 0 4px 0; display: flex; align-items: center; gap: 6px; }
    .ro-header .route { color: #7ee787; font-size: 11px; }
    .ro-stats {
      display: flex;
      gap: 12px;
      margin-top: 8px;
    }
    .ro-stat { display: flex; gap: 4px; font-size: 11px; }
    .ro-stat-value { color: #58a6ff; font-weight: bold; }
    .ro-stat-label { color: #8b949e; }
    .ro-search {
      padding: 8px 12px;
      background: #161b22;
      border-bottom: 1px solid #30363d;
      flex-shrink: 0;
    }
    .ro-search input {
      width: 100%;
      background: #0d1117;
      border: 1px solid #30363d;
      color: #c9d1d9;
      padding: 6px 10px;
      border-radius: 4px;
      font-family: inherit;
      font-size: 11px;
    }
    .ro-search input:focus { outline: none; border-color: #58a6ff; }
    .ro-tree {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }
    .ro-tree::-webkit-scrollbar { width: 6px; }
    .ro-tree::-webkit-scrollbar-track { background: #161b22; }
    .ro-tree::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
    .ro-node {
      margin: 1px 0;
      border-left: 2px solid #30363d;
      margin-left: 6px;
    }
    .ro-node[data-depth="0"] { border-left: none; margin-left: 0; }
    .ro-node-header {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 3px 6px;
      cursor: pointer;
      border-radius: 3px;
      transition: all 0.1s;
    }
    .ro-node-header:hover { background: #21262d; }
    .ro-node-header.selected { background: #388bfd44; outline: 2px solid #58a6ff; }
    .ro-toggle { color: #484f58; font-size: 9px; width: 9px; flex-shrink: 0; }
    .ro-collapsed > .ro-children { display: none; }
    .ro-collapsed .ro-toggle { transform: rotate(-90deg); }
    .ro-name { color: #d2a8ff; font-weight: 600; font-size: 11px; }
    .ro-file { color: #8b949e; font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100px; }
    .ro-badge {
      font-size: 8px;
      padding: 1px 3px;
      border-radius: 2px;
      text-transform: uppercase;
      font-weight: 600;
      flex-shrink: 0;
    }
    .ro-badge.client { background: #388bfd33; color: #58a6ff; }
    .ro-badge.server { background: #238636; color: #7ee787; }
    .ro-hooks { color: #ffa657; font-size: 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ro-children { padding-left: 10px; }
    .ro-tooltip {
      position: fixed;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 8px 10px;
      z-index: 100000;
      max-width: 220px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      pointer-events: none;
    }
    .ro-tooltip h4 { color: #d2a8ff; margin: 0 0 4px 0; font-size: 11px; }
    .ro-tooltip .file { color: #7ee787; font-size: 9px; word-break: break-all; }
    .ro-tooltip .tip { color: #8b949e; font-size: 9px; margin-top: 6px; font-style: italic; }
    .ro-detail-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.6);
      z-index: 100001;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(2px);
    }
    .ro-detail-dialog {
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 12px;
      width: 500px;
      max-width: 90vw;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 16px 48px rgba(0,0,0,0.5);
    }
    .ro-detail-header {
      padding: 16px 20px;
      border-bottom: 1px solid #30363d;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .ro-detail-header h3 { color: #d2a8ff; margin: 0; font-size: 16px; font-weight: 600; }
    .ro-detail-header .file { color: #7ee787; font-size: 11px; margin-top: 4px; word-break: break-all; }
    .ro-detail-header .badges { display: flex; gap: 6px; margin-top: 8px; }
    .ro-detail-close {
      background: none;
      border: none;
      color: #8b949e;
      font-size: 20px;
      cursor: pointer;
      padding: 0;
      line-height: 1;
    }
    .ro-detail-close:hover { color: #c9d1d9; }
    .ro-detail-tabs {
      display: flex;
      border-bottom: 1px solid #30363d;
      padding: 0 20px;
      gap: 4px;
    }
    .ro-detail-tab {
      background: none;
      border: none;
      color: #8b949e;
      padding: 10px 12px;
      cursor: pointer;
      font-size: 12px;
      font-family: inherit;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
    }
    .ro-detail-tab:hover { color: #c9d1d9; }
    .ro-detail-tab.active { color: #58a6ff; border-bottom-color: #58a6ff; }
    .ro-detail-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
    }
    .ro-detail-section { margin-bottom: 16px; }
    .ro-detail-section:last-child { margin-bottom: 0; }
    .ro-detail-section h4 { color: #8b949e; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px 0; }
    .ro-detail-row { 
      display: flex; 
      padding: 6px 0; 
      border-bottom: 1px solid #21262d;
      font-size: 12px;
    }
    .ro-detail-row:last-child { border-bottom: none; }
    .ro-detail-key { color: #79c0ff; min-width: 120px; flex-shrink: 0; }
    .ro-detail-type { color: #7ee787; flex: 1; font-family: 'SF Mono', monospace; font-size: 11px; }
    .ro-detail-value { color: #ffa657; flex: 1; font-family: 'SF Mono', monospace; font-size: 11px; word-break: break-all; }
    .ro-detail-optional { color: #8b949e; margin-right: 4px; }
    .ro-detail-empty { color: #484f58; font-style: italic; font-size: 12px; }
    .ro-net-row { display: flex; gap: 8px; padding: 8px 0; border-bottom: 1px solid #21262d; font-size: 11px; }
    .ro-net-row:last-child { border-bottom: none; }
    .ro-net-method { color: #d2a8ff; font-weight: 600; min-width: 40px; }
    .ro-net-url { color: #79c0ff; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ro-net-status { min-width: 30px; }
    .ro-net-status.ok { color: #7ee787; }
    .ro-net-status.err { color: #f85149; }
    .ro-net-time { color: #8b949e; min-width: 50px; text-align: right; }
    .ro-hooks-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .ro-hook-tag { background: #21262d; color: #ffa657; padding: 4px 8px; border-radius: 4px; font-size: 11px; }
    .ro-dom-highlight {
      position: fixed;
      pointer-events: none;
      z-index: 99997;
      border: 2px dashed #f0883e;
      background: rgba(240, 136, 62, 0.1);
      transition: all 0.1s;
    }
    .ro-dom-highlight.ro-selected {
      border: 3px solid #58a6ff;
      background: rgba(88, 166, 255, 0.15);
      box-shadow: 0 0 20px rgba(88, 166, 255, 0.3);
    }
    .ro-dom-highlight.ro-selected .ro-dom-label { background: #58a6ff; }
    .ro-dom-label {
      position: absolute;
      top: -22px;
      left: 0;
      background: #f0883e;
      color: white;
      padding: 2px 6px;
      font-size: 10px;
      font-weight: 600;
      border-radius: 3px;
      white-space: nowrap;
    }
    .ro-hidden { display: none !important; }
    .ro-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
      color: #8b949e;
    }
    .ro-loading-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid #30363d;
      border-top-color: #58a6ff;
      border-radius: 50%;
      animation: ro-spin 1s linear infinite;
    }
    @keyframes ro-spin {
      to { transform: rotate(360deg); }
    }
    .ro-loading-text {
      margin-top: 12px;
      font-size: 12px;
    }
    .ro-pause-btn {
      background: #21262d;
      border: 1px solid #30363d;
      color: #c9d1d9;
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      font-family: inherit;
      margin-left: auto;
    }
    .ro-pause-btn:hover { background: #30363d; }
    .ro-pause-btn.paused { background: #f0883e; color: #0d1117; border-color: #f0883e; }
    .ro-header-row { display: flex; align-items: center; gap: 8px; }
  \`;
  document.head.appendChild(styles);

  const panel = document.createElement('div');
  panel.id = 'repo-overlay-panel';

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'ro-resize-handle';
  panel.appendChild(resizeHandle);

  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'repo-overlay-toggle';
  toggleBtn.innerHTML = '🔍';
  toggleBtn.title = 'Toggle Component Overlay (Ctrl+Shift+C)';

  let searchTerm = '';
  let highlightEl = null;
  let tooltip = null;
  let selectedHighlight = null;
  
  const networkRequests = [];
  const componentNetworkMap = new Map();
  
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || 'unknown';
    const method = args[1]?.method || 'GET';
    const stack = new Error().stack || '';
    const componentName = extractComponentFromStack(stack);
    const startTime = performance.now();
    
    try {
      const response = await originalFetch.apply(this, args);
      const duration = Math.round(performance.now() - startTime);
      const entry = { url: url.split('?')[0], method, status: response.status, duration, component: componentName, time: Date.now() };
      networkRequests.unshift(entry);
      if (networkRequests.length > 100) networkRequests.pop();
      if (componentName) {
        const list = componentNetworkMap.get(componentName) || [];
        list.unshift(entry);
        if (list.length > 20) list.pop();
        componentNetworkMap.set(componentName, list);
      }
      return response;
    } catch (err) {
      const duration = Math.round(performance.now() - startTime);
      const entry = { url: url.split('?')[0], method, status: 'error', duration, component: componentName, time: Date.now() };
      networkRequests.unshift(entry);
      if (componentName) {
        const list = componentNetworkMap.get(componentName) || [];
        list.unshift(entry);
        componentNetworkMap.set(componentName, list);
      }
      throw err;
    }
  };
  
  function extractComponentFromStack(stack) {
    const lines = stack.split('\\n');
    for (const line of lines) {
      const match = line.match(/at\\s+([A-Z][a-zA-Z0-9_]*)/);
      if (match && !['Error', 'Object', 'Function', 'Promise', 'Array'].includes(match[1])) {
        return match[1];
      }
    }
    return null;
  }
  let lastClickedNodeId = null;
  let cycleIndex = 0;
  let isPaused = false;

  function updatePanelWidth(width) {
    panelWidth = Math.max(280, Math.min(800, width));
    document.documentElement.style.setProperty('--ro-panel-width', panelWidth + 'px');
    localStorage.setItem('ro-panel-width', panelWidth.toString());
  }

  updatePanelWidth(panelWidth);

  let isResizing = false;
  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizeHandle.classList.add('dragging');
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const newWidth = window.innerWidth - e.clientX;
    updatePanelWidth(newWidth);
  });

  document.addEventListener('mouseup', () => {
    isResizing = false;
    resizeHandle.classList.remove('dragging');
  });

  function createHighlight() {
    if (highlightEl) return highlightEl;
    highlightEl = document.createElement('div');
    highlightEl.className = 'ro-dom-highlight';
    highlightEl.innerHTML = '<span class="ro-dom-label"></span>';
    document.body.appendChild(highlightEl);
    return highlightEl;
  }

  function showHighlight(el, label) {
    const hl = createHighlight();
    const rect = el.getBoundingClientRect();
    hl.style.top = rect.top + 'px';
    hl.style.left = rect.left + 'px';
    hl.style.width = rect.width + 'px';
    hl.style.height = rect.height + 'px';
    hl.style.display = 'block';
    hl.querySelector('.ro-dom-label').textContent = label;
  }

  function hideHighlight() {
    if (highlightEl) highlightEl.style.display = 'none';
  }

  function createTooltip() {
    if (tooltip) return tooltip;
    tooltip = document.createElement('div');
    tooltip.className = 'ro-tooltip';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);
    return tooltip;
  }

  function showTooltip(e, node, domEl = null) {
    const t = createTooltip();
    const comp = node.component;
    t.innerHTML = \`
      <h4>\${comp?.name || '—'}</h4>
      <div class="file">\${node.file}</div>
      <div class="tip">Click for details</div>
    \`;
    t.style.display = 'block';
    const x = Math.min(e.clientX + 10, window.innerWidth - panelWidth - 240);
    const y = Math.min(e.clientY + 10, window.innerHeight - 80);
    t.style.left = x + 'px';
    t.style.top = y + 'px';
  }
  
  let detailOverlay = null;
  let currentDetailNode = null;
  let currentDetailDomEl = null;
  let currentTab = 'props';
  
  function handleDetailClick(e) {
    const target = e.target;
    
    if (target === detailOverlay) {
      hideDetailDialog();
      return;
    }
    
    if (target.classList && target.classList.contains('ro-detail-close')) {
      hideDetailDialog();
      return;
    }
    
    if (target.classList && target.classList.contains('ro-detail-tab')) {
      const newTab = target.getAttribute('data-tab');
      if (newTab && newTab !== currentTab) {
        currentTab = newTab;
        renderDetailDialog();
      }
      return;
    }
    
    const tabParent = target.closest && target.closest('.ro-detail-tab');
    if (tabParent) {
      const newTab = tabParent.getAttribute('data-tab');
      if (newTab && newTab !== currentTab) {
        currentTab = newTab;
        renderDetailDialog();
      }
    }
  }
  
  function showDetailDialog(node, domEl) {
    currentDetailNode = node;
    currentDetailDomEl = domEl;
    currentTab = 'props';
    
    if (!detailOverlay) {
      detailOverlay = document.createElement('div');
      detailOverlay.className = 'ro-detail-overlay';
      detailOverlay.addEventListener('click', handleDetailClick);
      document.body.appendChild(detailOverlay);
    }
    
    renderDetailDialog();
    detailOverlay.style.display = 'flex';
  }
  
  function hideDetailDialog() {
    if (detailOverlay) detailOverlay.style.display = 'none';
    currentDetailNode = null;
    currentDetailDomEl = null;
  }
  
  function renderDetailDialog() {
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
    
    const tabsHtml = tabs.map(t => 
      \`<button class="ro-detail-tab \${currentTab === t.id ? 'active' : ''}" data-tab="\${t.id}">\${t.label}\${t.count ? ' (' + t.count + ')' : ''}</button>\`
    ).join('');
    
    let contentHtml = '';
    
    if (currentTab === 'props') {
      if (comp?.props?.length) {
        contentHtml = comp.props.map(p => \`
          <div class="ro-detail-row">
            <div class="ro-detail-key">\${p.optional ? '<span class="ro-detail-optional">?</span>' : ''}\${p.name}</div>
            <div class="ro-detail-type">\${p.type}</div>
          </div>
        \`).join('');
      } else {
        contentHtml = '<div class="ro-detail-empty">No props defined</div>';
      }
    } else if (currentTab === 'live') {
      const liveProps = Object.entries(live.props || {}).filter(([k]) => !k.startsWith('__') && k !== 'children');
      if (liveProps.length) {
        contentHtml = liveProps.map(([k, v]) => \`
          <div class="ro-detail-row">
            <div class="ro-detail-key">\${k}</div>
            <div class="ro-detail-value">\${formatValue(v, 100)}</div>
          </div>
        \`).join('');
      } else {
        contentHtml = '<div class="ro-detail-empty">No live props available (component may not be mounted)</div>';
      }
    } else if (currentTab === 'state') {
      if (live.state?.length) {
        contentHtml = live.state.map(s => \`
          <div class="ro-detail-row">
            <div class="ro-detail-key">useState[\${s.index}]</div>
            <div class="ro-detail-value">\${formatValue(s.value, 100)}</div>
          </div>
        \`).join('');
      } else {
        contentHtml = '<div class="ro-detail-empty">No state hooks found</div>';
      }
    } else if (currentTab === 'hooks') {
      if (comp?.hooks?.length) {
        contentHtml = '<div class="ro-hooks-list">' + comp.hooks.map(h => \`<span class="ro-hook-tag">\${h}</span>\`).join('') + '</div>';
        if (comp.serverQueries?.length) {
          contentHtml += '<div class="ro-detail-section" style="margin-top:16px"><h4>Server Queries</h4>';
          contentHtml += comp.serverQueries.map(q => \`<div class="ro-detail-row"><div class="ro-detail-key">\${q}</div></div>\`).join('');
          contentHtml += '</div>';
        }
      } else {
        contentHtml = '<div class="ro-detail-empty">No hooks used</div>';
      }
    } else if (currentTab === 'network') {
      if (networkCalls.length) {
        contentHtml = networkCalls.map(n => \`
          <div class="ro-net-row">
            <div class="ro-net-method">\${n.method}</div>
            <div class="ro-net-url" title="\${n.url}">\${n.url}</div>
            <div class="ro-net-status \${n.status >= 400 || n.status === 'error' ? 'err' : 'ok'}">\${n.status}</div>
            <div class="ro-net-time">\${n.duration}ms</div>
          </div>
        \`).join('');
      } else {
        contentHtml = '<div class="ro-detail-empty">No network requests tracked for this component</div>';
      }
    }
    
    detailOverlay.innerHTML = \`
      <div class="ro-detail-dialog">
        <div class="ro-detail-header">
          <div>
            <h3>\${comp?.name || 'Unknown'}</h3>
            <div class="file">\${node.file}</div>
            <div class="badges">
              <span class="ro-badge \${comp?.isClientComponent ? 'client' : 'server'}">\${comp?.isClientComponent ? 'Client' : 'Server'}</span>
            </div>
          </div>
          <button class="ro-detail-close" title="Close (Esc)">&times;</button>
        </div>
        <div class="ro-detail-tabs">\${tabsHtml}</div>
        <div class="ro-detail-content">\${contentHtml}</div>
      </div>
    \`;
    
    }

  function hideTooltip() {
    if (tooltip) tooltip.style.display = 'none';
  }

  function getReactFiber(el) {
    if (!el) return null;
    const keys = Object.keys(el);
    const fiberKey = keys.find(k => 
      k.startsWith('__reactFiber$') || 
      k.startsWith('__reactInternalInstance$') ||
      k.startsWith('__reactProps$')
    );
    if (fiberKey?.startsWith('__reactProps$')) {
      const internalKey = keys.find(k => k.startsWith('__reactFiber$'));
      return internalKey ? el[internalKey] : null;
    }
    return fiberKey ? el[fiberKey] : null;
  }

  function getFiberName(fiber) {
    if (!fiber) return null;
    const type = fiber.type;
    if (!type) return null;
    if (typeof type === 'string') return null;
    if (typeof type === 'function') {
      return type.displayName || type.name || null;
    }
    if (typeof type === 'object') {
      if (type.displayName) return type.displayName;
      if (type.render?.displayName) return type.render.displayName;
      if (type.render?.name) return type.render.name;
      if (type.type?.displayName) return type.type.displayName;
      if (type.type?.name) return type.type.name;
    }
    return null;
  }
  
  function getLiveComponentData(el, componentName) {
    const fiber = getReactFiber(el);
    if (!fiber) return { props: null, state: null, networkCalls: [] };
    
    let targetFiber = fiber;
    let current = fiber;
    const seen = new Set();
    while (current) {
      if (seen.has(current)) break;
      seen.add(current);
      const name = getFiberName(current);
      if (name === componentName) {
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
    
    const networkCalls = componentNetworkMap.get(componentName) || [];
    
    return { props: liveProps, state: stateValues, networkCalls };
  }
  
  function formatValue(val, maxLen = 50) {
    if (val === null) return 'null';
    if (val === undefined) return 'undefined';
    if (typeof val === 'string') return '"' + (val.length > maxLen ? val.slice(0, maxLen) + '...' : val) + '"';
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    if (Array.isArray(val)) return '[' + val.length + ' items]';
    if (typeof val === 'object') {
      const keys = Object.keys(val);
      if (keys.length === 0) return '{}';
      return '{' + keys.slice(0, 3).join(', ') + (keys.length > 3 ? '...' : '') + '}';
    }
    if (typeof val === 'function') return 'fn()';
    return String(val).slice(0, maxLen);
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
        if (stack.length === 0 || stack[stack.length - 1] !== name) {
          stack.push(name);
        }
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
      if (node.closest('#repo-overlay-panel')) continue;
      const fiber = getReactFiber(node);
      if (fiber) {
        let current = fiber;
        const seen = new Set();
        while (current) {
          if (seen.has(current)) break;
          seen.add(current);
          const compName = getFiberName(current);
          if (compName === name) {
            results.push(node);
            break;
          }
          current = current.return;
        }
      }
    }
    return results;
  }

  function getAncestorNames(nodeId) {
    const parts = nodeId.split('-').map(Number);
    const ancestors = [];
    let current = TREE;
    for (let i = 0; i < parts.length - 1; i++) {
      const node = current[parts[i]];
      if (node?.component?.name) ancestors.push(node.component.name);
      current = node?.children || [];
    }
    return ancestors;
  }

  function getFiberAncestorNames(el) {
    const fiber = getReactFiber(el);
    if (!fiber) return [];
    const ancestors = [];
    let current = fiber.return;
    const seen = new Set();
    while (current && ancestors.length < 50) {
      if (seen.has(current)) break;
      seen.add(current);
      const name = getFiberName(current);
      if (name) ancestors.push(name);
      current = current.return;
    }
    return ancestors;
  }

  function longestContiguousMatch(treeAncestors, fiberAncestors) {
    if (treeAncestors.length === 0) return 0;
    
    let bestRun = 0;
    const treeReversed = [...treeAncestors].reverse();
    
    for (let fStart = 0; fStart < fiberAncestors.length; fStart++) {
      let run = 0;
      let tIdx = 0;
      let fIdx = fStart;
      
      while (tIdx < treeReversed.length && fIdx < fiberAncestors.length) {
        if (treeReversed[tIdx] === fiberAncestors[fIdx]) {
          run++;
          tIdx++;
          fIdx++;
        } else {
          fIdx++;
          if (fIdx - fStart > tIdx + 5) break;
        }
      }
      bestRun = Math.max(bestRun, run);
    }
    
    return bestRun;
  }

  function scoreMatch(treeAncestors, fiberAncestors) {
    const contiguous = longestContiguousMatch(treeAncestors, fiberAncestors);
    
    let immediateParentMatch = 0;
    if (treeAncestors.length > 0 && fiberAncestors.length > 0) {
      const parent = treeAncestors[treeAncestors.length - 1];
      for (let i = 0; i < Math.min(3, fiberAncestors.length); i++) {
        if (fiberAncestors[i] === parent) {
          immediateParentMatch = 10 - i;
          break;
        }
      }
    }
    
    return contiguous * 5 + immediateParentMatch;
  }

  function tryFindDomElement(node, nodeId) {
    if (!node.component) return null;
    const name = node.component.name;
    const allMatches = findElementsByComponentName(name);
    if (allMatches.length === 0) return null;
    if (allMatches.length === 1) return allMatches[0];
    
    const treeAncestors = getAncestorNames(nodeId);
    if (treeAncestors.length === 0) return allMatches[0];
    
    let bestMatch = allMatches[0];
    let bestScore = -1;
    
    for (const el of allMatches) {
      const fiberAncestors = getFiberAncestorNames(el);
      const score = scoreMatch(treeAncestors, fiberAncestors);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = el;
      }
    }
    
    return bestMatch;
  }
  
  function findAllMatchingElements(node, nodeId) {
    if (!node.component) return [];
    const name = node.component.name;
    const allMatches = findElementsByComponentName(name);
    if (allMatches.length <= 1) return allMatches;
    
    const treeAncestors = getAncestorNames(nodeId);
    if (treeAncestors.length === 0) return allMatches;
    
    const scored = allMatches.map(el => ({
      el,
      score: scoreMatch(treeAncestors, getFiberAncestorNames(el))
    }));
    scored.sort((a, b) => b.score - a.score);
    
    const topScore = scored[0].score;
    if (topScore > 0) {
      return scored.filter(s => s.score === topScore).map(s => s.el);
    }
    return allMatches;
  }

  function createSelectedHighlight() {
    if (selectedHighlight) return selectedHighlight;
    selectedHighlight = document.createElement('div');
    selectedHighlight.className = 'ro-dom-highlight ro-selected';
    selectedHighlight.innerHTML = '<span class="ro-dom-label"></span>';
    document.body.appendChild(selectedHighlight);
    return selectedHighlight;
  }

  function showSelectedHighlight(el, label) {
    const hl = createSelectedHighlight();
    const rect = el.getBoundingClientRect();
    hl.style.top = rect.top + window.scrollY + 'px';
    hl.style.left = rect.left + window.scrollX + 'px';
    hl.style.width = rect.width + 'px';
    hl.style.height = rect.height + 'px';
    hl.style.display = 'block';
    hl.style.position = 'absolute';
    hl.querySelector('.ro-dom-label').textContent = label;
  }

  function hideSelectedHighlight() {
    if (selectedHighlight) selectedHighlight.style.display = 'none';
  }

  function nodeMatchesSearch(node, term) {
    if (!term) return true;
    const lowerTerm = term.toLowerCase();
    const name = node.component?.name || '';
    if (name.toLowerCase().includes(lowerTerm)) return true;
    if (node.file.toLowerCase().includes(lowerTerm)) return true;
    for (const child of node.children) {
      if (nodeMatchesSearch(child, term)) return true;
    }
    return false;
  }
  
  function renderTree(nodes, depth = 0, pathPrefix = '') {
    return nodes.map((node, i) => {
      const nodeId = pathPrefix ? pathPrefix + '-' + i : String(i);
      const hasChildren = node.children.length > 0;
      const comp = node.component;
      const fileName = node.file.split('/').pop() || node.file;
      const name = comp?.name || '—';
      const isClient = comp?.isClientComponent;
      const hooks = comp?.hooks?.length ? comp.hooks.slice(0, 2).join(', ') + (comp.hooks.length > 2 ? '...' : '') : '';
      
      const matchesSearch = nodeMatchesSearch(node, searchTerm);
      
      const childrenHtml = hasChildren ? \`<div class="ro-children">\${renderTree(node.children, depth + 1, nodeId)}</div>\` : '';
      
      return \`
        <div class="ro-node \${matchesSearch ? '' : 'ro-hidden'}" data-depth="\${depth}" data-name="\${name}" data-file="\${node.file}" data-id="\${nodeId}">
          <div class="ro-node-header">
            <span class="ro-toggle">\${hasChildren ? '▼' : '•'}</span>
            <span class="ro-name">\${name}</span>
            <span class="ro-file">\${fileName}</span>
            <span class="ro-badge \${isClient ? 'client' : 'server'}">\${isClient ? 'C' : 'S'}</span>
            \${hooks ? \`<span class="ro-hooks">\${hooks}</span>\` : ''}
          </div>
          \${childrenHtml}
        </div>
      \`;
    }).join('');
  }

  function render() {
    const treeContent = panel.querySelector('.ro-tree');
    if (treeContent) {
      treeContent.innerHTML = renderTree(TREE);
      attachNodeEvents();
      return;
    }

    panel.innerHTML = \`
      <div class="ro-resize-handle"></div>
      <div class="ro-header">
        <div class="ro-header-row">
          <h2>🧩 Component Overlay</h2>
          <button class="ro-pause-btn" id="ro-pause-btn" title="Ctrl+Shift+P">\${isPaused ? '▶ Resume' : '⏸ Pause'}</button>
        </div>
        <div class="ro-stats">
          <div class="ro-stat"><span class="ro-stat-value">\${STATS.totalComponents}</span><span class="ro-stat-label">total</span></div>
          <div class="ro-stat"><span class="ro-stat-value">\${STATS.clientComponents}</span><span class="ro-stat-label">client</span></div>
          <div class="ro-stat"><span class="ro-stat-value">\${STATS.serverComponents}</span><span class="ro-stat-label">server</span></div>
        </div>
        <div class="route">\${ROUTE}</div>
      </div>
      <div class="ro-search">
        <input type="text" placeholder="Search components..." value="\${searchTerm}">
      </div>
      <div class="ro-tree">\${renderTree(TREE)}</div>
    \`;

    const newResizeHandle = panel.querySelector('.ro-resize-handle');
    newResizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      newResizeHandle.classList.add('dragging');
      e.preventDefault();
    });

    attachEvents();
  }

  function attachEvents() {
    const searchInput = panel.querySelector('.ro-search input');
    searchInput.addEventListener('input', (e) => {
      searchTerm = e.target.value;
      render();
    });

    const pauseBtn = panel.querySelector('#ro-pause-btn');
    pauseBtn.addEventListener('click', () => {
      isPaused = !isPaused;
      pauseBtn.textContent = isPaused ? '▶ Resume' : '⏸ Pause';
      pauseBtn.classList.toggle('paused', isPaused);
      if (isPaused) {
        disableInspectMode();
      } else if (isOpen) {
        enableInspectMode();
      }
    });

    attachNodeEvents();
  }

  function attachNodeEvents() {
    panel.querySelectorAll('.ro-node-header').forEach(header => {
      const node = header.parentElement;
      const toggle = header.querySelector('.ro-toggle');
      
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (node.querySelector('.ro-children')) {
          node.classList.toggle('ro-collapsed');
        }
      });
      
      header.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target === toggle) return;
        
        const name = node.dataset.name;
        const nodeId = node.dataset.id;
        const treeNode = findNodeById(TREE, nodeId);
        
        panel.querySelectorAll('.ro-node-header.selected').forEach(el => el.classList.remove('selected'));
        header.classList.add('selected');
        
        let domEl = null;
        if (treeNode) {
          const allMatches = findAllMatchingElements(treeNode, nodeId);
          if (allMatches.length > 0) {
            if (lastClickedNodeId === nodeId) {
              cycleIndex = (cycleIndex + 1) % allMatches.length;
            } else {
              cycleIndex = 0;
              lastClickedNodeId = nodeId;
            }
            domEl = allMatches[cycleIndex];
            const label = allMatches.length > 1 ? name + ' (' + (cycleIndex + 1) + '/' + allMatches.length + ')' : name;
            showSelectedHighlight(domEl, label);
            domEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            hideSelectedHighlight();
            lastClickedNodeId = null;
          }
          
          showDetailDialog(treeNode, domEl);
        }
      });

      header.addEventListener('mouseenter', (e) => {
        const name = node.dataset.name;
        const nodeId = node.dataset.id;
        const treeNode = findNodeById(TREE, nodeId);
        if (treeNode) {
          const domEl = tryFindDomElement(treeNode, nodeId);
          showTooltip(e, treeNode, domEl);
          if (domEl) showHighlight(domEl, name);
        }
      });

      header.addEventListener('mouseleave', () => {
        hideTooltip();
        hideHighlight();
      });

      header.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const file = node.dataset.file;
        window.open(\`vscode://file/\${file}\`);
      });
    });
  }

  function findNodeByFile(nodes, file) {
    for (const n of nodes) {
      if (n.file === file) return n;
      if (n.children.length) {
        const found = findNodeByFile(n.children, file);
        if (found) return found;
      }
    }
    return null;
  }

  function findNodeById(nodes, id, pathPrefix = '') {
    for (let i = 0; i < nodes.length; i++) {
      const nodeId = pathPrefix ? pathPrefix + '-' + i : String(i);
      if (nodeId === id) return nodes[i];
      if (nodes[i].children.length) {
        const found = findNodeById(nodes[i].children, id, nodeId);
        if (found) return found;
      }
    }
    return null;
  }

  function countPrecedingComponentsByName(nodes, targetId, name, pathPrefix = '') {
    let count = 0;
    for (let i = 0; i < nodes.length; i++) {
      const nodeId = pathPrefix ? pathPrefix + '-' + i : String(i);
      if (nodeId === targetId) return count;
      if (nodes[i].component?.name === name) count++;
      if (nodes[i].children.length) {
        const result = countPrecedingComponentsByName(nodes[i].children, targetId, name, nodeId);
        if (result >= 0) return count + result;
        count += countComponentsByName(nodes[i].children, name);
      }
    }
    return -1;
  }

  function countComponentsByName(nodes, name) {
    let count = 0;
    for (const n of nodes) {
      if (n.component?.name === name) count++;
      if (n.children.length) count += countComponentsByName(n.children, name);
    }
    return count;
  }

  function countNodesWithName(nodes, name) {
    let count = 0;
    for (const n of nodes) {
      if (n.component?.name === name) count++;
      if (n.children.length) count += countNodesWithName(n.children, name);
    }
    return count;
  }

  function findNodeWithId(nodes, name, pathPrefix = '') {
    for (let i = 0; i < nodes.length; i++) {
      const nodeId = pathPrefix ? pathPrefix + '-' + i : String(i);
      if (nodes[i].component?.name === name) return { node: nodes[i], nodeId };
      if (nodes[i].children.length) {
        const found = findNodeWithId(nodes[i].children, name, nodeId);
        if (found) return found;
      }
    }
    return null;
  }

  function findInSubtreeWithId(nodes, name, pathPrefix) {
    for (let i = 0; i < nodes.length; i++) {
      const nodeId = pathPrefix + '-' + i;
      if (nodes[i].component?.name === name) return { node: nodes[i], nodeId };
      if (nodes[i].children.length) {
        const found = findInSubtreeWithId(nodes[i].children, name, nodeId);
        if (found) return found;
      }
    }
    return null;
  }

  function selectTreeNodeByPath(stack) {
    for (const ancestorName of [...stack].reverse()) {
      const count = countNodesWithName(TREE, ancestorName);
      if (count === 1) {
        const result = findNodeWithId(TREE, ancestorName);
        if (result) {
          for (const targetName of stack) {
            const targetResult = findInSubtreeWithId(result.node.children, targetName, result.nodeId);
            if (targetResult) {
              return selectTreeNodeById(targetResult.nodeId);
            }
          }
          return selectTreeNodeById(result.nodeId);
        }
      }
    }
    
    for (const name of stack) {
      const result = findNodeWithId(TREE, name);
      if (result && selectTreeNodeById(result.nodeId)) return true;
    }
    return false;
  }

  function selectTreeNodeById(nodeId) {
    const nodeEl = panel.querySelector(\`.ro-node[data-id="\${nodeId}"]\`);
    if (!nodeEl) return false;
    
    let parent = nodeEl.parentElement;
    while (parent && parent !== panel) {
      if (parent.classList.contains('ro-node') && parent.classList.contains('ro-collapsed')) {
        parent.classList.remove('ro-collapsed');
      }
      parent = parent.parentElement;
    }
    
    panel.querySelectorAll('.ro-node-header.selected').forEach(el => el.classList.remove('selected'));
    const header = nodeEl.querySelector(':scope > .ro-node-header');
    if (header) {
      header.classList.add('selected');
      setTimeout(() => {
        header.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
    
    return true;
  }

  function selectTreeNodeByFile(file, name) {
    let selector = file 
      ? \`.ro-node[data-file="\${file}"]\`
      : \`.ro-node[data-name="\${name}"]\`;
    
    const nodeEl = panel.querySelector(selector);
    if (!nodeEl) return false;
    
    let parent = nodeEl.parentElement;
    while (parent && parent !== panel) {
      if (parent.classList.contains('ro-node') && parent.classList.contains('ro-collapsed')) {
        parent.classList.remove('ro-collapsed');
      }
      parent = parent.parentElement;
    }
    
    panel.querySelectorAll('.ro-node-header.selected').forEach(el => el.classList.remove('selected'));
    const header = nodeEl.querySelector(':scope > .ro-node-header');
    if (header) {
      header.classList.add('selected');
      setTimeout(() => {
        header.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
    
    return true;
  }

  let inspectHandler = null;
  let inspectClickHandler = null;

  function enableInspectMode() {
    inspectHandler = (e) => {
      if (isResizing) return;
      const el = e.target;
      if (el.closest('#repo-overlay-panel') || el.closest('#repo-overlay-toggle')) return;
      const stack = getComponentStack(el);
      const label = stack.length > 0 
        ? stack.slice(0, 3).join(' → ')
        : el.tagName.toLowerCase() + (el.className ? '.' + el.className.toString().split(' ')[0] : '');
      showHighlight(el, label);
    };
    inspectClickHandler = (e) => {
      if (e.target.closest('#repo-overlay-panel') || e.target.closest('#repo-overlay-toggle') || e.target.closest('.ro-detail-overlay')) return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.target;
      const stack = getComponentStack(el);
      console.log('%c🧩 Component Stack', 'color: #d2a8ff; font-weight: bold; font-size: 14px');
      stack.forEach((name, i) => console.log('  '.repeat(i) + '↳ ' + name));
      console.log('Element:', el);
      
      if (stack.length > 0) {
        selectTreeNodeByPath(stack);
        showSelectedHighlight(el, stack[0]);
      }
    };
    document.addEventListener('mousemove', inspectHandler);
    document.addEventListener('click', inspectClickHandler, true);
  }

  function disableInspectMode() {
    if (inspectHandler) document.removeEventListener('mousemove', inspectHandler);
    if (inspectClickHandler) document.removeEventListener('click', inspectClickHandler, true);
    hideHighlight();
    hideSelectedHighlight();
  }

  function showLoading() {
    isLoading = true;
    const tree = panel.querySelector('.ro-tree');
    if (tree) {
      tree.innerHTML = '<div class="ro-loading"><div class="ro-loading-spinner"></div><div class="ro-loading-text">Analyzing route...</div></div>';
    }
  }

  async function reloadData() {
    const newPath = window.location.pathname;
    if (isLoading) return;
    
    showLoading();
    currentPath = newPath;
    
    try {
      const res = await fetch('/__overlay_data.json?route=' + encodeURIComponent(newPath));
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      TREE = data.componentTree;
      STATS = data.stats;
      ROUTE = data.route;
      
      isLoading = false;
      render();
      
      const routeEl = panel.querySelector('.route');
      if (routeEl) routeEl.textContent = ROUTE;
      
      const statEls = panel.querySelectorAll('.ro-stat-value');
      if (statEls[0]) statEls[0].textContent = STATS.totalComponents;
      if (statEls[1]) statEls[1].textContent = STATS.clientComponents;
      if (statEls[2]) statEls[2].textContent = STATS.serverComponents;
      
    } catch (err) {
      isLoading = false;
      const tree = panel.querySelector('.ro-tree');
      if (tree) {
        tree.innerHTML = '<div class="ro-loading"><div class="ro-loading-text" style="color:#f85149;">Error: ' + err.message + '</div></div>';
      }
    }
  }

  function checkRouteChange() {
    if (window.location.pathname !== currentPath && !isLoading) {
      reloadData();
    }
  }

  function toggle() {
    isOpen = !isOpen;
    panel.classList.toggle('open', isOpen);
    toggleBtn.classList.toggle('open', isOpen);
    document.body.classList.toggle('ro-panel-open', isOpen);
    toggleBtn.innerHTML = isOpen ? '✕' : '🔍';
    
    if (isOpen && !isPaused) {
      enableInspectMode();
    } else {
      disableInspectMode();
    }
  }

  toggleBtn.addEventListener('click', toggle);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && detailOverlay?.style.display === 'flex') {
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
      const pauseBtn = panel.querySelector('#ro-pause-btn');
      if (pauseBtn) {
        pauseBtn.textContent = isPaused ? '▶ Resume' : '⏸ Pause';
        pauseBtn.classList.toggle('paused', isPaused);
      }
      if (isPaused) {
        disableInspectMode();
      } else if (isOpen) {
        enableInspectMode();
      }
    }
  });

  window.addEventListener('popstate', checkRouteChange);
  setInterval(checkRouteChange, 500);

  ['mousedown', 'mouseup', 'click', 'dblclick', 'pointerdown', 'pointerup'].forEach(evt => {
    panel.addEventListener(evt, (e) => e.stopPropagation());
    toggleBtn.addEventListener(evt, (e) => e.stopPropagation());
  });

  document.body.appendChild(panel);
  document.body.appendChild(toggleBtn);

  render();
  toggle();

  window.__REPO_OVERLAY__ = { 
    toggle, 
    show: () => { if (!isOpen) toggle(); }, 
    hide: () => { if (isOpen) toggle(); },
    setWidth: updatePanelWidth,
    reload: reloadData
  };
})();`;
}

export function generateBookmarklet(data: RouteComponentAnalysis): string {
  const script = generateOverlayScript(data);
  return `javascript:${encodeURIComponent(script)}`;
}
