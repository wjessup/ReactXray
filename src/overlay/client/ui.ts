import { callbacks, state } from './state';
import {
    escapeHtml,
    findBestMatchingElement,
    findFirstNodeWithName,
    findNodeByAncestry,
    findNodeById,
    getDomFromFiber,
    getFiberName,
    hasAnyFiberDescendant,
} from './utils';
import { hideHoverHighlight, hideSelectedHighlight, showHoverHighlight, showSelectedHighlight } from './highlight';
import { showDetailDialog } from './details';
import { getFilterEnabled, getStaticComponent, refreshAnalysis, toggle, toggleFilter } from './logic';
import { showSettingsDialog } from './settings';

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
        const hasFiber = node.hasFiber;

        const instanceCount = node.instances?.length || 0;
        const hasInstances = instanceCount > 1;
        const isExpanded = state.expandedInstanceGroups.has(nodeId);
        const selectedIdx = state.selectedInstanceByGroup.get(nodeId) ?? -1;

        const badges = [];

        if (staticComp?.nextjsFileType) {
            const fileTypeIcons: Record<string, string> = { page: '📄', layout: '📐', loading: '⏳', error: '⚠️', template: '📋', 'not-found': '🔍' };
            const fileTypeDescriptions: Record<string, string> = {
                page: 'Next.js Page — Route entry point that renders at this URL path',
                layout: 'Next.js Layout — Shared UI wrapper that persists across child routes',
                loading: 'Next.js Loading — Suspense fallback shown while route loads',
                error: 'Next.js Error Boundary — Catches and displays errors in this route segment',
                template: 'Next.js Template — Like layout but re-mounts on navigation',
                'not-found': 'Next.js Not Found — Shown when route segment has no match'
            };
            const icon = fileTypeIcons[staticComp.nextjsFileType] || '';
            const desc = fileTypeDescriptions[staticComp.nextjsFileType] || staticComp.nextjsFileType;
            if (icon) badges.push('<span class="badge nextjs" title="' + desc + '">' + icon + '</span>');
        }

        if (isBridge) {
            badges.push('<span class="badge client bridge" title="\'use client\' — ACTIVE (solid blue)&#10;&#10;This file has \'use client\' AND is currently hydrated/running in the browser.&#10;&#10;• Found in React\'s fiber tree (actively rendered)&#10;• Component is mounted and interactive&#10;• Can inspect live props, state, hooks">\'use client\'</span>');
        } else if (staticComp?.isClientComponent) {
            badges.push('<span class="badge client" title="\'use client\' — NOT ACTIVE (faded blue)&#10;&#10;This file has \'use client\' but is NOT currently in the React fiber tree.&#10;&#10;Possible reasons:&#10;• Component is conditionally hidden (CSS/responsive)&#10;• Component hasn\'t mounted yet&#10;• Component is inside an unrendered branch">\'use client\' ⏸</span>');
        } else if (isServerOnly && !hasFiber) {
            badges.push('<span class="badge server rsc" title="SERVER ONLY (solid green)&#10;&#10;This component runs ONLY on the server — zero JavaScript sent to browser.">SERVER ONLY</span>');
        } else if (hasFiber && !staticComp?.isClientComponent) {
            badges.push('<span class="badge client inherited" title="RUNS ON CLIENT (inherited, dashed blue)&#10;&#10;This file has NO \'use client\' directive, but runs on the client anyway!&#10;&#10;A parent component with \'use client\' imports this file.">↳ client</span>');
        } else if (!staticComp?.isClientComponent && staticComp && !hasFiber) {
            badges.push('<span class="badge server" title="SERVER COMPONENT (green)&#10;&#10;This component renders on the server.">SERVER</span>');
        }

        if (hasInstances) {
            const instanceBadge = '<span class="badge instance-count" data-group="' + nodeId + '" title="' + instanceCount + ' instances of this component. Click to ' + (isExpanded ? 'collapse' : 'expand') + '.">(x' + instanceCount + ')</span>';
            badges.push(instanceBadge);
        }

        if (node.renderCondition) {
            const cond = node.renderCondition;
            const isActive = hasFiber || hasAnyFiberDescendant(node);
            const activeLabel = isActive ? ' ACTIVE' : ' INACTIVE';
            const activeClass = isActive ? ' condition-active' : ' condition-inactive';
            const condBadge = cond.branch === 'true'
                ? '<span class="badge condition-true' + activeClass + '" title="Renders when: ' + escapeHtml(cond.expression) + '&#10;&#10;' + (isActive ? 'Currently ACTIVE' : 'Currently INACTIVE') + '">✓ ' + escapeHtml(cond.expression) + activeLabel + '</span>'
                : '<span class="badge condition-false' + activeClass + '" title="Renders when NOT: ' + escapeHtml(cond.expression) + '&#10;&#10;' + (isActive ? 'Currently ACTIVE' : 'Currently INACTIVE') + '">✗ ' + escapeHtml(cond.expression) + activeLabel + '</span>';
            badges.push(condBadge);
        }

        const hooksCount = staticComp?.hooks?.length || 0;
        const hooksHtml = hooksCount > 0 ? '<span class="hooks" title="' + staticComp.hooks.join(', ') + '">⚡' + hooksCount + '</span>' : '';

        const propsCount = staticComp?.props?.length || 0;
        const propsHtml = propsCount > 0 ? '<span class="props-count" title="' + staticComp.props.map((p: any) => p.name + (p.optional ? '?' : '')).join(', ') + '">📌' + propsCount + '</span>' : '';

        const dataFlow = staticComp?.childDataFlow || [];
        const serverDataPassed = dataFlow.flatMap((f: any) =>
            Object.entries(f.props)
                .filter(([, v]: [string, any]) => v.source === 'serverQuery')
                .map(([k, v]: [string, any]) => f.component + '.' + k + ' <- ' + v.query + '()')
        );
        const dataFlowHtml = serverDataPassed.length > 0
            ? '<span class="data-flow" title="' + serverDataPassed.join('\\n') + '">📥' + serverDataPassed.length + '</span>'
            : '';

        const badgesHtml = badges.join('');

        const renderCountHtml = isServerOnly
            ? '<span class="render-count server-only" title="Server-rendered">—</span>'
            : '<span class="render-count" style="' + (renderCount === 0 ? 'opacity:0.3' : '') + '">' + renderCount + '</span>';

        let instanceRowsHtml = '';
        if (hasInstances && isExpanded) {
            const maxToShow = Math.min(instanceCount, 200);
            let rows = '';
            for (let idx = 0; idx < maxToShow; idx++) {
                const instId = nodeId + ':' + idx;
                const isSelected = idx === selectedIdx;
                rows += '<div class="instance-row' + (isSelected ? ' selected' : '') + '" data-instance-id="' + instId + '" data-group="' + nodeId + '" data-idx="' + idx + '"><span class="instance-label">' + name + ' (' + (idx + 1) + '/' + instanceCount + ')</span></div>';
            }
            if (instanceCount > 200) {
                rows += '<div class="instance-row capped">...and ' + (instanceCount - 200) + ' more</div>';
            }
            instanceRowsHtml = '<div class="instance-list">' + rows + '</div>';
        }

        const nodeClasses = ['node', matches ? '' : 'hidden', isServerOnly ? 'server-only' : '', isBridge ? 'bridge' : ''].filter(Boolean).join(' ');
        const childrenHtml = hasChildren ? '<div class="children">' + renderTree(node.children, depth + 1, nodeId) + '</div>' : '';

        return `
        <div class="${nodeClasses}" data-depth="${depth}" data-name="${name}" data-file="${rawFile}" data-id="${nodeId}">
          <div class="node-header">
            <span class="toggle">${hasChildren || hasInstances ? '▼' : '•'}</span>
            <span class="name">${escapeHtml(name)}</span>
            ${badgesHtml}
            ${propsHtml}
            ${hooksHtml}
            ${dataFlowHtml}
            <span class="info-btn" title="View details">ℹ</span>
            ${renderCountHtml}
            <span class="file ${hasSource ? 'has-source' : ''}" title="${escapeHtml(rawFile)}">${escapeHtml(fileDisplay)}</span>
          </div>
          ${instanceRowsHtml}
          ${childrenHtml}
        </div>
      `;
    }).join('');
}

export function renderPanel() {
    if (!state.container) return;

    if (state.TREE.length === 0 && state.STATIC_TREE.length > 0) {
        state.TREE = JSON.parse(JSON.stringify(state.STATIC_TREE));
    }

    state.DISPLAY_TREE = filterIgnoredNodes(state.TREE);
    const treeContent = state.isLoading
        ? '<div class="loading"><div class="loading-spinner"></div><div class="loading-text">Analyzing components...</div></div>'
        : state.DISPLAY_TREE.length === 0
            ? '<div class="loading"><div class="loading-text">No components found</div></div>'
            : renderTree(state.DISPLAY_TREE);
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
            <div class="stat"><span class="stat-value" style="color:#58a6ff">${state.STATS.clientComponents || 0}</span><span class="stat-label">client</span></div>
            <div class="stat"><span class="stat-value" id="total-renders" style="color:#f85149">${state.totalRenders}</span><span class="stat-label">renders</span></div>
          </div>
          <div class="route">${state.ROUTE}</div>
        </div>
        <div class="search">
          <input type="text" placeholder="Search components..." value="${escapeHtml(state.searchTerm)}">
        </div>
        <div class="tree-container">
          <div class="sticky-parents"></div>
          <div class="tree">${treeContent}</div>
        </div>
      </div>
      <button class="toggle-btn ${state.isOpen ? 'open' : ''}">${state.isOpen ? '✕' : '🔍'}</button>
    `;

    state.container.style.setProperty('--panel-width', state.panelWidth + 'px');
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
            tree.innerHTML = renderTree(state.DISPLAY_TREE);
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
                const nodeId = (node as HTMLElement).dataset.id!;
                const hasInstanceList = node!.querySelector('.instance-list');
                const hasChildrenEl = node!.querySelector('.children');
                if (hasInstanceList || hasChildrenEl) {
                    if (state.expandedInstanceGroups.has(nodeId)) {
                        state.expandedInstanceGroups.delete(nodeId);
                    }
                    node!.classList.toggle('collapsed');
                    if (!node!.classList.contains('collapsed') && !hasInstanceList) {
                        const treeNode = findNodeById(state.DISPLAY_TREE, nodeId);
                        if (treeNode?.instances?.length > 1) {
                            state.expandedInstanceGroups.add(nodeId);
                            const treeEl = state.shadow?.querySelector('.tree');
                            const savedScroll = treeEl ? treeEl.scrollTop : 0;
                            renderPanel();
                            const newTreeEl = state.shadow?.querySelector('.tree');
                            if (newTreeEl) newTreeEl.scrollTop = savedScroll;
                        }
                    }
                }
                return;
            }

            if (target.classList.contains('instance-count')) {
                const groupId = target.dataset.group!;
                if (state.expandedInstanceGroups.has(groupId)) {
                    state.expandedInstanceGroups.delete(groupId);
                } else {
                    state.expandedInstanceGroups.add(groupId);
                }
                const treeEl = state.shadow?.querySelector('.tree');
                const savedScroll = treeEl ? treeEl.scrollTop : 0;
                renderPanel();
                const newTreeEl = state.shadow?.querySelector('.tree');
                if (newTreeEl) newTreeEl.scrollTop = savedScroll;
                return;
            }

            if (target.classList.contains('info-btn')) {
                const { treeNode, domEl } = selectNode();
                if (window.__updateStickyParents) window.__updateStickyParents();
                if (treeNode) showDetailDialog(treeNode, domEl);
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

    state.shadow.querySelectorAll('.instance-row').forEach(row => {
        if (row.classList.contains('capped')) return;

        row.addEventListener('click', e => {
            e.stopPropagation(); e.stopImmediatePropagation();
            const groupId = (row as HTMLElement).dataset.group!;
            const idx = parseInt((row as HTMLElement).dataset.idx!, 10);
            state.selectedInstanceByGroup.set(groupId, idx);

            state.shadow!.querySelectorAll('.instance-row.selected').forEach(el => el.classList.remove('selected'));
            row.classList.add('selected');

            const treeNode = findNodeById(state.DISPLAY_TREE, groupId);
            if (treeNode?.instances?.[idx]) {
                const inst = treeNode.instances[idx];
                const domEl = getDomFromFiber(inst.fiber);
                const name = treeNode.component?.name || '—';
                if (domEl) {
                    showSelectedHighlight(domEl, name + ' (' + (idx + 1) + ')');
                    const treeEl = state.shadow?.querySelector('.tree');
                    if (treeEl) {
                        const rect = row.getBoundingClientRect();
                        const treeRect = treeEl.getBoundingClientRect();
                        treeEl.scrollTop += (rect.top - treeRect.top) - (treeRect.height / 2) + (rect.height / 2);
                    }
                }
            }
        }, { capture: true });

        row.addEventListener('mouseenter', e => {
            e.stopPropagation();
            const groupId = (row as HTMLElement).dataset.group!;
            const idx = parseInt((row as HTMLElement).dataset.idx!, 10);
            const treeNode = findNodeById(state.DISPLAY_TREE, groupId);
            if (treeNode?.instances?.[idx]) {
                const inst = treeNode.instances[idx];
                const domEl = getDomFromFiber(inst.fiber);
                const name = treeNode.component?.name || '—';
                if (domEl) showHoverHighlight(domEl, name + ' (' + (idx + 1) + ')');
            }
        }, { capture: true });

        row.addEventListener('mouseleave', e => {
            e.stopPropagation();
            hideHoverHighlight();
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
