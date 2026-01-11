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

  const TREE = ${treeJson};
  const STATS = ${statsJson};
  const ROUTE = ${routeJson};

  let panelWidth = parseInt(localStorage.getItem('ro-panel-width') || '380', 10);
  let isOpen = false;

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
      padding: 10px;
      z-index: 100000;
      max-width: 280px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      pointer-events: none;
    }
    .ro-tooltip h4 { color: #d2a8ff; margin: 0 0 6px 0; font-size: 12px; }
    .ro-tooltip .file { color: #7ee787; font-size: 10px; margin-bottom: 6px; word-break: break-all; }
    .ro-tooltip .info { color: #8b949e; font-size: 10px; margin: 3px 0; }
    .ro-tooltip .hooks { color: #ffa657; }
    .ro-tooltip .queries { color: #79c0ff; }
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

  function showTooltip(e, node) {
    const t = createTooltip();
    const comp = node.component;
    const hooks = comp?.hooks?.length ? comp.hooks.join(', ') : '—';
    const queries = comp?.serverQueries?.length ? comp.serverQueries.join(', ') : '—';
    t.innerHTML = \`
      <h4>\${comp?.name || '—'}</h4>
      <div class="file">\${node.file}</div>
      <div class="info">Type: <strong>\${comp?.isClientComponent ? 'Client' : 'Server'}</strong></div>
      <div class="info hooks">Hooks: \${hooks}</div>
      <div class="info queries">Server Queries: \${queries}</div>
    \`;
    t.style.display = 'block';
    const x = Math.min(e.clientX + 10, window.innerWidth - panelWidth - 300);
    const y = Math.min(e.clientY + 10, window.innerHeight - 180);
    t.style.left = x + 'px';
    t.style.top = y + 'px';
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

  function tryFindDomElement(node) {
    if (!node.component) return null;
    const name = node.component.name;
    const byFiber = findElementsByComponentName(name);
    if (byFiber.length > 0) return byFiber[0];
    const selectors = [
      \`[data-testid="\${name}"]\`,
      \`[data-testid="\${name.toLowerCase()}"]\`,
      \`[data-component="\${name}"]\`,
    ];
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el && !el.closest('#repo-overlay-panel')) return el;
      } catch {}
    }
    return null;
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

  function renderTree(nodes, depth = 0) {
    return nodes.map((node, i) => {
      const hasChildren = node.children.length > 0;
      const comp = node.component;
      const fileName = node.file.split('/').pop() || node.file;
      const name = comp?.name || '—';
      const isClient = comp?.isClientComponent;
      const hooks = comp?.hooks?.length ? comp.hooks.slice(0, 2).join(', ') + (comp.hooks.length > 2 ? '...' : '') : '';
      
      const matchesSearch = !searchTerm || 
        name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        node.file.toLowerCase().includes(searchTerm.toLowerCase());
      
      const childrenHtml = hasChildren ? \`<div class="ro-children">\${renderTree(node.children, depth + 1)}</div>\` : '';
      
      return \`
        <div class="ro-node \${matchesSearch ? '' : 'ro-hidden'}" data-depth="\${depth}" data-name="\${name}" data-file="\${node.file}">
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
        <h2>🧩 Component Overlay</h2>
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

    attachNodeEvents();
  }

  function attachNodeEvents() {
    panel.querySelectorAll('.ro-node-header').forEach(header => {
      const node = header.parentElement;
      
      header.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = node.dataset.name;
        const file = node.dataset.file;
        const treeNode = findNodeByFile(TREE, file);
        
        panel.querySelectorAll('.ro-node-header.selected').forEach(el => el.classList.remove('selected'));
        header.classList.add('selected');
        
        if (treeNode) {
          const domEl = tryFindDomElement(treeNode);
          if (domEl) {
            showSelectedHighlight(domEl, name);
            domEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            hideSelectedHighlight();
          }
        }
        
        if (node.querySelector('.ro-children')) {
          node.classList.toggle('ro-collapsed');
        }
      });

      header.addEventListener('mouseenter', (e) => {
        const name = node.dataset.name;
        const file = node.dataset.file;
        const treeNode = findNodeByFile(TREE, file);
        if (treeNode) {
          showTooltip(e, treeNode);
          const domEl = tryFindDomElement(treeNode);
          if (domEl) showHighlight(domEl, name);
        }
      });

      header.addEventListener('mouseleave', () => {
        hideTooltip();
        hideHighlight();
      });

      header.addEventListener('dblclick', () => {
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

  function findNodeByAncestry(nodes, stack, depth = 0) {
    if (depth >= stack.length) return null;
    const targetName = stack[depth];
    
    for (const n of nodes) {
      if (n.component?.name === targetName) {
        if (depth === stack.length - 1) return n;
        if (n.children.length) {
          const found = findNodeByAncestry(n.children, stack, depth + 1);
          if (found) return found;
        }
        return n;
      }
      if (n.children.length) {
        const found = findNodeByAncestry(n.children, stack, depth);
        if (found) return found;
      }
    }
    return null;
  }

  function selectTreeNodeByPath(stack) {
    const reversedStack = [...stack].reverse();
    const found = findNodeByAncestry(TREE, reversedStack, 0);
    
    if (found) {
      return selectTreeNodeByFile(found.file, found.component?.name);
    }
    
    for (const name of stack) {
      if (selectTreeNodeByFile(null, name)) return true;
    }
    return false;
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
      if (e.target.closest('#repo-overlay-panel') || e.target.closest('#repo-overlay-toggle')) return;
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

  function toggle() {
    isOpen = !isOpen;
    panel.classList.toggle('open', isOpen);
    toggleBtn.classList.toggle('open', isOpen);
    document.body.classList.toggle('ro-panel-open', isOpen);
    toggleBtn.innerHTML = isOpen ? '✕' : '🔍';
    
    if (isOpen) {
      enableInspectMode();
    } else {
      disableInspectMode();
    }
  }

  toggleBtn.addEventListener('click', toggle);
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      toggle();
    }
  });

  document.body.appendChild(panel);
  document.body.appendChild(toggleBtn);

  render();
  toggle();

  window.__REPO_OVERLAY__ = { 
    toggle, 
    show: () => { if (!isOpen) toggle(); }, 
    hide: () => { if (isOpen) toggle(); },
    setWidth: updatePanelWidth
  };
})();`;
}

export function generateBookmarklet(data: RouteComponentAnalysis): string {
  const script = generateOverlayScript(data);
  return `javascript:${encodeURIComponent(script)}`;
}
