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
            else str = '{...}';
        } else {
            str = String(value);
        }
        
        if (str.length > maxLength) return str.slice(0, maxLength) + '...';
        return str;
    } catch {
        return '[Error]';
    }
}

export function hasAnyFiberDescendant(node: any): boolean {
    if (node.hasFiber || node.isBridge) return true;
    for (const child of (node.children || [])) {
        if (hasAnyFiberDescendant(child)) return true;
    }
    return false;
}

export function findNodeById(nodes: any[], id: string, prefix = ''): any {
    for (let i = 0; i < nodes.length; i++) {
        const nodeId = prefix ? prefix + '-' + i : String(i);
        if (nodeId === id) return nodes[i];
        if (nodes[i].children?.length) {
            const found = findNodeById(nodes[i].children, id, nodeId);
            if (found) return found;
        }
    }
    return null;
}

export function getComponentStack(el: any): string[] {
    const fiber = getReactFiber(el);
    if (!fiber) return [];
    const stack: string[] = [];
    let current = fiber;
    const seen = new Set();
    while (current && stack.length < 15) {
        if (seen.has(current)) break;
        seen.add(current);
        const name = getFiberName(current);
        if (name && name.length > 1 && !name.startsWith('_') && name !== 'Fragment' && !/^[a-z]/.test(name)) {
            if (stack.length === 0 || stack[stack.length - 1] !== name) stack.push(name);
        }
        current = current.return;
    }
    return stack;
}

export function findElementsByComponentName(name: string): Element[] {
    const results: Element[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node: Node | null;
    while (node = walker.nextNode()) {
        if (isOverlayElement(node)) continue;
        const fiber = getReactFiber(node);
        if (!fiber) continue;
        let current = fiber;
        const seen = new Set();
        while (current) {
            if (seen.has(current)) break;
            seen.add(current);
            if (getFiberName(current) === name) {
                results.push(node as Element);
                break;
            }
            current = current.return;
        }
    }
    return results;
}

export function getParentName(displayTree: any[], nodeId: string): string | null {
    const parts = nodeId.split('-').map(Number);
    if (parts.length < 2) return null;
    let current = displayTree;
    for (let i = 0; i < parts.length - 1; i++) {
        const node = current[parts[i]];
        if (!node) return null;
        if (i === parts.length - 2) return node.component?.name || null;
        current = node.children || [];
    }
    return null;
}

export function getSiblingIndex(displayTree: any[], nodeId: string): number {
    const parts = nodeId.split('-').map(Number);
    if (parts.length === 0) return 0;
    let current = displayTree;
    for (let i = 0; i < parts.length - 1; i++) {
        current = current[parts[i]]?.children || [];
    }
    const idx = parts[parts.length - 1];
    const node = current[idx];
    if (!node?.component?.name) return 0;
    const name = node.component.name;
    let sibIdx = 0;
    for (let i = 0; i < idx; i++) {
        if (current[i]?.component?.name === name) sibIdx++;
    }
    return sibIdx;
}

export function getFiberParentName(el: any): string | null {
    const fiber = getReactFiber(el);
    if (!fiber) return null;
    let current = fiber.return;
    const seen = new Set();
    while (current) {
        if (seen.has(current)) break;
        seen.add(current);
        const name = getFiberName(current);
        if (name) return name;
        current = current.return;
    }
    return null;
}

export function getFiberSiblingIndex(el: any, componentName: string): number {
    const fiber = getReactFiber(el);
    if (!fiber?.return) return 0;
    let child = fiber.return.child;
    let idx = 0;
    while (child) {
        if (child === fiber) return idx;
        if (getFiberName(child) === componentName) idx++;
        child = child.sibling;
    }
    return 0;
}

export function findBestMatchingElement(displayTree: any[], node: any, nodeId: string): any {
    if (!node.component) return null;
    if (node.fiber) {
        const domEl = getDomFromFiber(node.fiber);
        if (domEl) return domEl;
    }
    const name = node.component.name;
    const allMatches = findElementsByComponentName(name);
    if (allMatches.length === 0) return null;
    if (allMatches.length === 1) return allMatches[0];

    const parentName = getParentName(displayTree, nodeId);
    const sibIdx = getSiblingIndex(displayTree, nodeId);

    for (const el of allMatches) {
        if (getFiberParentName(el) === parentName && getFiberSiblingIndex(el, name) === sibIdx) {
            return el;
        }
    }
    for (const el of allMatches) {
        if (getFiberParentName(el) === parentName) return el;
    }
    return allMatches[0];
}

export function findNodeByAncestry(nodes: any[], stack: string[], prefix: string, currentPath: string[]): any {
    if (stack.length === 0) return null;
    const targetName = stack[0];
    const parentNames = stack.slice(1);

    let bestMatch: any = null;
    let bestScore = -1;

    for (let i = 0; i < nodes.length; i++) {
        const nodeId = prefix ? prefix + '-' + i : String(i);
        const nodeName = nodes[i].component?.name;
        const newPath = nodeName ? [...currentPath, nodeName] : currentPath;

        if (nodeName === targetName) {
            let score = 0;
            const pathRev = [...currentPath].reverse();
            for (let j = 0; j < Math.min(parentNames.length, pathRev.length); j++) {
                if (parentNames[j] === pathRev[j]) score += 10 - j;
            }
            if (score > bestScore || (score === bestScore && !bestMatch)) {
                bestScore = score;
                bestMatch = { node: nodes[i], nodeId, score };
            }
        }

        if (nodes[i].children?.length) {
            const childResult = findNodeByAncestry(nodes[i].children, stack, nodeId, newPath);
            if (childResult && childResult.score > bestScore) {
                bestScore = childResult.score;
                bestMatch = childResult;
            }
        }
    }

    if (bestMatch) bestMatch.score = bestScore;
    return bestMatch;
}

export function findFirstNodeWithName(nodes: any[], name: string, prefix = ''): any {
    for (let i = 0; i < nodes.length; i++) {
        const nodeId = prefix ? prefix + '-' + i : String(i);
        if (nodes[i].component?.name === name) return { node: nodes[i], nodeId };
        if (nodes[i].children?.length) {
            const found = findFirstNodeWithName(nodes[i].children, name, nodeId);
            if (found) return found;
        }
    }
    return null;
}

/**
 * Helper function to create DOM elements with properties and children.
 * 
 * @param tag The tag name of the element (e.g., 'div', 'span').
 * @param props An object containing properties to set on the element. 
 *              Supports `className`, `style` (object), `dataset` (object), 
 *              event listeners (starting with `on`), `dangerouslySetInnerHTML`, 
 *              and standard attributes.
 * @param children Child nodes or strings to append to the element. 
 *                 Can be strings, Numbers, DOM Nodes, or arrays of these.
 * @returns The created HTMLElement.
 */
export function h(tag: string, props: Record<string, any> | null = null, ...children: any[]): HTMLElement {
    const el = document.createElement(tag);
    if (props) {
        for (const key in props) {
            const val = props[key];
            if (key.startsWith('on') && typeof val === 'function') {
                el.addEventListener(key.substring(2).toLowerCase(), val);
            } else if (key === 'style' && typeof val === 'object') {
                Object.assign(el.style, val);
            } else if (key === 'className') {
                el.className = val;
            } else if (key === 'dataset' && typeof val === 'object') {
                Object.assign(el.dataset, val);
            } else if (key === 'dangerouslySetInnerHTML') {
                el.innerHTML = val.__html;
            } else if (val !== false && val !== null && val !== undefined) {
                el.setAttribute(key, val === true ? '' : String(val));
            }
        }
    }
    
    const append = (child: any) => {
        if (Array.isArray(child)) {
            child.forEach(append);
        } else if (child instanceof Node) {
            el.appendChild(child);
        } else if (child !== null && child !== undefined && child !== false) {
            el.appendChild(document.createTextNode(String(child)));
        }
    };
    
    children.forEach(append);
    return el;
}
