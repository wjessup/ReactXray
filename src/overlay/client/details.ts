import { state, callbacks } from './state';
import { escapeHtml, formatValue, extractSourceLocation, h } from './utils';
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
    if (!code) return h('div', { className: 'detail-empty' }, 'Source not available');
    
    const ext = filePath.split('.').pop() || 'tsx';
    const langMap: Record<string, string> = { tsx: 'typescript', ts: 'typescript', jsx: 'javascript', js: 'javascript', css: 'css', json: 'json' };
    const language = langMap[ext] || 'typescript';
    
    const highlighted = highlightCode(code, language);
    
    // Note: highlighted code from highlight.js is HTML string, so we must use dangerouslySetInnerHTML for the code block
    return h('div', { className: 'source-container' },
        h('div', { className: 'source-header' },
            h('span', { className: 'source-path' }, escapeHtml(filePath)),
            h('button', { className: 'source-copy-btn', title: 'Copy source' }, '📋 Copy'),
            h('button', { className: 'source-open-btn', title: 'Open in editor' }, '↗ Open')
        ),
        h('div', { className: 'source-code' },
            h('pre', {}, 
                h('code', { 
                    className: 'hljs language-' + language,
                    dangerouslySetInnerHTML: { __html: highlighted }
                })
            )
        )
    );
}

function renderTreeNode(node: any, depth: number): HTMLElement | string {
    if (depth > 4) return '';
    
    const hasSourceLink = node.parentFile && node.line;
    const headerProps: any = { className: 'prop-tree-header' };
    if (hasSourceLink) {
        headerProps.className += ' clickable';
        headerProps.dataset = { sourceFile: node.parentFile, sourceLine: node.line };
    }
    
    const children = [];
    
    // Header content
    const headerContent = [
        h('span', { className: 'prop-tree-comp' }, node.componentName),
        h('span', { className: 'prop-tree-dot' }, '.'),
        h('span', { className: 'prop-tree-prop' }, node.propName)
    ];

    if (node.fullPath && node.fullPath.includes('.')) {
        headerContent.push(h('span', { className: 'prop-tree-access' }, node.fullPath));
    } else if (node.fullPath && node.fullPath.includes('→')) {
        headerContent.push(h('span', { className: 'prop-tree-rename' }, '⚠️ rename'));
    }
    
    if (hasSourceLink) {
        headerContent.push(h('span', { className: 'prop-tree-goto', title: 'Jump to source' }, '→'));
    }
    
    children.push(h('div', headerProps, ...headerContent));
    
    if (node.children && node.children.length > 0) {
        const branchChildren = node.children.map((child: any) => h('div', { className: 'prop-tree-branch' },
            h('span', { className: 'prop-tree-line' }, '├─'),
            renderTreeNode(child, depth + 1)
        ));
        children.push(h('div', { className: 'prop-tree-children' }, ...branchChildren));
    }
    
    return h('div', { className: 'prop-tree-node', style: { marginLeft: (depth * 16) + 'px' } }, ...children);
}

function renderPropFlowGraph(flowData: any, highlightProp: string | null, compName: string) {
    if (!flowData || !flowData.root) {
        return h('div', { className: 'prop-flow-empty' }, 'No flow data');
    }

    const upwardFlow = getPropUpwardFlow(compName, flowData.propName);
    const containerChildren = [];
    
    // Upward Flow Section
    if (upwardFlow && upwardFlow.usages && upwardFlow.usages.length > 0) {
        const sectionLabel = h('div', { className: 'prop-section-label' }, '⬆ WHERE IT COMES FROM');
        const usages = upwardFlow.usages.map((usage: any) => {
            let usageContent;
            
            if (usage.upstreamChain && usage.upstreamChain.length > 0) {
                const chainElements = [];
                for (let i = usage.upstreamChain.length - 1; i >= 0; i--) {
                    const node = usage.upstreamChain[i];
                    const isTerminal = node.isTerminal;
                    let className = 'prop-upstream-node';
                    if (isTerminal) className += ' terminal';
                    if (node.sourceType) className += ' ' + node.sourceType;
                    
                    const nodeChildren = [
                        h('span', { className: 'prop-upstream-comp' }, node.componentName),
                        node.propName ? h('span', { className: 'prop-upstream-via' }, '.' + node.propName) : null,
                        h('span', { className: 'prop-upstream-source' }, node.sourceName),
                        isTerminal ? h('span', { className: 'prop-upstream-terminal-badge ' + node.sourceType }, node.sourceType.toUpperCase()) : null
                    ];
                    
                    chainElements.push(h('div', { className }, ...nodeChildren));
                    
                    if (i > 0) {
                        chainElements.push(h('div', { className: 'prop-upstream-arrow' }, '↓'));
                    }
                }
                usageContent = chainElements;
            } else {
                const className = 'prop-upstream-node' + (usage.valueSource.type !== 'prop' ? ' terminal ' + usage.valueSource.type : '');
                const nodeChildren = [
                    h('span', { className: 'prop-upstream-comp' }, usage.parentComponent),
                    h('span', { className: 'prop-upstream-source' }, usage.valueSource.expression),
                    (usage.valueSource.type !== 'prop' && usage.valueSource.type !== 'computed') ? 
                        h('span', { className: 'prop-upstream-terminal-badge ' + usage.valueSource.type }, usage.valueSource.type.toUpperCase()) : null
                ];
                usageContent = [h('div', { className }, ...nodeChildren)];
            }
            
            return h('div', { className: 'prop-upward-path' }, ...usageContent);
        });
        
        containerChildren.push(h('div', { className: 'prop-upward-section' },
            sectionLabel,
            ...usages,
            h('div', { className: 'prop-flow-connector' }, h('span', { className: 'prop-flow-arrow' }, '↓'))
        ));

    } else if (flowData.origin && flowData.origin.type !== 'prop') {
        const originType = flowData.origin.type === 'hook' ? 'hook' : flowData.origin.type === 'query' ? 'server' : null;
        const originElements = [
            h('span', { className: 'prop-flow-origin-label' }, '⬆ Origin:'),
            h('span', { className: 'prop-flow-origin-value' }, flowData.origin.name),
            originType ? h('span', { className: 'prop-flow-origin-type' }, originType) : null
        ];
        
        containerChildren.push(
            h('div', { className: 'prop-flow-origin' }, ...originElements),
            h('div', { className: 'prop-flow-connector' }, h('span', { className: 'prop-flow-arrow' }, '↓'))
        );

    } else if (flowData.origin && flowData.origin.type === 'prop') {
        containerChildren.push(
            h('div', { className: 'prop-flow-origin' },
                h('span', { className: 'prop-flow-origin-label' }, '⬆ From parent:'),
                h('span', { className: 'prop-flow-origin-value' }, flowData.origin.name)
            ),
            h('div', { className: 'prop-flow-connector' }, h('span', { className: 'prop-flow-arrow' }, '↓'))
        );
    }

    // Downward Flow Section
    // renderTreeNode returns HTMLElement or string (empty string). h handles string fine if it's text,
    // but renderTreeNode returns *HTML string* in legacy mode? No I changed it to return HTMLElement | string.
    // Empty string is fine.
    
    // Check if root has children to decide if we wrap in downward section
    if (flowData.root.children && flowData.root.children.length > 0) {
        containerChildren.push(h('div', { className: 'prop-downward-section' },
            h('div', { className: 'prop-section-label' }, '⬇ WHERE IT FLOWS TO'),
            renderTreeNode(flowData.root, 0)
        ));
    } else {
        containerChildren.push(renderTreeNode(flowData.root, 0));
    }

    return h('div', { className: 'prop-flow-graph' }, ...containerChildren);
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
    if (!state.ARCHITECTURE) {
        return h('div', { className: 'detail-empty' }, 'Architecture analysis not available');
    }

    const totalSmells = state.ARCHITECTURE.smells?.length || 0;
    const totalPassThrough = state.ARCHITECTURE.passThroughComponents?.length || 0;
    const totalNoOps = state.ARCHITECTURE.noOpFunctions?.length || 0;
    
    const sections = [];

    // Route Overview
    const overviewStats = [
        h('div', { className: 'arch-stat-row' },
            h('span', { className: 'arch-stat-label' }, 'Total issues found:'),
            h('span', { className: 'arch-stat-value' }, totalSmells)
        )
    ];
    
    if (totalPassThrough > 0) {
        overviewStats.push(h('div', { className: 'arch-stat-row' },
            h('span', { className: 'arch-stat-label' }, 'Pass-through components:'),
            h('span', { className: 'arch-stat-value' }, totalPassThrough)
        ));
    }
    
    if (totalNoOps > 0) {
        overviewStats.push(h('div', { className: 'arch-stat-row' },
            h('span', { className: 'arch-stat-label' }, 'No-op functions:'),
            h('span', { className: 'arch-stat-value' }, totalNoOps)
        ));
    }
    
    sections.push(h('div', { className: 'arch-section' },
        h('h4', { className: 'arch-section-title' }, '� Route Overview'),
        ...overviewStats
    ));

    // Usage Context
    if (usage && usage.totalUsages > 0) {
        const usageStats = [
            h('div', { className: 'arch-stat-row' },
                h('span', { className: 'arch-stat-label' }, 'Total usages:'),
                h('span', { className: 'arch-stat-value' }, usage.totalUsages)
            )
        ];
        
        if (usage.usedInComponents && usage.usedInComponents.length > 0) {
            let usedByText = usage.usedInComponents.slice(0, 5).join(', ');
            if (usage.usedInComponents.length > 5) usedByText += ' +' + (usage.usedInComponents.length - 5) + ' more';
            
            usageStats.push(h('div', { className: 'arch-stat-row' },
                h('span', { className: 'arch-stat-label' }, 'Used by:'),
                h('span', { className: 'arch-stat-value' }, usedByText)
            ));
        }
        
        if (usage.pageContexts && usage.pageContexts.length > 0) {
            usageStats.push(h('div', { className: 'arch-stat-row' },
                h('span', { className: 'arch-stat-label' }, 'Page contexts:'),
                h('span', { className: 'arch-stat-value' }, usage.pageContexts.length + ' pages')
            ));
            
            const badges = usage.pageContexts.slice(0, 5).map((ctx: string) => h('div', { className: 'arch-page-badge' }, ctx));
            if (usage.pageContexts.length > 5) {
                badges.push(h('div', { className: 'arch-page-badge' }, '+' + (usage.pageContexts.length - 5) + ' more'));
            }
            usageStats.push(h('div', { className: 'arch-pages' }, ...badges));
        }
        
        sections.push(h('div', { className: 'arch-section' },
            h('h4', { className: 'arch-section-title' }, '📍 Usage Context'),
            ...usageStats
        ));
    }

    // Similar Components
    const similar = getArchSimilarForComponent(compName);
    if (similar && similar.length > 0) {
        const similarItems = similar.slice(0, 5).map((sim: any) => {
            const pct = Math.round(sim.similarity * 100);
            const itemChildren = [
                h('span', { className: 'arch-similar-name' }, sim.name),
                h('span', { className: 'arch-similar-pct' }, pct + '% similar')
            ];
            
            if (sim.sharedProps && sim.sharedProps.length > 0) {
                let sharedText = 'Shared: ' + sim.sharedProps.slice(0, 4).join(', ');
                if (sim.sharedProps.length > 4) sharedText += ' +' + (sim.sharedProps.length - 4);
                itemChildren.push(h('div', { className: 'arch-similar-props' }, sharedText));
            }
            
            return h('div', { className: 'arch-similar-item' }, ...itemChildren);
        });
        
        sections.push(h('div', { className: 'arch-section' },
            h('h4', { className: 'arch-section-title' }, '🔄 Similar Components'),
            ...similarItems
        ));
    }

    // Issues
    if (smells && smells.length > 0) {
        const smellItems = smells.map((smell: any) => {
            const severityClass = smell.severity === 'error' ? 'smell-error' : smell.severity === 'warning' ? 'smell-warning' : 'smell-info';
            return h('div', { className: 'arch-smell ' + severityClass },
                h('div', { className: 'arch-smell-type' }, formatSmellType(smell.type)),
                h('div', { className: 'arch-smell-msg' }, smell.message),
                h('div', { className: 'arch-smell-suggestion' }, '💡 ' + smell.suggestion)
            );
        });
        
        sections.push(h('div', { className: 'arch-section' },
            h('h4', { className: 'arch-section-title' }, '⚠️ Issues for ' + compName),
            ...smellItems
        ));
    }

    // Pass-Through Analysis
    if (state.ARCHITECTURE.passThroughComponents) {
        const passThrough = state.ARCHITECTURE.passThroughComponents.find((p: any) => p.name === compName);
        if (passThrough) {
            sections.push(h('div', { className: 'arch-section' },
                h('h4', { className: 'arch-section-title' }, '📦 Pass-Through Analysis'),
                h('div', { className: 'arch-passthrough' },
                    h('div', { className: 'arch-passthrough-bar' },
                        h('div', { className: 'arch-passthrough-fill', style: { width: Math.round(passThrough.ratio * 100) + '%' } })
                    ),
                    h('div', { className: 'arch-passthrough-label' },
                        passThrough.propsPassedThrough + ' of ' + passThrough.propsReceived + ' props passed through'
                    )
                )
            ));
        }
    }

    return sections;
}

function renderDetailContent() {
    if (!detailOverlay || !currentDetailNode) return;

    const node = currentDetailNode;
    const domEl = currentDetailDomEl;
    const file = node.file;
    const comp = node.component;
    const compName = comp?.name || 'Unknown';
    const staticComp = comp?.name ? getStaticComponent(comp.name) : null;
    
    const live = domEl && compName ? getLiveComponentData(domEl, compName) : { props: {}, state: [] };
    const liveHooks = domEl && compName ? getLiveHooks(domEl, compName) : [];
    
    currentDataFlowGraph = buildDataFlowGraph(node, domEl, live.props || {}, liveHooks);

    const issues = detectPotentialIssues(currentDataFlowGraph, staticComp);
    const refactorHints = detectRefactoringOpportunities(currentDataFlowGraph, staticComp);
    const smells = getArchSmellsForComponent(compName);
    const archUsage = getArchUsageForComponent(compName);

    // 1. Header
    const badges = [];
    if (staticComp?.isClientComponent) badges.push(h('span', { className: 'badge client' }, 'Use Client'));
    if (staticComp?.isServerComponent) badges.push(h('span', { className: 'badge server' }, 'Server Component'));

    const header = h('div', { className: 'detail-header' },
        h('div', {},
            h('h3', { className: 'detail-title' }, compName),
            h('div', { className: 'detail-subtitle' },
                h('span', { className: 'file' }, file),
                h('div', { className: 'badges' }, ...badges),
            )
        )
    );

    // 2. Tabs
    const tabs = [
        { id: 'props', label: 'Props', count: currentDataFlowGraph.propOrigins.length },
        { id: 'state', label: 'State & Hooks', count: (staticComp?.hooks?.length || 0) + (staticComp?.serverQueries?.length || 0) },
        { id: 'graph', label: 'Data Flow', count: currentDataFlowGraph.edges.length > 0 ? '✓' : '' },
        { id: 'arch', label: 'Architecture', count: (smells.length + issues.length) > 0 ? (smells.length + issues.length) : '' },
        { id: 'source', label: 'Source', count: '' },
        { id: 'llm', label: 'Export for LLM', count: '' }
    ];

    const tabsContainer = h('div', { className: 'detail-tabs' },
        ...tabs.map(tab => {
            const countSpan = tab.count ? h('span', { className: 'tab-count' }, ` (${tab.count})`) : null;
            return h('div', { 
                className: `detail-tab${currentTab === tab.id ? ' active' : ''}`,
                dataset: { tab: tab.id }
            }, tab.label, countSpan);
        }),
        h('button', { className: 'detail-close' }, '×')
    );

    // 3. Content
    let content: HTMLElement | HTMLElement[];
    
    if (currentTab === 'props') {
        content = renderPropsTab(compName, selectedProp, currentDataFlowGraph.propOrigins);
    } else if (currentTab === 'state') {
        content = renderStateTab(staticComp, liveHooks);
    } else if (currentTab === 'graph') {
        content = renderGraphTab(currentDataFlowGraph);
    } else if (currentTab === 'arch') {
        const archElements = renderArchitectureTab(compName, smells, archUsage);
        const localAnalysis = renderLocalAnalysis(issues, refactorHints);
        content = h('div', {}, ...Array.isArray(archElements) ? archElements : [archElements], localAnalysis);
    } else if (currentTab === 'source') {
        content = renderSourceTab(comp, node, staticComp);
    } else if (currentTab === 'llm') {
        content = renderLlmTab(node, domEl, compName, live, liveHooks);
    } else {
        content = h('div', { className: 'detail-empty' }, 'Unknown tab');
    }

    // Clear and rebuild
    detailOverlay.innerHTML = '';
    const dialog = h('div', { className: 'detail-dialog' },
        header,
        tabsContainer,
        h('div', { className: 'detail-content custom-scrollbar' }, content)
    );
    
    detailOverlay.appendChild(dialog);
}

// Helpers for Tabs (extracted for clarity)

function renderPropsTab(compName: string, selectedProp: string | null, propOrigins: any[]) {
    if (selectedProp) {
        const flowData = getPropFlow(compName, selectedProp);
        if (!flowData) return h('div', { className: 'detail-empty' }, 'Flow data not found');
        
        return [
            h('div', { className: 'selected-prop-header' },
                h('button', { className: 'back-to-props detail-tab', dataset: { tab: 'props' } }, '← Back to all props'),
                h('h3', {}, 'Prop Analysis: ', h('code', {}, selectedProp))
            ),
            h('div',  { dangerouslySetInnerHTML: { __html: renderPropFlowGraph(flowData, selectedProp, compName) } })
        ];
    }

    if (propOrigins.length === 0) return h('div', { className: 'detail-empty' }, 'No props detected');

    return propOrigins.map(origin => {
        const hasFlow = !!getPropFlow(compName, origin.propName);
        
        const sourceTags = [
            h('span', { className: `source-tag ${origin.source.source}` }, origin.source.source)
        ];
        if (origin.source.query) sourceTags.push(h('span', { className: 'source-detail' }, `${origin.source.query}()`));
        if (origin.source.hookName) sourceTags.push(h('span', { className: 'source-detail' }, origin.source.hookName));

        return h('div', { 
            className: `detail-row prop-row${hasFlow ? ' has-flow' : ''}`,
            dataset: { prop: origin.propName } 
        },
            h('div', { className: 'detail-key' },
                origin.propName,
                origin.optional ? h('span', { className: 'ts-opt' }, '?') : null,
                hasFlow ? h('span', { className: 'flow-badge' }, 'Flow ↗') : null
            ),
            h('div', { className: 'detail-value' },
                h('span', { className: 'val' }, formatValue(origin.value, 150)),
                h('span', { className: 'type' }, origin.type || 'any')
            ),
            h('div', { className: 'prop-source' }, ...sourceTags)
        );
    });
}

function renderStateTab(staticComp: any, liveHooks: any[]) {
    const staticHooks = staticComp?.hooks || [];
    const serverQueries = staticComp?.serverQueries || [];
    
    if (staticHooks.length === 0 && serverQueries.length === 0) {
        return h('div', { className: 'detail-empty' }, 'No state or hooks detected');
    }
    
    const elements = [];
    
    if (serverQueries.length > 0) {
        elements.push(h('div', { className: 'section-title' }, 'Server Queries'));
        elements.push(...serverQueries.map((q: string) => h('div', { className: 'prop-row' },
            h('div', { className: 'prop-key' }, q),
            h('div', { className: 'prop-value' }, h('span', { className: 'val' }, 'Async Data Fetch')),
            h('div', { className: 'prop-source' }, h('span', { className: 'source-tag serverQuery' }, 'server'))
        )));
    }
    
    if (staticHooks.length > 0) {
        elements.push(h('div', { className: 'section-title' }, 'Hooks'));
        elements.push(...staticHooks.map((hookName: string, i: number) => {
            const liveHook = liveHooks[i];
            const val = liveHook?.value;
            return h('div', { className: 'prop-row' },
                h('div', { className: 'prop-key' }, hookName),
                h('div', { className: 'prop-value' }, h('span', { className: 'val' }, liveHook ? formatValue(val) : '—'))
            );
        }));
    }
    
    return elements;
}

function renderGraphTab(graph: any) {
    const edgeCount = graph.edges.length;
    if (edgeCount === 0) return h('div', { className: 'detail-empty' }, 'No data flow graph available');

    return [
        h('div', { className: 'graph-summary' },
            h('p', {}, `Graph contains ${graph.nodes.length} nodes and ${edgeCount} edges.`),
            h('p', {}, 'Visual graph rendering via Mermaid or similar library is recommended for export.')
        ),
        h('div', { className: 'export-actions' },
            h('button', { className: 'copy-mermaid-btn' }, '📊 Copy Mermaid Diagram'),
            h('button', { className: 'copy-llm-btn' }, '🤖 Copy JSON for LLM')
        ),
        h('div', { className: 'graph-preview' },
            h('pre', {}, generateMermaidDiagram(graph))
        )
    ];
}

function renderLocalAnalysis(issues: string[], refactorHints: string[]) {
    if (issues.length === 0 && refactorHints.length === 0) return null;
    
    const elements = [h('h4', { className: 'arch-section-title' }, '🔍 Local Analysis')];
    
    if (issues.length > 0) {
        elements.push(...issues.map(issue => 
            h('div', { className: 'arch-smell smell-warning' }, 
                h('div', { className: 'arch-smell-msg' }, issue)
            )
        ));
    }
    
    if (refactorHints.length > 0) {
        elements.push(...refactorHints.map(hint => 
            h('div', { className: 'arch-smell smell-info' }, 
                h('div', { className: 'arch-smell-msg' }, '💡 ' + hint)
            )
        ));
    }
    
    return h('div', { className: 'arch-section' }, ...elements);
}

function renderSourceTab(comp: any, node: any, staticComp: any) {
    if (sourceLoadingState === 'loading') {
        return h('div', { className: 'loading' },
            h('div', { className: 'loading-spinner' }),
            h('div', { className: 'loading-text' }, 'Loading source...')
        );
    } else if (currentSourceCode) {
        const filePath = node?.source?.fileName || node?.file || staticComp?.filePath || 'unknown';
        return renderSourceCode(currentSourceCode, filePath);
    } else {
        return h('div', { className: 'detail-empty' }, 'Source not available');
    }
}

function renderLlmTab(node: any, domEl: any, compName: string, live: any, liveHooks: any) {
    const exportData = generateLLMExport(currentDataFlowGraph, node, live.props || {}, liveHooks);
    const json = JSON.stringify(exportData, null, 2);
    
    return [
        h('div', { className: 'llm-header' },
            h('p', {}, 'Context for LLM analysis (includes props, data flow, hooks, and issues)'),
            h('button', { className: 'copy-llm-btn' }, '📋 Copy for LLM')
        ),
        h('pre', { className: 'llm-code' },
            h('code', {}, json)
        )
    ];
}


// Assign to callbacks
callbacks.showDetail = showDetailDialog;
