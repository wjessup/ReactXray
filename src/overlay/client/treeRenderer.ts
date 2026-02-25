import { state } from './state';
import { getStaticComponent } from './logic';
import { escapeHtml, hasAnyFiberDescendant, h } from './utils';

export function nodeMatchesSearch(node: any, term: string): boolean {
    if (!term) return true;
    const lower = term.toLowerCase();
    if ((node.component?.name || '').toLowerCase().includes(lower)) return true;
    if ((node.file || '').toLowerCase().includes(lower)) return true;
    for (const child of node.children) {
        if (nodeMatchesSearch(child, term)) return true;
    }
    return false;
}

export function isPathIgnored(filePath: string) {
    if (!filePath || state.ignoredPaths.length === 0) return false;
    const normalizedPath = filePath.toLowerCase();
    for (const pattern of state.ignoredPaths) {
      if (!pattern.trim()) continue;
      const normalizedPattern = pattern.toLowerCase().trim();
      if (normalizedPath.includes(normalizedPattern)) return true;
    }
    return false;
}

export function filterIgnoredNodes(nodes: any[]): any[] {
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

export function renderTree(nodes: any[], depth = 0, prefix = ''): string {
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

        const nodeClasses = ['node', matches ? '' : 'hidden', isServerOnly ? 'server-only' : '', isBridge ? 'bridge' : ''].filter(Boolean).join(' ');
        const childrenHtml = hasChildren ? '<div class="children">' + renderTree(node.children, depth + 1, nodeId) + '</div>' : '';

        return `
        <div class="${nodeClasses}" data-depth="${depth}" data-name="${name}" data-file="${rawFile}" data-id="${nodeId}">
          <div class="node-header">
            <span class="toggle">${hasChildren ? '▼' : '•'}</span>
            <span class="name">${escapeHtml(name)}</span>
            ${badgesHtml}
            ${propsHtml}
            ${hooksHtml}
            ${dataFlowHtml}
            <span class="info-btn" title="View details">ℹ</span>
            <span class="ai-add-btn" title="Add to AI context">+✨</span>
            ${renderCountHtml}
            <span class="file ${hasSource ? 'has-source' : ''}" title="${escapeHtml(rawFile)}">${escapeHtml(fileDisplay)}</span>
          </div>
          ${childrenHtml}
        </div>
      `;
    }).join('');
}

export function renderList(container: HTMLElement) {
    container.innerHTML = '';
    
    if (state.isLoading) {
        container.appendChild(h('div', { className: 'loading' },
            h('div', { className: 'loading-spinner' }),
            h('div', { className: 'loading-text' }, 'Analyzing components...')
        ));
        return;
    }
    
    if (!state.DEPS || !state.DEPS.components) {
        const text = h('div', { className: 'loading-text' }, 'No dependency analysis available for this route.');
        text.appendChild(h('br'));
        text.appendChild(h('br'));
        text.appendChild(document.createTextNode('Run '));
        text.appendChild(h('code', null, 'npx repo-analyzer analyze deps'));
        text.appendChild(document.createTextNode(' to generate stats.'));
        
        container.appendChild(h('div', { className: 'loading' }, text));
        return;
    }
    
    const comps = [...state.DEPS.components].sort((a: any, b: any) => a.name.localeCompare(b.name));

    comps.forEach((c: {name: string, filePath: string, type: string}) => {
        let badgeClass = 'client';
        if (c.type === 'feature') badgeClass = 'condition-active';
        if (c.type === 'shared') badgeClass = 'server rsc';
        if (c.type === 'unique') badgeClass = 'nextjs';
        
        const node = h('div', { className: 'node', dataset: { name: c.name, file: c.filePath, id: `list-${c.name}` } },
            h('div', { className: 'node-header' },
                h('span', { className: 'name' }, c.name),
                h('span', { className: `badge ${badgeClass}`, title: `Type: ${c.type}` }, c.type),
                h('span', { className: 'file has-source', title: c.filePath }, c.filePath)
            )
        );
        container.appendChild(node);
    });
}

export function renderTreeContainer(container: HTMLElement) {
    if (state.viewMode === 'list') {
        renderList(container);
    } else {
        const treeContent = state.isLoading
            ? '<div class="loading"><div class="loading-spinner"></div><div class="loading-text">Analyzing components...</div></div>'
            : state.DISPLAY_TREE.length === 0
                ? '<div class="loading"><div class="loading-text">No components found</div></div>'
                : renderTree(state.DISPLAY_TREE);
        container.innerHTML = treeContent;
    }
}
