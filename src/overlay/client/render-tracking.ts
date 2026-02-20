import { state } from './state';
import { getFiberName, extractSourceLocation, isOverlayElement } from './utils';

let pendingRenderUpdates = new Set<string>();
let renderUpdateScheduled = false;

function flushRenderUpdates() {
    renderUpdateScheduled = false;
    if (state.isPaused || !state.shadow) return;

    for (const name of pendingRenderUpdates) {
        const count = state.renderCounts.get(name) || 0;
        state.shadow.querySelectorAll(`.node[data-name="${name}"] .render-count`).forEach((el: any) => {
            el.textContent = count;
            el.style.opacity = '1';
        });
    }
    pendingRenderUpdates.clear();

    const totalEl = state.shadow.querySelector('#total-renders');
    if (totalEl) totalEl.textContent = state.totalRenders.toString();
}

function trackRender(name: string) {
    if (!name || state.isPaused) return;
    const count = (state.renderCounts.get(name) || 0) + 1;
    state.renderCounts.set(name, count);
    state.totalRenders++;

    pendingRenderUpdates.add(name);
    if (!renderUpdateScheduled) {
        renderUpdateScheduled = true;
        requestAnimationFrame(flushRenderUpdates);
    }
}

function findChangedFibers(fiber: any, seen: Set<any>) {
    if (!fiber || seen.has(fiber) || state.isPaused) return;
    seen.add(fiber);

    if (fiber.stateNode instanceof Element && isOverlayElement(fiber.stateNode)) return;

    const flags = fiber.flags ?? fiber.effectTag ?? 0;
    const hasUpdate = (flags & 4) !== 0;
    const hasCallback = (flags & 32) !== 0; // Callback or ref
    const didWork = hasUpdate || hasCallback || (fiber.alternate && fiber.memoizedState !== fiber.alternate.memoizedState);

    if (didWork) {
        const name = getFiberName(fiber);
        if (name) {
            trackRender(name);
        }
    }

    if (fiber.child) findChangedFibers(fiber.child, seen);
    if (fiber.sibling) findChangedFibers(fiber.sibling, seen);
}

export function setupRenderTracking() {
    const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!hook) return false;

    const orig = hook.onCommitFiberRoot;
    let commitScanScheduled = false;
    // @ts-ignore
    let pendingCommitRoot = null;
    
    hook.onCommitFiberRoot = function (rendererID: any, fiberRoot: any, ...args: any[]) {
        if (orig) orig.call(this, rendererID, fiberRoot, ...args);
        if (state.isPaused) return;
        pendingCommitRoot = fiberRoot?.current || null;
        if (commitScanScheduled) return;
        commitScanScheduled = true;
        
        requestAnimationFrame(() => {
            commitScanScheduled = false;
            // @ts-ignore
            const root = pendingCommitRoot;
            pendingCommitRoot = null;
            if (!root || state.isPaused) return;
            try {
                findChangedFibers(root, new Set());
            } catch { }
        });
    };
    return true;
}
