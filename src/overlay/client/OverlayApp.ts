import { OVERLAY_CSS, HIGHLIGHT_CSS } from '../styles.js';
import { state, callbacks } from './state';
import { renderPanel, selectTreeNodeByStack } from './ui';
import { setupRenderTracking } from './render-tracking';
import { showHoverHighlight, hideHoverHighlight, showSelectedHighlight, hideSelectedHighlight } from './highlight';
import { isOverlayElement, getFiberFromElement, getFiberName, getDomFromFiber, getComponentStack } from './utils';
import { refreshAnalysis, checkForRouteChange, buildStaticComponentMap, loadComponentAllowlist, refreshFiberTree, toggle } from './logic';
import { findInstanceIndexForFiber, getNodeByPath } from '../runtime-logic.js';

// Declarations
declare global {
    interface Window {
        __REPO_OVERLAY__: any;
        __REPO_DATA__: any;
        __REACT_DEVTOOLS_GLOBAL_HOOK__: any;
        hljs: any;
        __updateStickyParents?: () => void;
    }
}

// Inspect Mode Logic
let inspectMoveHandler: any = null;
let inspectClickHandler: any = null;
let inspectMoveRaf = 0;
let pendingInspectTarget: any = null;

function enableInspectMode() {
    inspectMoveHandler = (e: MouseEvent) => {
        if (isOverlayElement(e.target)) return;
        if (state.shadow?.querySelector('.detail-overlay')?.getAttribute('style')?.includes('flex')) return;
        
        pendingInspectTarget = e.target;
        if (inspectMoveRaf) return;
        inspectMoveRaf = requestAnimationFrame(() => {
            inspectMoveRaf = 0;
            const target = pendingInspectTarget;
            pendingInspectTarget = null;
            if (!target || isOverlayElement(target) || !document.contains(target)) return;
            
            // Simplified stack for hover
            const fiber = getFiberFromElement(target);
            const name = getFiberName(fiber) || target.tagName.toLowerCase();
            showHoverHighlight(target, name);
        });
    };

    inspectClickHandler = (e: MouseEvent) => {
        if (isOverlayElement(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const fiber = getFiberFromElement(e.target);
        const name = fiber ? getFiberName(fiber) : null;
        const domEl = fiber ? getDomFromFiber(fiber) : e.target;

        if (name) {
            const SKIP = new Set([
                'Image', 'Link', 'LinkComponent', 'Icon', 'Typography',
                'PreprocessedImage', 'TooltipTrigger', 'ScrollArea', 'ScrollAreaProvider',
            ]);

            const stack = getComponentStack(e.target);
            let chosenName: string | null = null;
            let selectedNodeId: string | null = null;

            for (let i = 0; i < stack.length; i++) {
                const target = stack[i];
                if (!target || SKIP.has(target)) continue;
                selectedNodeId = selectTreeNodeByStack(stack.slice(i));
                if (selectedNodeId) {
                    chosenName = target;
                    break;
                }
            }

            state.selectedFiber = fiber;
            state.selectedElement = domEl;

            if (!chosenName) {
                selectedNodeId = selectTreeNodeByStack(stack);
            }

            if (selectedNodeId && fiber) {
                const treeNode = getNodeByPath(state.DISPLAY_TREE, selectedNodeId);
                if (treeNode?.instances?.length > 1) {
                    const instIdx = findInstanceIndexForFiber(treeNode, fiber);
                    if (instIdx >= 0) {
                        if (!state.expandedInstanceGroups.has(selectedNodeId)) {
                            state.expandedInstanceGroups.add(selectedNodeId);
                        }
                        state.selectedInstanceByGroup.set(selectedNodeId, instIdx);
                        renderPanel();

                        const instId = selectedNodeId + ':' + instIdx;
                        const instRow = state.shadow?.querySelector('.instance-row[data-instance-id="' + instId + '"]');
                        if (instRow) {
                            state.shadow!.querySelectorAll('.instance-row.selected').forEach(el => el.classList.remove('selected'));
                            instRow.classList.add('selected');
                            instRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    }
                }
            }

            showSelectedHighlight(domEl, chosenName || name);
        }
    };

    document.addEventListener('mousemove', inspectMoveHandler);
    document.addEventListener('click', inspectClickHandler, true);
}

function disableInspectMode() {
    if (inspectMoveHandler) document.removeEventListener('mousemove', inspectMoveHandler);
    if (inspectClickHandler) document.removeEventListener('click', inspectClickHandler, true);
    if (inspectMoveRaf) cancelAnimationFrame(inspectMoveRaf);
    inspectMoveRaf = 0;
    pendingInspectTarget = null;
    hideHoverHighlight();
    hideSelectedHighlight();
}

callbacks.onToggle = (isOpen: boolean) => {
    if (isOpen && !state.isPaused) enableInspectMode();
    else disableInspectMode();
};

export function init(data: any) {
    if (data) {
        state.STATIC_TREE = data.STATIC_TREE || [];
        state.STATS = data.STATS || {};
        state.ROUTE = data.ROUTE || '';
        state.ARCHITECTURE = data.ARCHITECTURE || null;
        state.TREE = JSON.parse(JSON.stringify(state.STATIC_TREE));
    }
}

export function mount(initialData?: any) {
    // Determine overlay ID (using constant string for ID to prevent multiple mounts)
    const CONTAINER_ID = 'react-xray-overlay-root';
    if (document.getElementById(CONTAINER_ID)) return;

    if (initialData) {
        init(initialData);
    }
    
    // Initialize global object first
    window.__REPO_OVERLAY__ = {
        toggle,
        show: () => { if (!state.isOpen) toggle(); },
        hide: () => { if (state.isOpen) toggle(); },
        refresh: refreshAnalysis,
        debug: {
             getTree: () => state.TREE,
             getFiberTree: () => state.FIBER_TREE
        }
    };

    state.host = document.createElement('div');
    state.host.id = CONTAINER_ID;
    // Essential: host should not block clicks, only children (panel, toggle) should
    state.host.style.cssText = 'position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
    state.shadow = state.host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = OVERLAY_CSS;
    state.shadow.appendChild(style);

    const highlightStyle = document.createElement('style');
    highlightStyle.textContent = HIGHLIGHT_CSS;
    document.head.appendChild(highlightStyle);

    state.container = document.createElement('div');
    state.shadow.appendChild(state.container);

    let hasMountedDom = false;
    function ensureDomMounted() {
        if (!hasMountedDom && document.body) {
            document.body.appendChild(state.host!);
            setupRenderTracking();
            renderPanel();
            hasMountedDom = true;
        }
    }
    
    // Start loop to find tree
    function waitForFiberTree(attempts = 0) {
      refreshFiberTree();
      if (state.FIBER_TREE.length === 0 && attempts < 20) {
        setTimeout(() => waitForFiberTree(attempts + 1), 250);
      } else {
        ensureDomMounted();
        renderPanel();
      }
    }
    
    if (state.STATIC_TREE && state.STATIC_TREE.length > 0) {
        state.isLoading = false;
        buildStaticComponentMap(state.STATIC_TREE);
        ensureDomMounted();
        setTimeout(() => { if (!state.isOpen) toggle(); }, 100);
        
        // Also need to get Fiber tree to show fiber-specific info and stats
        setTimeout(() => waitForFiberTree(), 100);
    } else {
        refreshAnalysis();
        waitForFiberTree();
        setTimeout(() => { ensureDomMounted(); if (!state.isOpen) toggle(); }, 100);
    }
    
    loadComponentAllowlist();

    window.addEventListener('popstate', checkForRouteChange);
    const origPushState = history.pushState;
    history.pushState = function(...args) {
        origPushState.apply(this, args);
        setTimeout(checkForRouteChange, 50);
    };
}
