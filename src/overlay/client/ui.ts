import { callbacks, state } from './state';
import {
    escapeHtml,
    findBestMatchingElement,
    findFirstNodeWithName,
    findNodeByAncestry,
    findNodeById,
    getAncestryNames,
    getDomFromFiber,
    getFiberName,
    hasAnyFiberDescendant,
    h,
} from './utils';
import { hideHoverHighlight, hideSelectedHighlight, showHoverHighlight, showSelectedHighlight } from './highlight';
import { showDetailDialog } from './details';
import { getFilterEnabled, getStaticComponent, refreshAnalysis, toggle, toggleFilter } from './logic';
import { showSettingsDialog } from './settings';

import { filterIgnoredNodes, renderTreeContainer } from './treeRenderer';
import { renderAiSection, addComponentToAiContext } from './ai-chat';

export function renderPanel() {
    if (!state.container) return;

    if (state.TREE.length === 0 && state.STATIC_TREE.length > 0) {
        state.TREE = JSON.parse(JSON.stringify(state.STATIC_TREE));
    }

    state.DISPLAY_TREE = filterIgnoredNodes(state.TREE);
    const filterLabel = getFilterEnabled() ? 'FILTERED' : 'ALL';
    const ignoredCount = state.ignoredPaths.filter((p: string) => p.trim()).length;

    state.container.innerHTML = `
      <div class="panel ${state.isOpen ? 'open' : ''}">
        <div class="resize-handle"></div>
        <div class="header">
          <div class="header-row">
            <h2>🧩 Component Overlay${state.isMinified ? ' <span class="minified-warn" title="Code appears minified — component names may be inaccurate">⚠️</span>' : ''}</h2>
            <div class="header-buttons">
              <div class="view-toggle" style="display:flex; gap:12px; font-size:11px; margin-left:12px; background:#0d1117; padding:4px 8px; border-radius:6px; border:1px solid #30363d; color:#c9d1d9;">
                <label style="cursor:pointer; display:flex; align-items:center; gap:4px;"><input type="radio" name="viewMode" value="tree" ${state.viewMode !== 'list' ? 'checked' : ''} style="cursor:pointer;margin:0;accent-color:#58a6ff;"> Tree</label>
                <label style="cursor:pointer; display:flex; align-items:center; gap:4px;"><input type="radio" name="viewMode" value="list" ${state.viewMode === 'list' ? 'checked' : ''} style="cursor:pointer;margin:0;accent-color:#58a6ff;"> Components</label>
              </div>
              <button class="settings-btn" title="Settings - ignore paths">${ignoredCount > 0 ? '⚙️' + ignoredCount : '⚙️'}</button>
              <button class="refresh-btn" title="Re-analyze page">🔄</button>
              <button class="filter-btn ${getFilterEnabled() ? 'on' : 'off'}" title="Toggle filter">${filterLabel}</button>
              <button class="pause-btn ${state.isPaused ? 'paused' : ''}">${state.isPaused ? '▶' : '⏸'}</button>
            </div>
          </div>
          <div class="stats">
            <div class="stat"><span class="stat-value">${state.STATS.totalComponents || 0}</span><span class="stat-label">total</span></div>
            <div class="stat"><span class="stat-value" style="color:#7ee787">${state.STATS.serverComponents || 0}</span><span class="stat-label">server</span></div>
            <div class="stat"><span class="stat-value" style="color:#58a6ff">${state.STATS.clientComponents || 0}</span><span class="stat-label">client</span></div>
            <div class="stat"><span class="stat-value" id="total-renders" style="color:#f85149">${state.totalRenders}</span><span class="stat-label">renders</span></div>
            ${state.DEPS ? `<div class="stat" style="margin-left: auto;"><span class="stat-label">Complexity:</span> <span class="stat-value" style="color:#58a6ff; text-transform:capitalize;">${state.DEPS.complexityLevel || 'unknown'}</span></div>` : ''}
          </div>
          <div class="route">${state.ROUTE}</div>
        </div>
        <div class="search">
          <input type="text" placeholder="Search components..." value="${escapeHtml(state.searchTerm)}">
        </div>
        <div class="ai-section"></div>
        <div class="tree-container">
          <div class="sticky-parents"></div>
          <div class="tree"></div>
        </div>
      </div>
      <button class="toggle-btn ${state.isOpen ? 'open' : ''}">${state.isOpen ? '✕' : '🔍'}</button>
    `;

    const treeContainerEl = state.container.querySelector('.tree');
    if (treeContainerEl) {
        renderTreeContainer(treeContainerEl as HTMLElement);
    }

    state.container.style.setProperty('--panel-width', state.panelWidth + 'px');
    renderAiSection();
    attachPanelEvents();
    attachNodeEvents();
}

function attachPanelEvents() {
    if (!state.shadow) return;

    const toggleBtn = state.shadow.querySelector('.toggle-btn');
    const resizeHandle = state.shadow.querySelector('.resize-handle');
    const searchInput = state.shadow.querySelector('.search input');
    const pauseBtn = state.shadow.querySelector('.pause-btn');
    const refreshBtn = state.shadow.querySelector('.refresh-btn');
    const filterBtn = state.shadow.querySelector('.filter-btn');
    const settingsBtn = state.shadow.querySelector('.settings-btn');

    toggleBtn?.addEventListener('click', e => { e.stopPropagation(); e.stopImmediatePropagation(); toggle(); }, { capture: true });

    settingsBtn?.addEventListener('click', e => {
        e.stopPropagation(); e.stopImmediatePropagation();
        showSettingsDialog();
    }, { capture: true });

    refreshBtn?.addEventListener('click', e => {
        e.stopPropagation(); e.stopImmediatePropagation();
        refreshAnalysis();
    }, { capture: true });

    state.shadow.querySelectorAll('input[name="viewMode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
           state.viewMode = (e.target as HTMLInputElement).value as 'tree' | 'list';
           renderPanel();
        });
    });

    filterBtn?.addEventListener('click', e => {
        e.stopPropagation(); e.stopImmediatePropagation();
        state.renderCounts.clear();
        state.totalRenders = 0;
        toggleFilter();
    }, { capture: true });

    let isResizing = false;
    resizeHandle?.addEventListener('mousedown', e => {
        e.stopPropagation(); e.stopImmediatePropagation();
        isResizing = true;
        resizeHandle.classList.add('dragging');
    }, { capture: true });

    document.addEventListener('mousemove', e => {
        if (!isResizing) return;
        state.panelWidth = Math.max(280, Math.min(800, window.innerWidth - (e as MouseEvent).clientX));
        if (state.container) state.container.style.setProperty('--panel-width', state.panelWidth + 'px');
        localStorage.setItem('ro-panel-width', state.panelWidth.toString());
    });

    document.addEventListener('mouseup', () => {
        isResizing = false;
        if (resizeHandle) resizeHandle.classList.remove('dragging');
    });

    searchInput?.addEventListener('input', e => {
        e.stopPropagation(); e.stopImmediatePropagation();
        state.searchTerm = (e.target as HTMLInputElement).value;
        const tree = state.shadow?.querySelector('.tree');
        if (tree) {
            state.DISPLAY_TREE = filterIgnoredNodes(state.TREE);
            renderTreeContainer(tree as HTMLElement);
            attachNodeEvents();
        }
    }, { capture: true });

    pauseBtn?.addEventListener('click', e => {
        e.stopPropagation(); e.stopImmediatePropagation();
        state.isPaused = !state.isPaused;
        renderPanel();
        if (callbacks.onToggle) callbacks.onToggle(state.isOpen);
    }, { capture: true });

    const treeEl = state.shadow.querySelector('.tree');
    const stickyParents = state.shadow.querySelector('.sticky-parents');

    function getAncestorsForNode(nodeEl: Element | null): Array<{ name: string; nodeId: string }> {
        const ancestors: Array<{ name: string; nodeId: string }> = [];
        let parent = nodeEl?.parentElement;
        while (parent) {
            if (parent.classList.contains('node')) {
                const name = (parent as HTMLElement).dataset.name;
                const nodeId = (parent as HTMLElement).dataset.id;
                if (name && name !== '—' && nodeId) ancestors.unshift({ name, nodeId });
            }
            if (parent.classList.contains('tree')) break;
            parent = parent.parentElement;
        }
        return ancestors;
    }

    function renderStickyParents(ancestors: Array<{ name: string; nodeId: string }>) {
        if (!stickyParents) return;
        if (ancestors.length === 0) {
            stickyParents.classList.remove('visible');
            return;
        }
        stickyParents.innerHTML = ancestors.map((a, i) =>
            (i > 0 ? '<span class="sticky-sep">›</span>' : '') +
            '<span class="sticky-crumb" data-id="' + a.nodeId + '"><span class="crumb-name">' + a.name + '</span></span>'
        ).join('');
        stickyParents.classList.add('visible');

        stickyParents.querySelectorAll('.sticky-crumb').forEach(crumb => {
            crumb.addEventListener('click', e => {
                e.stopPropagation();
                const crumbNodeId = (crumb as HTMLElement).dataset.id;
                const nodeEl = treeEl?.querySelector('.node[data-id="' + crumbNodeId + '"]');
                if (nodeEl) {
                    const header = nodeEl.querySelector(':scope > .node-header');
                    if (header) header.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
    }

    function updateStickyParentsForSelected() {
        const selectedHeader = state.shadow?.querySelector('.node-header.selected');
        if (selectedHeader) {
            const nodeEl = selectedHeader.parentElement;
            renderStickyParents(getAncestorsForNode(nodeEl));
            return;
        }
        updateStickyParentsForScroll();
    }

    function updateStickyParentsForScroll() {
        if (!treeEl || !stickyParents) return;
        const selectedHeader = state.shadow?.querySelector('.node-header.selected');
        if (selectedHeader) return;
        const treeRect = treeEl.getBoundingClientRect();
        const scrollTop = treeEl.scrollTop;
        if (scrollTop < 20) {
            stickyParents.classList.remove('visible');
            return;
        }
        let topNode: Element | null = null;
        let topOffset = Infinity;
        treeEl.querySelectorAll('.node').forEach(node => {
            const header = node.querySelector(':scope > .node-header');
            if (!header) return;
            const rect = header.getBoundingClientRect();
            const offset = rect.top - treeRect.top;
            if (offset >= -10 && offset < topOffset) {
                topOffset = offset;
                topNode = node;
            }
        });
        if (!topNode) {
            stickyParents.classList.remove('visible');
            return;
        }
        renderStickyParents(getAncestorsForNode(topNode));
    }

    window.__updateStickyParents = updateStickyParentsForSelected;
    treeEl?.addEventListener('scroll', updateStickyParentsForScroll, { passive: true });
}

function attachNodeEvents() {
    if (!state.shadow) return;

    state.shadow.querySelectorAll('.node-header').forEach(header => {
        const node = header.parentElement;
        if (!node) return;

        function selectNode() {
            const name = (node as HTMLElement).dataset.name!;
            const nodeId = (node as HTMLElement).dataset.id!;

            state.shadow!.querySelectorAll('.node-header.selected').forEach(el => el.classList.remove('selected'));
            header.classList.add('selected');

            const treeNode = findNodeById(state.DISPLAY_TREE, nodeId);
            let domEl: any = null;

            if (state.selectedFiber && getFiberName(state.selectedFiber) === name) {
                domEl = state.selectedElement || getDomFromFiber(state.selectedFiber);
            }

            if (!domEl && treeNode) {
                domEl = findBestMatchingElement(state.DISPLAY_TREE, treeNode, nodeId);
            }

            const isRealNode = domEl instanceof Node;
            const isInDocument = isRealNode ? document.contains(domEl) : (domEl?._elements?.some((el: Element) => document.contains(el)) ?? false);

            if (domEl && isInDocument) {
                showSelectedHighlight(domEl, name);
                const treeEl = state.shadow?.querySelector('.tree');
                if (treeEl) {
                    const rect = header.getBoundingClientRect();
                    const treeRect = treeEl.getBoundingClientRect();
                    treeEl.scrollTop += (rect.top - treeRect.top) - (treeRect.height / 2) + (rect.height / 2);
                }
            } else {
                hideSelectedHighlight();
            }

            state.selectedFiber = null;
            state.selectedElement = null;
            return { treeNode, domEl };
        }

        header.addEventListener('click', e => {
            e.stopPropagation(); e.stopImmediatePropagation();
            const target = e.target as HTMLElement;

            if (target.classList.contains('toggle')) {
                const hasChildrenEl = node!.querySelector('.children');
                if (hasChildrenEl) {
                    node!.classList.toggle('collapsed');
                }
                return;
            }

            if (target.classList.contains('info-btn')) {
                const { treeNode, domEl } = selectNode();
                if (window.__updateStickyParents) window.__updateStickyParents();
                if (treeNode) showDetailDialog(treeNode, domEl);
                return;
            }

            if (target.classList.contains('ai-add-btn')) {
                const nodeName = (node as HTMLElement).dataset.name!;
                const nodeFile = (node as HTMLElement).dataset.file || 'unknown';
                const nodeId = (node as HTMLElement).dataset.id!;
                const treeNode = findNodeById(state.DISPLAY_TREE, nodeId);
                const line = treeNode?.source?.lineNumber || 1;
                const ancestry = getAncestryNames(state.DISPLAY_TREE, nodeId);
                addComponentToAiContext(nodeName, nodeFile, line, ancestry);
                if (!state.aiOpen) { state.aiOpen = true; renderAiSection(); }
                return;
            }

            selectNode();
            if (window.__updateStickyParents) window.__updateStickyParents();
        }, { capture: true });

        header.addEventListener('mouseenter', e => {
            e.stopPropagation();
            const name = (node as HTMLElement).dataset.name!;
            const nodeId = (node as HTMLElement).dataset.id!;
            const treeNode = findNodeById(state.DISPLAY_TREE, nodeId);
            if (treeNode) {
                const domEl = findBestMatchingElement(state.DISPLAY_TREE, treeNode, nodeId);
                if (domEl) showHoverHighlight(domEl, name);
            }
        }, { capture: true });

        header.addEventListener('mouseleave', e => {
            e.stopPropagation();
            hideHoverHighlight();
        }, { capture: true });

        header.addEventListener('dblclick', e => {
            e.stopPropagation(); e.stopImmediatePropagation();
            const nodeId = (node as HTMLElement).dataset.id!;
            const treeNode = findNodeById(state.DISPLAY_TREE, nodeId);
            const filePath = treeNode?.source?.fileName || (node as HTMLElement).dataset.file;
            const lineNumber = treeNode?.source?.lineNumber || 1;
            if (filePath && filePath !== 'unknown') {
                const uri = 'cursor://file/' + filePath + ':' + lineNumber;
                window.open(uri);
            }
        }, { capture: true });
    });

}

export function selectTreeNodeById(nodeId: string): boolean {
    if (!state.shadow) return false;
    const nodeEl = state.shadow.querySelector('.node[data-id="' + nodeId + '"]');
    if (!nodeEl) return false;

    let parent = nodeEl.parentElement;
    while (parent && parent !== (state.shadow as any)) {
        if (parent.classList.contains('node') && parent.classList.contains('collapsed')) {
            parent.classList.remove('collapsed');
        }
        parent = parent.parentElement;
    }

    state.shadow.querySelectorAll('.node-header.selected').forEach(el => el.classList.remove('selected'));
    const header = nodeEl.querySelector(':scope > .node-header');
    if (header) {
        header.classList.add('selected');
        setTimeout(() => {
            const treeEl = state.shadow?.querySelector('.tree');
            if (treeEl) {
                const rect = header.getBoundingClientRect();
                const treeRect = treeEl.getBoundingClientRect();
                treeEl.scrollTop += (rect.top - treeRect.top) - (treeRect.height / 2) + (rect.height / 2);
            }
            if (window.__updateStickyParents) window.__updateStickyParents();
        }, 100);
    }
    return true;
}

export function selectTreeNodeByStack(stack: string[]): string | null {
    const result = findNodeByAncestry(state.DISPLAY_TREE, stack, '', []);
    if (result && selectTreeNodeById(result.nodeId)) return result.nodeId;

    for (let i = 1; i < stack.length; i++) {
        const shiftedStack = stack.slice(i);
        const fallback = findNodeByAncestry(state.DISPLAY_TREE, shiftedStack, '', []);
        if (fallback && selectTreeNodeById(fallback.nodeId)) return fallback.nodeId;
    }

    for (const name of stack) {
        const fallback = findFirstNodeWithName(state.DISPLAY_TREE, name);
        if (fallback && selectTreeNodeById(fallback.nodeId)) return fallback.nodeId;
    }
    return null;
}

callbacks.render = renderPanel;
