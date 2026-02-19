import { OVERLAY_CSS, HIGHLIGHT_CSS } from '../styles.js';
import { state, callbacks } from './state';
import { renderPanel } from './ui';
import { setupRenderTracking } from './render-tracking';
import { showHoverHighlight, hideHoverHighlight, showSelectedHighlight, hideSelectedHighlight } from './highlight';
import { isOverlayElement, getFiberFromElement, getFiberName, getDomFromFiber } from './utils';
import { refreshAnalysis, checkForRouteChange, buildStaticComponentMap, loadComponentAllowlist, refreshFiberTree, toggle } from './logic';
import { showDetailDialog, hideDetailDialog } from './details';

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

        if (name && domEl) {
            state.selectedFiber = fiber;
            state.selectedElement = domEl;
            
            showSelectedHighlight(domEl, name);
            
            // Auto open detail for now as in original it selected in tree
            // We can just show detail dialog directly or try to select in tree
            // For now, let's just highlight.
            // If we want to mirror original behavior, we need to select in tree.
            // We don't have tree selection logic easily exposed yet.
            console.log('[Overlay] Selected:', name);
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

    document.body.appendChild(state.host);

    setupRenderTracking();
    
    // Initial Render
    renderPanel();
    
    // Start loop to find tree
    function waitForFiberTree(attempts = 0) {
      refreshFiberTree();
      if (state.FIBER_TREE.length === 0 && attempts < 20) {
        setTimeout(() => waitForFiberTree(attempts + 1), 250);
      } else {
        if (state.TREE.length > 0 || state.FIBER_TREE.length > 0) {
            state.isLoading = false;
        }
        renderPanel();
      }
    }
    
    if (state.STATIC_TREE && state.STATIC_TREE.length > 0) {
        state.isLoading = false;
        buildStaticComponentMap(state.STATIC_TREE);
        renderPanel();
        setTimeout(() => { if (!state.isOpen) toggle(); }, 100);
    } else {
        refreshAnalysis();
        waitForFiberTree();
    }
    
    loadComponentAllowlist();

    window.addEventListener('popstate', checkForRouteChange);
    const origPushState = history.pushState;
    history.pushState = function(...args) {
        origPushState.apply(this, args);
        setTimeout(checkForRouteChange, 50);
    };
}
