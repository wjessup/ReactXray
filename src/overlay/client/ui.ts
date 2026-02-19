import { state, callbacks } from './state';
import { escapeHtml, isOverlayElement } from './utils';
import { 
    refreshAnalysis, 
    toggle, 
    toggleFilter, 
    getFilterEnabled, 
    getStaticComponent 
} from './logic';

function nodeMatchesSearch(node: any, term: string): boolean {
    if (!term) return true;
    const lower = term.toLowerCase();
    if ((node.component?.name || '').toLowerCase().includes(lower)) return true;
    if ((node.file || '').toLowerCase().includes(lower)) return true;
    for (const child of node.children) {
        if (nodeMatchesSearch(child, term)) return true;
    }
    return false;
}

function isPathIgnored(filePath: string) {
    if (!filePath || state.ignoredPaths.length === 0) return false;
    const normalizedPath = filePath.toLowerCase();
    for (const pattern of state.ignoredPaths) {
      if (!pattern.trim()) continue;
      const normalizedPattern = pattern.toLowerCase().trim();
      if (normalizedPath.includes(normalizedPattern)) return true;
    }
    return false;
}

function filterIgnoredNodes(nodes: any[]): any[] {
    const result = [];
    for (const node of nodes) {
      const filePath = node.source?.fileName || node.file || node.component?.filePath || '';
      if (isPathIgnored(filePath)) {
        result.push(...filterIgnoredNodes(node.children || []));
        continue;
      }
      result.push({
        ...node,
        children: filterIgnoredNodes(node.children || [])
      });
    }
    return result;
}

function renderTree(nodes: any[], depth = 0, prefix = ''): string {
    return nodes.map((node, i) => {
        const nodeId = prefix ? prefix + '-' + i : String(i);
        const hasChildren = (node.children || []).length > 0;
        const comp = node.component;
        const rawFile = node.source?.fileName || node.file || 'unknown';

        if (node.isSlot || rawFile === '{children}') {
            const childrenHtml = hasChildren ? renderTree(node.children, depth, prefix + '-' + i) : '';
            return '<div class="children-slot" data-id="' + nodeId + '">' + childrenHtml + '</div>';
        }

        const fileName = rawFile.split('/').pop() || rawFile;
        const lineNum = node.source?.lineNumber;
        const fileDisplay = lineNum ? fileName + ':' + lineNum : fileName;
        const name = comp?.name || '—';
        const renderCount = state.renderCounts.get(name) || 0;
        const matches = nodeMatchesSearch(node, state.searchTerm);
        const hasSource = rawFile !== 'unknown';

        const staticComp = name !== '—' ? getStaticComponent(name) : null;
        const isServerOnly = node.isServerOnly;
        const isBridge = node.isBridge;

        const badges = [];
        if (staticComp?.isClientComponent) {
            badges.push('<span class="badge client">Client</span>');
        }

        const badgesHtml = badges.join('');
        const renderCountHtml = isServerOnly
            ? '<span class="render-count server-only">—</span>'
            : '<span class="render-count" style="' + (renderCount === 0 ? 'opacity:0.3' : '') + '">' + renderCount + '</span>';

        const nodeClasses = ['node', matches ? '' : 'hidden', isServerOnly ? 'server-only' : '', isBridge ? 'bridge' : ''].filter(Boolean).join(' ');
        const childrenHtml = hasChildren ? '<div class="children">' + renderTree(node.children, depth + 1, nodeId) + '</div>' : '';

        return `
        <div class="${nodeClasses}" data-depth="${depth}" data-name="${name}" data-file="${rawFile}" data-id="${nodeId}">
          <div class="node-header">
            <span class="toggle">${hasChildren ? '▼' : '•'}</span>
            <span class="name">${escapeHtml(name)}</span>
            ${badgesHtml}
            ${renderCountHtml}
            <span class="file ${hasSource ? 'has-source' : ''}" title="${escapeHtml(rawFile)}">${escapeHtml(fileDisplay)}</span>
          </div>
          ${childrenHtml}
        </div>
      `;
    }).join('');
}

export function renderPanel() {
    if (!state.container) return;

    if (state.TREE.length === 0 && state.STATIC_TREE.length > 0) {
        state.TREE = JSON.parse(JSON.stringify(state.STATIC_TREE));
        console.log('renderPanel 2', state.TREE, state.STATIC_TREE, state.isLoading);
    }
    
    let displayTree = filterIgnoredNodes(state.TREE);
    const treeContent = state.isLoading
        ? '<div class="loading"><div class="loading-spinner"></div><div class="loading-text">Analyzing components...</div></div>'
        : displayTree.length === 0
            ? '<div class="loading"><div class="loading-text">No components found</div></div>'
            : renderTree(displayTree);
    const filterLabel = getFilterEnabled() ? 'FILTERED' : 'ALL';
    const ignoredCount = state.ignoredPaths.filter((p: string) => p.trim()).length;

    state.container.innerHTML = `
      <div class="panel ${state.isOpen ? 'open' : ''}">
        <div class="resize-handle"></div>
        <div class="header">
          <div class="header-row">
            <h2>🧩 Component Overlay</h2>
            <div class="header-buttons">
              <button class="settings-btn" title="Settings - ignore paths">${ignoredCount > 0 ? '⚙️' + ignoredCount : '⚙️'}</button>
              <button class="refresh-btn" title="Re-analyze page">🔄</button>
              <button class="filter-btn ${getFilterEnabled() ? 'on' : 'off'}" title="Toggle filter">${filterLabel}</button>
              <button class="pause-btn ${state.isPaused ? 'paused' : ''}">${state.isPaused ? '▶' : '⏸'}</button>
            </div>
          </div>
          <div class="stats">
            <div class="stat"><span class="stat-value">${state.STATS.totalComponents || 0}</span><span class="stat-label">total</span></div>
            <div class="stat"><span class="stat-value" style="color:#7ee787">${state.STATS.serverComponents || 0}</span><span class="stat-label">server</span></div>
            <div class="stat"><span class="stat-value" style="color:#58a6ff">${state.STATS.fiberNodes || 0}</span><span class="stat-label">client</span></div>
            <div class="stat"><span class="stat-value" id="total-renders" style="color:#f85149">${state.totalRenders}</span><span class="stat-label">renders</span></div>
          </div>
          <div class="route">${state.ROUTE}</div>
        </div>
        <div class="search">
          <input type="text" placeholder="Search components..." value="${escapeHtml(state.searchTerm)}">
        </div>
        <div class="tree-container">
          <div class="tree">${treeContent}</div>
        </div>
      </div>
      <button class="toggle-btn ${state.isOpen ? 'open' : ''}">${state.isOpen ? '✕' : '🔍'}</button>
    `;

    state.container.style.setProperty('--panel-width', state.panelWidth + 'px');
    
    attachPanelEvents();
}

function attachPanelEvents() {
    if (!state.shadow) return;
    
    const toggleBtn = state.shadow.querySelector('.toggle-btn');
    const resizeHandle = state.shadow.querySelector('.resize-handle');
    const searchInput = state.shadow.querySelector('.search input');
    const pauseBtn = state.shadow.querySelector('.pause-btn');
    const refreshBtn = state.shadow.querySelector('.refresh-btn');
    const filterBtn = state.shadow.querySelector('.filter-btn');

    toggleBtn?.addEventListener('click', e => { e.stopPropagation(); e.stopImmediatePropagation(); toggle(); }, { capture: true });

    refreshBtn?.addEventListener('click', e => {
      e.stopPropagation(); e.stopImmediatePropagation();
      refreshAnalysis();
    }, { capture: true });

    filterBtn?.addEventListener('click', e => {
      e.stopPropagation(); e.stopImmediatePropagation();
      toggleFilter();
    }, { capture: true });

    let isResizing = false;
    resizeHandle?.addEventListener('mousedown', e => {
      e.stopPropagation(); e.stopImmediatePropagation();
      isResizing = true;
      resizeHandle.classList.add('dragging');
    }, { capture: true });
    
    const onResizeMove = (e: MouseEvent) => {
        if (!isResizing) return;
        state.panelWidth = Math.max(280, Math.min(800, window.innerWidth - e.clientX));
        if (state.container) state.container.style.setProperty('--panel-width', state.panelWidth + 'px');
    };
    
    const onResizeUp = () => {
        if (isResizing) {
            isResizing = false;
            resizeHandle?.classList.remove('dragging');
            localStorage.setItem('ro-panel-width', state.panelWidth.toString());
        }
    };
    
    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('mouseup', onResizeUp);

    searchInput?.addEventListener('input', e => {
      e.stopPropagation(); e.stopImmediatePropagation();
      // @ts-ignore
      state.searchTerm = e.target.value;
      renderPanel();
      
      const newInput = state.shadow?.querySelector('.search input') as HTMLInputElement;
      if (newInput) {
          newInput.focus();
          // @ts-ignore
          newInput.setSelectionRange(e.target.value.length, e.target.value.length);
      }
    }, { capture: true });

    pauseBtn?.addEventListener('click', e => {
      e.stopPropagation(); e.stopImmediatePropagation();
      state.isPaused = !state.isPaused;
      renderPanel();
    }, { capture: true });
}

callbacks.render = renderPanel;
