import { OVERLAY_CSS, HIGHLIGHT_CSS } from '../styles.js';
import { state, callbacks } from './state';
import { renderPanel, selectTreeNodeById, selectTreeNodeByStack } from './ui';
import { setupRenderTracking } from './render-tracking';
import { showHoverHighlight, hideHoverHighlight, showSelectedHighlight, hideSelectedHighlight } from './highlight';
import { isOverlayElement, getFiberFromElement, getReactFiber, getFiberName, getDomFromFiber, getComponentStack, findNodeById, resetFiberKeyCache } from './utils';
import { refreshAnalysis, checkForRouteChange, buildStaticComponentMap, loadComponentAllowlist, refreshFiberTree, toggle } from './logic';
import { findNodeIdForFiber } from '../runtime-logic.js';

function countDisplayNodes(nodes: any[]): number {
    let count = 0;
    for (const n of nodes) {
        if (n.component) count++;
        if (n.children) count += countDisplayNodes(n.children);
    }
    return count;
}

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

        const dbg: string[] = [];
        dbg.push(`[Inspector] Clicked element: <${(e.target as Element)?.tagName?.toLowerCase()}>`);
        dbg.push(`[Inspector] Fiber found: ${!!fiber}, Name: "${name}"`);

        if (name) {
            const stack = getComponentStack(e.target);
            dbg.push(`[Inspector] Component stack: [${stack.join(' → ')}]`);

            let chosenName: string | null = null;
            let selectedNodeId: string | null = null;

            let fiberAncestorMatch: { nodeId: string; name: string } | null = null;

            if (fiber) {
                selectedNodeId = findNodeIdForFiber(state.DISPLAY_TREE, fiber);
                if (selectedNodeId) {
                    const matchedNode = findNodeById(state.DISPLAY_TREE, selectedNodeId);
                    const matchedName = matchedNode?.component?.name;
                    if (matchedName === name) {
                        selectTreeNodeById(selectedNodeId);
                        chosenName = name;
                        dbg.push(`[Inspector] ✓ Direct fiber match: "${name}" at ${selectedNodeId}`);
                    } else {
                        // Save as fallback — fiber ancestry found a tree node but name differs
                        // (common for server-rendered elements whose fiber is a framework internal)
                        fiberAncestorMatch = { nodeId: selectedNodeId, name: matchedName || name };
                        dbg.push(`[Inspector] Fiber → "${matchedName}" (wanted "${name}"), trying stack`);
                        selectedNodeId = null;
                    }
                }
            }

            if (!selectedNodeId) {
                selectedNodeId = selectTreeNodeByStack(stack);
                if (selectedNodeId) {
                    const foundNode = findNodeById(state.DISPLAY_TREE, selectedNodeId);
                    chosenName = foundNode?.component?.name || name;
                    dbg.push(`[Inspector] ✓ Stack match: "${chosenName}" at ${selectedNodeId}`);
                }
            }

            if (!selectedNodeId) {
                for (let i = 1; i < stack.length; i++) {
                    const subStack = stack.slice(i);
                    selectedNodeId = selectTreeNodeByStack(subStack);
                    if (selectedNodeId) {
                        const foundNode = findNodeById(state.DISPLAY_TREE, selectedNodeId);
                        chosenName = foundNode?.component?.name || stack[i];
                        dbg.push(`[Inspector] ✓ Sub-stack match at offset ${i}: "${chosenName}" at ${selectedNodeId}`);
                        break;
                    }
                }
            }

            // Server component matching via _debugInfo (React dev mode)
            if (!selectedNodeId) {
                const rawFiber = getReactFiber(e.target);
                const debugInfoArr = rawFiber?._debugInfo;
                if (Array.isArray(debugInfoArr)) {
                    // Extract server component stack from _debugInfo
                    const serverStack: string[] = [];
                    for (const entry of debugInfoArr) {
                        if (entry.name && entry.env === 'Server') {
                            serverStack.push(entry.name);
                            // Walk the owner chain for ancestry
                            let owner = entry.owner;
                            const seenOwners = new Set();
                            while (owner && serverStack.length < 15) {
                                if (seenOwners.has(owner)) break;
                                seenOwners.add(owner);
                                if (owner.name && owner.env === 'Server') {
                                    serverStack.push(owner.name);
                                }
                                owner = owner.owner;
                            }
                            break; // Use first server component entry
                        }
                    }

                    if (serverStack.length > 0) {
                        dbg.push(`[Inspector] Server component stack: [${serverStack.join(' → ')}]`);
                        // Try ancestry matching with server stack
                        selectedNodeId = selectTreeNodeByStack(serverStack);
                        if (selectedNodeId) {
                            const foundNode = findNodeById(state.DISPLAY_TREE, selectedNodeId);
                            chosenName = foundNode?.component?.name || serverStack[0];
                            dbg.push(`[Inspector] ✓ Server _debugInfo match: "${chosenName}" at ${selectedNodeId}`);
                        }
                    }
                }
            }

            // Fallback: walk up DOM ancestors to find nearest component in tree
            if (!selectedNodeId) {
                let ancestor: Element | null = (e.target as Element)?.parentElement;
                const triedFibers = new Set<any>();
                triedFibers.add(fiber);
                while (ancestor && !selectedNodeId) {
                    if (isOverlayElement(ancestor)) break;
                    const ancFiber = getFiberFromElement(ancestor);
                    if (ancFiber && !triedFibers.has(ancFiber)) {
                        triedFibers.add(ancFiber);
                        const ancId = findNodeIdForFiber(state.DISPLAY_TREE, ancFiber);
                        if (ancId) {
                            const ancNode = findNodeById(state.DISPLAY_TREE, ancId);
                            const ancName = ancNode?.component?.name;
                            if (ancName) {
                                selectTreeNodeById(ancId);
                                selectedNodeId = ancId;
                                chosenName = ancName;
                                dbg.push(`[Inspector] ✓ DOM ancestor fallback: "${ancName}" at ${ancId}`);
                            }
                        }
                    }
                    ancestor = ancestor.parentElement;
                }
            }

            // Last resort: use the fiber ancestry match (wrong name but valid tree node)
            if (!selectedNodeId && fiberAncestorMatch) {
                selectedNodeId = fiberAncestorMatch.nodeId;
                chosenName = fiberAncestorMatch.name;
                selectTreeNodeById(selectedNodeId);
                dbg.push(`[Inspector] ✓ Fiber ancestor fallback: "${chosenName}" at ${selectedNodeId}`);
            }

            if (!selectedNodeId) {
                dbg.push(`[Inspector] ✗ NO MATCH FOUND`);
            }

            state.selectedFiber = fiber;
            state.selectedElement = domEl;

            dbg.push(`[Inspector] Final: chosenName="${chosenName || name}", nodeId="${selectedNodeId}"`);
            console.log(dbg.join('\n'));

            showSelectedHighlight(domEl, chosenName || name);
        } else {
            const el = e.target as any;
            const tag = el?.tagName?.toLowerCase() || '?';
            const reactKeys = Object.getOwnPropertyNames(el).filter(k => k.startsWith('__react') || k.startsWith('_react'));
            const rawFiber = reactKeys.length > 0 ? el[reactKeys[0]] : null;
            const rawFiberType = rawFiber?.type;
            const rawFiberName = typeof rawFiberType === 'string' ? rawFiberType
                : typeof rawFiberType === 'function' ? (rawFiberType.displayName || rawFiberType.name || 'fn')
                : rawFiberType?.displayName || rawFiberType?.render?.name || null;
            console.log(
                `[Inspector] No named component for <${tag}>\n` +
                `  React keys on element: [${reactKeys.join(', ')}]\n` +
                `  Raw fiber found: ${!!rawFiber}, type: ${rawFiberName || 'none'}\n` +
                `  getFiberFromElement returned: ${fiber ? 'fiber' : 'null'}, name: "${name}"\n` +
                `  Hint: if no React keys → React root not found or different key prefix`
            );
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
    
    let fiberTreeFound = false;
    function waitForFiberTree(attempts = 0) {
      if (fiberTreeFound) return;
      refreshFiberTree();
      if (state.FIBER_TREE.length > 0) {
        fiberTreeFound = true;
        console.log(`[Overlay] Fiber tree found on attempt ${attempts}`);
        ensureDomMounted();
        renderPanel();
        return;
      }
      const delay = Math.min(attempts < 5 ? 200 : attempts < 15 ? 500 : 2000, 5000);
      setTimeout(() => waitForFiberTree(attempts + 1), delay);
    }

    function hookIntoReactDevTools() {
      const hook = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
      if (!hook) return;
      const origInject = hook.inject;
      if (typeof origInject === 'function') {
        hook.inject = function(...args: any[]) {
          const result = origInject.apply(this, args);
          setTimeout(() => {
            if (!fiberTreeFound) waitForFiberTree(0);
          }, 500);
          return result;
        };
      }
      const origOnCommit = hook.onCommitFiberRoot;
      if (typeof origOnCommit === 'function') {
        hook.onCommitFiberRoot = function(rendererID: any, root: any, ...rest: any[]) {
          if (!fiberTreeFound && root?.current?.child) {
            setTimeout(() => {
              if (!fiberTreeFound) waitForFiberTree(0);
            }, 100);
          }
          return origOnCommit.call(this, rendererID, root, ...rest);
        };
      }
    }

    hookIntoReactDevTools();
    
    if (state.STATIC_TREE && state.STATIC_TREE.length > 0) {
        state.isLoading = false;
        buildStaticComponentMap(state.STATIC_TREE);
        ensureDomMounted();
        setTimeout(() => { if (!state.isOpen) toggle(); }, 100);
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
