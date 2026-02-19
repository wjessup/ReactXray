import { state } from './state';

export const OVERLAY_ID = 'react-xray-overlay-root';

export function getDomFromFiber(fiber: any): any {
    if (!fiber) return null;
    if (fiber.stateNode instanceof Element) return fiber.stateNode;

    const elements: Element[] = [];
    function collectElements(f: any, depth = 0) {
        if (!f || depth > 50) return;
        if (f.stateNode instanceof Element) {
            elements.push(f.stateNode);
            return;
        }
        let child = f.child;
        while (child) {
            collectElements(child, depth + 1);
            child = child.sibling;
        }
    }
    collectElements(fiber);

    if (elements.length === 0) return null;
    if (elements.length === 1) return elements[0];

    let minTop = Infinity, minLeft = Infinity, maxBottom = 0, maxRight = 0;
    for (const el of elements) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        minTop = Math.min(minTop, rect.top);
        minLeft = Math.min(minLeft, rect.left);
        maxBottom = Math.max(maxBottom, rect.bottom);
        maxRight = Math.max(maxRight, rect.right);
    }

    return {
        getBoundingClientRect: () => ({
            top: minTop, left: minLeft, bottom: maxBottom, right: maxRight,
            width: maxRight - minLeft, height: maxBottom - minTop,
            x: minLeft, y: minTop
        }),
        _elements: elements
    };
}

export function getReactFiber(el: any): any {
    const keys = Object.keys(el);
    const fiberKey = keys.find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
    return fiberKey ? el[fiberKey] : null;
}

export function getFiberFromElement(el: any): any {
    const fiber = getReactFiber(el);
    if (!fiber) return null;
    let current = fiber;
    const seen = new Set();
    while (current) {
        if (seen.has(current)) break;
        seen.add(current);
        const name = getFiberName(current);
        if (name && !/^[a-z]/.test(name) && name !== 'Fragment') {
            return current;
        }
        current = current.return;
    }
    return fiber;
}

export function getFiberName(fiber: any): string | null {
    if (!fiber?.type) return null;
    const type = fiber.type;
    if (typeof type === 'string') return null;
    if (typeof type === 'function') return type.displayName || type.name || null;
    if (typeof type === 'object') {
        if (type.displayName) return type.displayName;
        if (type.render?.displayName) return type.render.displayName;
        if (type.render?.name) return type.render.name;
    }
    return null;
}

export function isOverlayElement(el: any): boolean {
    if (!el) return false;
    let current = el;
    while (current) {
        if (current === state.host || current.id === OVERLAY_ID) return true;
        if (current === state.hoverHighlight || current === state.selectedHighlight) return true;
        
        // Shadow DOM check (if event retargeted)
        if (current instanceof ShadowRoot && current === state.shadow) return true;
        
        current = current.parentElement;
    }
    return false;
}

export function findReactRoot(): any {
    const candidates = [
        document.getElementById('root'),
        document.getElementById('__next'),
        document.documentElement,
        document.body
    ].filter(Boolean);

    for (const el of candidates as HTMLElement[]) {
        const containerKey = Object.keys(el).find(k =>
            k.startsWith('__reactContainer$') || k.startsWith('_reactRootContainer')
        );
        if (containerKey) {
            // @ts-ignore
            const container = el[containerKey];
            if (container?.current) return container;
            if (container?._internalRoot) return container._internalRoot;
            if (container) return container;
        }

        const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
        if (fiberKey) {
            // @ts-ignore
            let fiber = el[fiberKey];
            while (fiber.return) {
                fiber = fiber.return;
            }
            return { current: fiber };
        }
    }
    return null;
}

export function extractSourceLocation(fiber: any): any {
    if (fiber._debugSource) {
        return { fileName: fiber._debugSource.fileName, lineNumber: fiber._debugSource.lineNumber };
    }
    if (fiber.type?.__source) {
        return { fileName: fiber.type.__source.fileName, lineNumber: fiber.type.__source.lineNumber };
    }
    if (fiber.type?._source) {
        return { fileName: fiber.type._source.fileName, lineNumber: fiber.type._source.lineNumber };
    }
    return null;
}

export function escapeHtml(str: string) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
}

export function formatValue(value: any, maxLength = 50): string {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'function') return 'ƒ ' + (value.name || '()');
    if (typeof value === 'symbol') return value.toString();
    
    try {
        let str;
        if (typeof value === 'object') {
            if (Array.isArray(value)) str = '[Array(' + value.length + ')]';
            else str = '{...}'; // Simplified
        } else {
            str = String(value);
        }
        
        if (str.length > maxLength) return str.slice(0, maxLength) + '...';
        return str;
    } catch {
        return '[Error]';
    }
}
