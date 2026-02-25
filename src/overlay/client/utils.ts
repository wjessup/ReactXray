import { state } from './state';

export const OVERLAY_ID = 'react-xray-overlay-root';

export function resolveFilePath(relativePath: string): string {
    if (!relativePath) return relativePath;
    if (/^[A-Z]:\\/i.test(relativePath) || relativePath.startsWith('/')) return relativePath;
    if (!state.PROJECT_PATH) return relativePath;
    const sep = state.PROJECT_PATH.includes('\\') ? '\\' : '/';
    const base = state.PROJECT_PATH.endsWith(sep) ? state.PROJECT_PATH : state.PROJECT_PATH + sep;
    return base + relativePath.replace(/\//g, sep);
}

export function getDomFromFiber(fiber: any): any {
    if (!fiber) return null;
    const activeFiber = fiber.alternate && fiber.alternate.child && !fiber.child ? fiber.alternate : fiber;
    if (activeFiber.stateNode instanceof Element) return activeFiber.stateNode;

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
    collectElements(activeFiber);

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
    // Try specific known IDs first, then scan body children, then fallback to body/html
    const specificCandidates = [
        document.getElementById('root'),
        document.getElementById('__next'),
        document.getElementById('app'),
        document.getElementById('__app'),
    ].filter(Boolean) as HTMLElement[];

    // Also scan direct children of body for any React root
    const bodyChildren: HTMLElement[] = [];
    if (document.body) {
        for (let i = 0; i < document.body.children.length; i++) {
            const child = document.body.children[i] as HTMLElement;
            if (child && !specificCandidates.includes(child)) {
                bodyChildren.push(child);
            }
        }
    }

    const fallbackCandidates = [document.body, document.documentElement].filter(Boolean) as HTMLElement[];
    const allCandidates = [...specificCandidates, ...bodyChildren, ...fallbackCandidates];

    for (const el of allCandidates) {
        const result = findRootFromElement(el);
        if (result) return result;
    }

    // Fallback: try React DevTools global hook
    const hook = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (hook) {
        // React DevTools hook stores fiber roots in a Map
        const fiberRoots = hook._fiberRoots || hook.fiberRoots;
        if (fiberRoots && fiberRoots.size > 0) {
            const firstRoot = fiberRoots.values().next().value;
            if (firstRoot?.current) return firstRoot;
        }

        // Also check renderers for roots
        if (hook.renderers) {
            for (const [, renderer] of hook.renderers) {
                if (renderer?.findFiberByHostInstance) {
                    // Try to get fiber from known root elements
                    for (const el of specificCandidates) {
                        const fiber = renderer.findFiberByHostInstance(el);
                        if (fiber) {
                            let root = fiber;
                            while (root.return) root = root.return;
                            return { current: root };
                        }
                    }
                }
            }
        }
    }

    return null;
}

function findRootFromElement(el: HTMLElement): any {
    const keys = Object.keys(el);

    // Check for React 18 createRoot container key
    const containerKey = keys.find(k =>
        k.startsWith('__reactContainer$') || k.startsWith('_reactRootContainer')
    );
    if (containerKey) {
        // @ts-ignore
        const container = el[containerKey];
        // React 18 createRoot: container is a FiberRootNode with .current
        if (container?.current) return container;
        // React 17 ReactDOM.render: container has _internalRoot.current
        if (container?._internalRoot?.current) return container._internalRoot;
        // React 18: __reactContainer$ sometimes stores a fiber node directly
        // Walk up to the root fiber and wrap it
        if (container && container.tag !== undefined) {
            let fiber = container;
            while (fiber.return) fiber = fiber.return;
            // If this fiber is the HostRoot (tag 3), its stateNode is the FiberRootNode
            if (fiber.stateNode?.current) return fiber.stateNode;
            return { current: fiber };
        }
        if (container) return container;
    }

    // Check for React fiber key on the element
    const fiberKey = keys.find(k =>
        k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
    );
    if (fiberKey) {
        // @ts-ignore
        let fiber = el[fiberKey];
        while (fiber.return) fiber = fiber.return;
        // HostRoot fiber's stateNode is the FiberRootNode
        if (fiber.stateNode?.current) return fiber.stateNode;
        return { current: fiber };
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

export function getAncestryNames(displayTree: any[], nodeId: string): string[] {
    const parts = nodeId.split('-').map(Number);
    const names: string[] = [];
    let current = displayTree;
    for (let i = 0; i < parts.length - 1; i++) {
        const node = current[parts[i]];
        if (!node) break;
        const name = node.component?.name;
        if (name) names.push(name);
        current = node.children || [];
    }
    return names;
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

export function getParentNode(displayTree: any[], nodeId: string): any | null {
    const parts = nodeId.split('-').map(Number);
    if (parts.length < 2) return null;
    let current = displayTree;
    for (let i = 0; i < parts.length - 1; i++) {
        const node = current[parts[i]];
        if (!node) return null;
        if (i === parts.length - 2) return node;
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
