import { state, callbacks } from './state';
import { escapeHtml, formatValue, extractSourceLocation } from './utils';
import { 
    buildDataFlowGraph, 
    detectPotentialIssues, 
    detectRefactoringOpportunities, 
    generateLLMExport, 
    generateMermaidDiagram,
    getLiveComponentData,
    getLiveHooks,
    getArchSmellsForComponent,
    getArchUsageForComponent,
    getArchSimilarForComponent,
    getPropFlow,
    getPropUpwardFlow,
    countTreeNodes
} from './logic-details';
import { getStaticComponent } from './logic';

let detailOverlay: HTMLElement | null = null;
let currentDetailNode: any = null;
let currentDetailDomEl: any = null;
let currentTab = 'props';
let currentDataFlowGraph: any = null;
let currentSourceCode: string | null = null;
let sourceLoadingState = 'idle';
let selectedProp: string | null = null;
const sourceCache = new Map<string, string>();
let scrollLockCount = 0;
let scrollLockState: any = null;

// Helper variables for Highlight.js loading
let hljsLoaded = false;
let hljsLoading = false;
let hljsStylesInjected = false;

export function showDetailDialog(node: any, domEl: any) {
    currentDetailNode = node;
    currentDetailDomEl = domEl;
    currentTab = 'props';
    currentSourceCode = null;
    sourceLoadingState = 'idle';

    if (!detailOverlay) {
        detailOverlay = document.createElement('div');
        detailOverlay.className = 'detail-overlay';
        detailOverlay.style.display = 'none';
        state.shadow?.appendChild(detailOverlay);

        detailOverlay.addEventListener('click', e => {
            e.stopPropagation(); e.stopImmediatePropagation();
            if (e.target === detailOverlay || (e.target as Element).classList.contains('detail-close')) hideDetailDialog();
            
            const target = e.target as HTMLElement;
            if (target.classList.contains('detail-tab')) {
                const newTab = target.dataset.tab;
                if (newTab && newTab !== currentTab) {
                    currentTab = newTab;
                    selectedProp = null;
                    if (newTab === 'source' && !currentSourceCode) {
                        const node = currentDetailNode;
                        const staticComp = node?.component?.name ? getStaticComponent(node.component.name) : null;
                        const filePath = node?.source?.fileName || node?.file || staticComp?.filePath;
                        if (filePath && filePath !== 'unknown') {
                            sourceLoadingState = 'loading';
                            renderDetailContent();
                            Promise.all([loadHighlightJs(), fetchSourceCode(filePath)]).then(([_, code]) => {
                                currentSourceCode = code;
                                sourceLoadingState = 'done';
                                renderDetailContent();
                            });
                        } else {
                            renderDetailContent();
                        }
                    } else {
                        renderDetailContent();
                    }
                }
            }
            if (target.classList.contains('source-copy-btn')) {
                if (currentSourceCode) {
                    navigator.clipboard.writeText(currentSourceCode);
                    target.textContent = '✓ Copied!';
                    setTimeout(() => { target.textContent = '📋 Copy'; }, 1500);
                }
            }
            
            const propRow = target.closest('.prop-row.has-flow') as HTMLElement;
            if (propRow) {
                const propName = propRow.dataset.prop;
                if (propName) {
                    selectedProp = selectedProp === propName ? null : propName;
                    renderDetailContent();
                }
            }
            
            const treeHeader = target.closest('.prop-tree-header.clickable') as HTMLElement;
            if (treeHeader) {
                const sourceFile = treeHeader.dataset.sourceFile;
                const sourceLine = parseInt(treeHeader.dataset.sourceLine || '0', 10);
                if (sourceFile && sourceLine) {
                    jumpToSourceLine(sourceFile, sourceLine);
                }
            }
            
            if (target.classList.contains('source-open-btn')) {
                const node = currentDetailNode;
                const staticComp = node?.component?.name ? getStaticComponent(node.component.name) : null;
                const filePath = node?.source?.fileName || node?.file || staticComp?.filePath;
                const lineNumber = node?.source?.lineNumber || 1;
                if (filePath && filePath !== 'unknown') {
                    const uri = 'cursor://file/' + filePath + ':' + lineNumber;
                    window.open(uri);
                }
            }
            
            if (target.classList.contains('copy-llm-btn')) {
                const node = currentDetailNode;
                const domEl = currentDetailDomEl;
                const comp = node?.component;
                const compName = comp?.name;
                const live = domEl && compName ? getLiveComponentData(domEl, compName) : { props: {}, state: [] };
                const liveHooks = domEl && compName ? getLiveHooks(domEl, compName) : [];
                const exportData = generateLLMExport(currentDataFlowGraph, node, live.props || {}, liveHooks);
                navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
                target.textContent = '✓ Copied!';
                setTimeout(() => { target.textContent = '📋 Copy for LLM'; }, 1500);
            }
            
            if (target.classList.contains('copy-mermaid-btn')) {
                const mermaid = generateMermaidDiagram(currentDataFlowGraph);
                navigator.clipboard.writeText(mermaid.replace(/\\\\n/g, '\\n'));
                target.textContent = '✓ Copied!';
                setTimeout(() => { target.textContent = '📊 Copy Mermaid'; }, 1500);
            }
        }, { capture: true });
    }

    renderDetailContent();
    const wasOpen = detailOverlay.style.display === 'flex';
    if (!wasOpen) lockPageScroll();
    detailOverlay.style.display = 'flex';
}

export function hideDetailDialog() {
    if (!detailOverlay) return;
    const wasOpen = detailOverlay.style.display === 'flex';
    detailOverlay.style.display = 'none';
    currentDetailNode = null;
    currentDetailDomEl = null;
    if (wasOpen) unlockPageScroll();
}

function lockPageScroll() {
    scrollLockCount++;
    if (scrollLockCount !== 1) return;
    const y = window.scrollY || 0;
    scrollLockState = {
        y,
        htmlOverflow: document.documentElement.style.overflow,
        bodyOverflow: document.body.style.overflow,
        bodyPosition: document.body.style.position,
        bodyTop: document.body.style.top,
        bodyWidth: document.body.style.width,
    };
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = -y + 'px';
    document.body.style.width = '100%';
}

function unlockPageScroll() {
    if (scrollLockCount === 0) return;
    scrollLockCount--;
    if (scrollLockCount !== 0) return;
    if (!scrollLockState) return;
    document.documentElement.style.overflow = scrollLockState.htmlOverflow;
    document.body.style.overflow = scrollLockState.bodyOverflow;
    document.body.style.position = scrollLockState.bodyPosition;
    document.body.style.top = scrollLockState.bodyTop;
    document.body.style.width = scrollLockState.bodyWidth;
    const y = scrollLockState.y || 0;
    scrollLockState = null;
    window.scrollTo(0, y);
}

async function fetchSourceCode(filePath: string): Promise<string | null> {
    if (!filePath || filePath === 'unknown') return null;
    if (sourceCache.has(filePath)) return sourceCache.get(filePath)!;
    
    try {
        const res = await fetch('/__source_file?path=' + encodeURIComponent(filePath));
        if (!res.ok) return null;
        const data = await res.json();
        sourceCache.set(filePath, data.content);
        return data.content;
    } catch (err) {
        console.warn('[Overlay] Failed to fetch source:', err);
        return null;
    }
}

let pendingScrollLine: number | null = null;

async function jumpToSourceLine(filePath: string, lineNumber: number) {
    currentTab = 'source';
    selectedProp = null;
    pendingScrollLine = lineNumber;
    
    if (!sourceCache.has(filePath)) {
        sourceLoadingState = 'loading';
        renderDetailContent();
        const [_, code] = await Promise.all([loadHighlightJs(), fetchSourceCode(filePath)]);
        currentSourceCode = code;
        sourceLoadingState = 'done';
    } else {
        currentSourceCode = sourceCache.get(filePath)!;
    }
    
    renderDetailContent();
    
    setTimeout(() => {
        if (pendingScrollLine && detailOverlay) {
            const codeEl = detailOverlay.querySelector('.source-code pre code');
            if (codeEl) {
                const lineHeight = 18;
                const scrollTop = (pendingScrollLine - 10) * lineHeight;
                const container = codeEl.closest('.source-code');
                if (container) {
                    container.scrollTop = Math.max(0, scrollTop);
                }
            }
            pendingScrollLine = null;
        }
    }, 100);
}

async function loadHighlightJs() {
    if (hljsLoaded || hljsLoading) return;
    hljsLoading = true;
    
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js';
    
    await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
    
    const tsScript = document.createElement('script');
    tsScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/typescript.min.js';
    await new Promise((resolve, reject) => {
        tsScript.onload = resolve;
        tsScript.onerror = reject;
        document.head.appendChild(tsScript);
    });
    
    if (!hljsStylesInjected && state.shadow) {
        const hljsStyles = document.createElement('style');
        hljsStyles.textContent = `
            .hljs{color:#abb2bf;background:#282c34}
            .hljs-comment,.hljs-quote{color:#5c6370;font-style:italic}
            .hljs-doctag,.hljs-keyword,.hljs-formula{color:#c678dd}
            .hljs-section,.hljs-name,.hljs-selector-tag,.hljs-deletion,.hljs-subst{color:#e06c75}
            .hljs-literal{color:#56b6c2}
            .hljs-string,.hljs-regexp,.hljs-addition,.hljs-attribute,.hljs-meta .hljs-string{color:#98c379}
            .hljs-attr,.hljs-variable,.hljs-template-variable,.hljs-type,.hljs-selector-class,.hljs-selector-attr,.hljs-selector-pseudo,.hljs-number{color:#d19a66}
            .hljs-symbol,.hljs-bullet,.hljs-link,.hljs-meta,.hljs-selector-id,.hljs-title{color:#61aeee}
            .hljs-built_in,.hljs-title.class_,.hljs-class .hljs-title{color:#e6c07b}
            .hljs-emphasis{font-style:italic}
            .hljs-strong{font-weight:700}
            .hljs-link{text-decoration:underline}
        `;
        state.shadow.appendChild(hljsStyles);
        hljsStylesInjected = true;
    }
    
    hljsLoaded = true;
    hljsLoading = false;
}

function highlightCode(code: string, language?: string) {
    // @ts-ignore
    if (window.hljs && hljsLoaded) {
        try {
            // @ts-ignore
            const result = window.hljs.highlight(code, { language: language || 'typescript', ignoreIllegals: true });
            return result.value;
        } catch (e) {
            console.warn('[Overlay] hljs highlight failed:', e);
            return escapeHtml(code);
        }
    }
    return escapeHtml(code);
}

function renderSourceCode(code: string | null, filePath: string) {
    if (!code) return '<div class="detail-empty">Source not available</div>';
    
    const ext = filePath.split('.').pop() || 'tsx';
    const langMap: Record<string, string> = { tsx: 'typescript', ts: 'typescript', jsx: 'javascript', js: 'javascript', css: 'css', json: 'json' };
    const language = langMap[ext] || 'typescript';
    
    const highlighted = highlightCode(code, language);
    
    return '<div class="source-container"><div class="source-header"><span class="source-path">' + escapeHtml(filePath) + '</span><button class="source-copy-btn" title="Copy source">📋 Copy</button><button class="source-open-btn" title="Open in editor">↗ Open</button></div><div class="source-code"><pre><code class="hljs language-' + language + '">' + highlighted + '</code></pre></div></div>';
}

function renderTreeNode(node: any, depth: number): string {
    if (depth > 4) return '';
    
    const hasSourceLink = node.parentFile && node.line;
    const clickData = hasSourceLink ? ' data-source-file="' + node.parentFile + '" data-source-line="' + node.line + '"' : '';
    const clickableClass = hasSourceLink ? ' clickable' : '';
    
    let html = '<div class="prop-tree-node" style="margin-left: ' + (depth * 16) + 'px">';
    
    html += '<div class="prop-tree-header' + clickableClass + '"' + clickData + '>';
    html += '<span class="prop-tree-comp">' + node.componentName + '</span>';
    html += '<span class="prop-tree-dot">.</span>';
    html += '<span class="prop-tree-prop">' + node.propName + '</span>';
    
    if (node.fullPath && node.fullPath.includes('.')) {
        const path = node.fullPath;
        html += '<span class="prop-tree-access">' + path + '</span>';
    } else if (node.fullPath && node.fullPath.includes('→')) {
        html += '<span class="prop-tree-rename">⚠️ rename</span>';
    }
    
    if (hasSourceLink) {
        html += '<span class="prop-tree-goto" title="Jump to source">→</span>';
    }
    html += '</div>';
    
    if (node.children && node.children.length > 0) {
        html += '<div class="prop-tree-children">';
        for (const child of node.children) {
            html += '<div class="prop-tree-branch">';
            html += '<span class="prop-tree-line">├─</span>';
            html += renderTreeNode(child, depth + 1);
            html += '</div>';
        }
        html += '</div>';
    }
    
    html += '</div>';
    return html;
}

function renderPropFlowGraph(flowData: any, highlightProp: string | null, compName: string) {
    if (!flowData || !flowData.root) {
        return '<div class="prop-flow-empty">No flow data</div>';
    }

    const upwardFlow = getPropUpwardFlow(compName, flowData.propName);
    let html = '<div class="prop-flow-graph">';
    
    if (upwardFlow && upwardFlow.usages && upwardFlow.usages.length > 0) {
        html += '<div class="prop-upward-section">';
        html += '<div class="prop-section-label">⬆ WHERE IT COMES FROM</div>';
        
        for (const usage of upwardFlow.usages) {
            html += '<div class="prop-upward-path">';
            
            if (usage.upstreamChain && usage.upstreamChain.length > 0) {
                for (let i = usage.upstreamChain.length - 1; i >= 0; i--) {
                    const node = usage.upstreamChain[i];
                    const isTerminal = node.isTerminal;
                    const terminalClass = isTerminal ? ' terminal' : '';
                    const sourceClass = node.sourceType === 'hook' ? ' hook' : node.sourceType === 'query' ? ' query' : node.sourceType === 'context' ? ' context' : '';
                    
                    html += '<div class="prop-upstream-node' + terminalClass + sourceClass + '">';
                    html += '<span class="prop-upstream-comp">' + node.componentName + '</span>';
                    if (node.propName) {
                        html += '<span class="prop-upstream-via">.' + node.propName + '</span>';
                    }
                    html += '<span class="prop-upstream-source">' + node.sourceName + '</span>';
                    if (isTerminal) {
                        html += '<span class="prop-upstream-terminal-badge ' + node.sourceType + '">' + node.sourceType.toUpperCase() + '</span>';
                    }
                    html += '</div>';
                    
                    if (i > 0) {
                        html += '<div class="prop-upstream-arrow">↓</div>';
                    }
                }
            } else {
                html += '<div class="prop-upstream-node' + (usage.valueSource.type !== 'prop' ? ' terminal ' + usage.valueSource.type : '') + '">';
                html += '<span class="prop-upstream-comp">' + usage.parentComponent + '</span>';
                html += '<span class="prop-upstream-source">' + usage.valueSource.expression + '</span>';
                if (usage.valueSource.type !== 'prop' && usage.valueSource.type !== 'computed') {
                    html += '<span class="prop-upstream-terminal-badge ' + usage.valueSource.type + '">' + usage.valueSource.type.toUpperCase() + '</span>';
                }
                html += '</div>';
            }
            
            html += '</div>';
        }
        
        html += '<div class="prop-flow-connector"><span class="prop-flow-arrow">↓</span></div>';
        html += '</div>';
    } else if (flowData.origin && flowData.origin.type !== 'prop') {
        html += '<div class="prop-flow-origin">';
        html += '<span class="prop-flow-origin-label">⬆ Origin:</span>';
        html += '<span class="prop-flow-origin-value">' + flowData.origin.name + '</span>';
        if (flowData.origin.type === 'hook') {
            html += '<span class="prop-flow-origin-type">hook</span>';
        } else if (flowData.origin.type === 'query') {
            html += '<span class="prop-flow-origin-type">server</span>';
        }
        html += '</div>';
        html += '<div class="prop-flow-connector"><span class="prop-flow-arrow">↓</span></div>';
    } else if (flowData.origin && flowData.origin.type === 'prop') {
        html += '<div class="prop-flow-origin">';
        html += '<span class="prop-flow-origin-label">⬆ From parent:</span>';
        html += '<span class="prop-flow-origin-value">' + flowData.origin.name + '</span>';
        html += '</div>';
        html += '<div class="prop-flow-connector"><span class="prop-flow-arrow">↓</span></div>';
    }

    if (flowData.root.children && flowData.root.children.length > 0) {
        html += '<div class="prop-downward-section">';
        html += '<div class="prop-section-label">⬇ WHERE IT FLOWS TO</div>';
        html += renderTreeNode(flowData.root, 0);
        html += '</div>';
    } else {
        html += renderTreeNode(flowData.root, 0);
    }

    html += '</div>';
    return html;
}

function formatSmellType(type: string) {
    const labels: Record<string, string> = {
        'excessive-renaming': '🔄 Excessive Renaming',
        'circular-naming': '🔁 Circular Naming',
        'pass-through': '📦 Pass-Through',
        'no-op-function': '🚫 No-Op Function',
        'prop-drilling': '⬇️ Prop Drilling',
        'similar-components': '👯 Similar Components',
        'type-duplication': '📋 Type Duplication',
    };
    return labels[type] || type;
}

function renderArchitectureTab(compName: string, smells: any[], usage: any) {
    let html = '';

    if (!state.ARCHITECTURE) {
        return '<div class="detail-empty">Architecture analysis not available</div>';
    }

    const totalSmells = state.ARCHITECTURE.smells?.length || 0;
    const totalPassThrough = state.ARCHITECTURE.passThroughComponents?.length || 0;
    const totalNoOps = state.ARCHITECTURE.noOpFunctions?.length || 0;

    html += '<div class="arch-section">';
    html += '<h4 class="arch-section-title">📊 Route Overview</h4>';
    html += '<div class="arch-stat-row">';
    html += '<span class="arch-stat-label">Total issues found:</span>';
    html += '<span class="arch-stat-value">' + totalSmells + '</span>';
    html += '</div>';
    if (totalPassThrough > 0) {
        html += '<div class="arch-stat-row">';
        html += '<span class="arch-stat-label">Pass-through components:</span>';
        html += '<span class="arch-stat-value">' + totalPassThrough + '</span>';
        html += '</div>';
    }
    if (totalNoOps > 0) {
        html += '<div class="arch-stat-row">';
        html += '<span class="arch-stat-label">No-op functions:</span>';
        html += '<span class="arch-stat-value">' + totalNoOps + '</span>';
        html += '</div>';
    }
    html += '</div>';

    if (usage && usage.totalUsages > 0) {
        html += '<div class="arch-section">';
        html += '<h4 class="arch-section-title">📍 Usage Context</h4>';
        
        html += '<div class="arch-stat-row">';
        html += '<span class="arch-stat-label">Total usages:</span>';
        html += '<span class="arch-stat-value">' + usage.totalUsages + '</span>';
        html += '</div>';
        
        if (usage.usedInComponents && usage.usedInComponents.length > 0) {
            html += '<div class="arch-stat-row">';
            html += '<span class="arch-stat-label">Used by:</span>';
            html += '<span class="arch-stat-value">' + usage.usedInComponents.slice(0, 5).join(', ');
            if (usage.usedInComponents.length > 5) html += ' +' + (usage.usedInComponents.length - 5) + ' more';
            html += '</span>';
            html += '</div>';
        }
        
        if (usage.pageContexts && usage.pageContexts.length > 0) {
            html += '<div class="arch-stat-row">';
            html += '<span class="arch-stat-label">Page contexts:</span>';
            html += '<span class="arch-stat-value">' + usage.pageContexts.length + ' pages</span>';
            html += '</div>';
            html += '<div class="arch-pages">';
            for (const ctx of usage.pageContexts.slice(0, 5)) {
                html += '<div class="arch-page-badge">' + ctx + '</div>';
            }
            if (usage.pageContexts.length > 5) {
                html += '<div class="arch-page-badge">+' + (usage.pageContexts.length - 5) + ' more</div>';
            }
            html += '</div>';
        }
        
        html += '</div>';
    }

    const similar = getArchSimilarForComponent(compName);
    if (similar && similar.length > 0) {
        html += '<div class="arch-section">';
        html += '<h4 class="arch-section-title">🔄 Similar Components</h4>';
        for (const sim of similar.slice(0, 5)) {
            const pct = Math.round(sim.similarity * 100);
            html += '<div class="arch-similar-item">';
            html += '<span class="arch-similar-name">' + sim.name + '</span>';
            html += '<span class="arch-similar-pct">' + pct + '% similar</span>';
            if (sim.sharedProps && sim.sharedProps.length > 0) {
                html += '<div class="arch-similar-props">Shared: ' + sim.sharedProps.slice(0, 4).join(', ');
                if (sim.sharedProps.length > 4) html += ' +' + (sim.sharedProps.length - 4);
                html += '</div>';
            }
            html += '</div>';
        }
        html += '</div>';
    }

    if (smells && smells.length > 0) {
        html += '<div class="arch-section">';
        html += '<h4 class="arch-section-title">⚠️ Issues for ' + compName + '</h4>';
        for (const smell of smells) {
            const severityClass = smell.severity === 'error' ? 'smell-error' : smell.severity === 'warning' ? 'smell-warning' : 'smell-info';
            html += '<div class="arch-smell ' + severityClass + '">';
            html += '<div class="arch-smell-type">' + formatSmellType(smell.type) + '</div>';
            html += '<div class="arch-smell-msg">' + smell.message + '</div>';
            html += '<div class="arch-smell-suggestion">💡 ' + smell.suggestion + '</div>';
            html += '</div>';
        }
        html += '</div>';
    }

    if (state.ARCHITECTURE.passThroughComponents) {
        const passThrough = state.ARCHITECTURE.passThroughComponents.find((p: any) => p.name === compName);
        if (passThrough) {
            html += '<div class="arch-section">';
            html += '<h4 class="arch-section-title">📦 Pass-Through Analysis</h4>';
            html += '<div class="arch-passthrough">';
            html += '<div class="arch-passthrough-bar">';
            html += '<div class="arch-passthrough-fill" style="width: ' + Math.round(passThrough.ratio * 100) + '%"></div>';
            html += '</div>';
            html += '<div class="arch-passthrough-label">';
            html += passThrough.propsPassedThrough + ' of ' + passThrough.propsReceived + ' props passed through';
            html += '</div>';
            html += '</div>';
            html += '</div>';
        }
    }

    // if (state.ARCHITECTURE.smells && state.ARCHITECTURE.smells.length > 0 && smells.length === 0) {
    //     // Optionally show global issues
    // }

    return html;
}

function renderDetailContent() {
    if (!detailOverlay || !currentDetailNode) return;

    const node = currentDetailNode;
    const domEl = currentDetailDomEl;
    const file = node.file;
    const comp = node.component;
    const compName = comp?.name || 'Unknown';
    const staticComp = comp?.name ? getStaticComponent(comp.name) : null;
    const source = node.source;
    
    // const hasFile = file && file !== 'unknown';
    // const hasSource = !!source;
    
    const live = domEl && compName ? getLiveComponentData(domEl, compName) : { props: {}, state: [] };
    const liveHooks = domEl && compName ? getLiveHooks(domEl, compName) : [];
    
    currentDataFlowGraph = buildDataFlowGraph(node, domEl, live.props || {}, liveHooks);

    const issues = detectPotentialIssues(currentDataFlowGraph, staticComp);
    const refactorHints = detectRefactoringOpportunities(currentDataFlowGraph, staticComp);
    const smells = getArchSmellsForComponent(compName);
    const archUsage = getArchUsageForComponent(compName);

    // Header logic
    let headerHtml = `
        <h2 class="detail-title">${compName}</h2>
        <div class="detail-subtitle">
            <span class="detail-file">${escapeHtml(file)}</span>
    `;
    
    if (staticComp?.isClientComponent) headerHtml += '<span class="badge client">Use Client</span>';
    if (staticComp?.isServerComponent) headerHtml += '<span class="badge server">Server Component</span>';
    
    headerHtml += '</div>';
    
    // Tabs logic
    const tabs = [
        { id: 'props', label: 'Props', count: currentDataFlowGraph.propOrigins.length },
        { id: 'state', label: 'State & Hooks', count: (staticComp?.hooks?.length || 0) + (staticComp?.serverQueries?.length || 0) },
        { id: 'graph', label: 'Data Flow', count: currentDataFlowGraph.edges.length > 0 ? '✓' : '' },
        { id: 'arch', label: 'Architecture', count: (smells.length + issues.length) > 0 ? (smells.length + issues.length) : '' },
        { id: 'source', label: 'Source', count: '' },
        { id: 'llm', label: 'Export for LLM', count: '' }
    ];
    
    let tabsHtml = '<div class="detail-tabs">';
    for (const tab of tabs) {
        const activeClass = currentTab === tab.id ? ' active' : '';
        const countHtml = tab.count ? `<span class="tab-count">${tab.count}</span>` : '';
        tabsHtml += `<div class="detail-tab${activeClass}" data-tab="${tab.id}">${tab.label}${countHtml}</div>`;
    }
    tabsHtml += '<button class="detail-close">×</button></div>';

    let contentHtml = '';
    
    if (currentTab === 'props') {
        const flowData = selectedProp ? getPropFlow(compName, selectedProp) : null;
        
        if (selectedProp && flowData) {
            contentHtml += `<div class="selected-prop-header">
                <button class="back-to-props detail-tab" data-tab="props">← Back to all props</button>
                <h3>Prop Analysis: <code>${selectedProp}</code></h3>
            </div>`;
            contentHtml += renderPropFlowGraph(flowData, selectedProp, compName);
        } else {
            if (currentDataFlowGraph.propOrigins.length === 0) {
                contentHtml = '<div class="detail-empty">No props detected</div>';
            } else {
                for (const origin of currentDataFlowGraph.propOrigins) {
                    const hasFlow = !!getPropFlow(compName, origin.propName);
                    const flowClass = hasFlow ? ' has-flow' : '';
                    const flowBadge = hasFlow ? '<span class="flow-badge">Flow ↗</span>' : '';
                    
                    contentHtml += `
                        <div class="prop-row${flowClass}" data-prop="${origin.propName}">
                            <div class="prop-key">
                                ${origin.propName}
                                ${origin.optional ? '<span class="ts-opt">?</span>' : ''}
                                ${flowBadge}
                            </div>
                            <div class="prop-value">
                                <span class="val">${formatValue(origin.value, 150)}</span>
                                <span class="type">${origin.type || 'any'}</span>
                            </div>
                            <div class="prop-source">
                                <span class="source-tag ${origin.source.source}">${origin.source.source}</span>
                                ${origin.source.query ? `<span class="source-detail">${origin.source.query}()</span>` : ''}
                                ${origin.source.hookName ? `<span class="source-detail">${origin.source.hookName}</span>` : ''}
                            </div>
                        </div>
                    `;
                }
            }
        }
    } else if (currentTab === 'state') {
        // ... (state rendering logic)
        const staticHooks = staticComp?.hooks || [];
        const serverQueries = staticComp?.serverQueries || [];
        
        if (staticHooks.length === 0 && serverQueries.length === 0) {
            contentHtml = '<div class="detail-empty">No state or hooks detected</div>';
        } else {
            if (serverQueries.length > 0) {
                contentHtml += '<div class="section-title">Server Queries</div>';
                for (const q of serverQueries) {
                    contentHtml += `
                        <div class="prop-row">
                            <div class="prop-key">${q}</div>
                            <div class="prop-value"><span class="val">Async Data Fetch</span></div>
                            <div class="prop-source"><span class="source-tag serverQuery">server</span></div>
                        </div>
                    `;
                }
            }
            
            if (staticHooks.length > 0) {
                contentHtml += '<div class="section-title">Hooks</div>';
                for (let i = 0; i < staticHooks.length; i++) {
                    const hookName = staticHooks[i];
                    const liveHook = liveHooks[i];
                    const val = liveHook?.value;
                    
                    contentHtml += `
                        <div class="prop-row">
                            <div class="prop-key">${hookName}</div>
                            <div class="prop-value"><span class="val">${liveHook ? formatValue(val) : '—'}</span></div>
                        </div>
                    `;
                }
            }
        }
    } else if (currentTab === 'graph') {
         // ... (graph rendering logic)
         // Assuming we don't have visual graph rendering yet, show summary
         const edgeCount = currentDataFlowGraph.edges.length;
         if (edgeCount === 0) {
             contentHtml = '<div class="detail-empty">No data flow graph available</div>';
         } else {
             contentHtml += `
                <div class="graph-summary">
                    <p>Graph contains ${currentDataFlowGraph.nodes.length} nodes and ${edgeCount} edges.</p>
                    <p>Visual graph rendering via Mermaid or similar library is recommended for export.</p>
                </div>
                <div class="export-actions">
                    <button class="copy-mermaid-btn">📊 Copy Mermaid Diagram</button>
                    <button class="copy-llm-btn">🤖 Copy JSON for LLM</button>
                </div>
                <div class="graph-preview">
                    <pre>${generateMermaidDiagram(currentDataFlowGraph)}</pre>
                </div>
             `;
         }
    } else if (currentTab === 'arch') {
        contentHtml = renderArchitectureTab(compName, smells, archUsage);
        
        if (issues.length > 0 || refactorHints.length > 0) {
            contentHtml += '<div class="arch-section">';
            contentHtml += '<h4 class="arch-section-title">🔍 Local Analysis</h4>';
            
            if (issues.length > 0) {
                for (const issue of issues) {
                    contentHtml += `<div class="arch-smell smell-warning"><div class="arch-smell-msg">${issue}</div></div>`;
                }
            }
            
            if (refactorHints.length > 0) {
                for (const hint of refactorHints) {
                    contentHtml += `<div class="arch-smell smell-info"><div class="arch-smell-msg">💡 ${hint}</div></div>`;
                }
            }
            contentHtml += '</div>';
        }
    } else if (currentTab === 'source') {
        if (sourceLoadingState === 'loading') {
            contentHtml = '<div class="loading"><div class="loading-spinner"></div><div class="loading-text">Loading source...</div></div>';
        } else if (currentSourceCode) {
            // Need filePath to verify
            const staticComp = comp?.name ? getStaticComponent(comp.name) : null;
            const filePath = node?.source?.fileName || node?.file || staticComp?.filePath || 'unknown';
            contentHtml = renderSourceCode(currentSourceCode, filePath);
        } else {
            contentHtml = '<div class="detail-empty">Source not available</div>';
        }
    } else if (currentTab === 'llm') {
        const live = domEl && compName ? getLiveComponentData(domEl, compName) : { props: {}, state: [] };
        const liveHooks = domEl && compName ? getLiveHooks(domEl, compName) : [];
        const exportData = generateLLMExport(currentDataFlowGraph, node, live.props || {}, liveHooks);
        const json = JSON.stringify(exportData, null, 2);
        
        contentHtml = `
            <div class="llm-export-container">
                <div class="llm-header">
                    <p>Context for LLM analysis (includes props, data flow, hooks, and issues)</p>
                    <button class="copy-llm-btn">📋 Copy for LLM</button>
                </div>
                <pre class="llm-code"><code>${escapeHtml(json)}</code></pre>
            </div>
        `;
    }

    detailOverlay.innerHTML = `
        <div class="detail-dialog">
            <div class="detail-header">${headerHtml}</div>
            ${tabsHtml}
            <div class="detail-content custom-scrollbar">
                ${contentHtml}
            </div>
        </div>
    `;
}

// Assign to callbacks
callbacks.showDetail = showDetailDialog;
