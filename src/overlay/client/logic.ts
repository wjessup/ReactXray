import { state, callbacks } from './state';
import { findReactRoot, getFiberName, extractSourceLocation, getDomFromFiber, resetFiberKeyCache, invalidateDisplayNamesCache } from './utils';
import {
  buildFiberLookupByName,
  mergeStaticWithFiber,
  sortFiberLookupForMerge,
} from '../runtime-logic.js';


function buildFiberTree(fiber: any, depth = 0): any[] {
    if (!fiber || depth > 150) return [];
    const nodes = [];
    let current = fiber;
    const seen = new Set();
    while (current) {
        if (seen.has(current)) break;
        seen.add(current);
        const name = getFiberName(current);
        const source = extractSourceLocation(current);
        if (name && !/^[a-z]/.test(name) && name !== 'Fragment') {
            nodes.push({
                name,
                source,
                children: buildFiberTree(current.child, depth + 1),
                fiber: current
            });
        } else if (current.child) {
            nodes.push(...buildFiberTree(current.child, depth + 1));
        }
        current = current.sibling;
    }
    return nodes;
}


function buildElementToFiberMap(fiber: any, map: WeakMap<Element, any>, parentNamedFiber: any = null) {
    if (!fiber) return;
    let current: any = fiber;
    const seen = new Set();
    while (current) {
        if (seen.has(current)) break;
        seen.add(current);
        const name = getFiberName(current);
        const isNamed = name && !/^[a-z]/.test(name) && name !== 'Fragment';
        const activeFiber = isNamed ? current : parentNamedFiber;
        if (current.stateNode instanceof Element && activeFiber) {
            map.set(current.stateNode, activeFiber);
        }
        if (current.child) {
            buildElementToFiberMap(current.child, map, activeFiber);
        }
        current = current.sibling;
    }
}

function captureFullFiberTree() {
    const root = findReactRoot();
    if (!root?.current) return [];
    if (!root.current.child) return [];
    const map = new WeakMap<Element, any>();
    buildElementToFiberMap(root.current.child, map);
    state.elementToFiberMap = map;
    return buildFiberTree(root.current);
}

let componentAllowlist = new Set<string>();
let allowlistLoaded = false;
let filterEnabled = true; // Should be in state? Yes, but module var for now assuming single instance

const staticComponentMap = new Map<string, any>();

export function buildStaticComponentMap(nodes: any[]) {
    for (const node of nodes) {
        if (node.component && node.component.name) {
            if (!staticComponentMap.has(node.component.name)) {
                staticComponentMap.set(node.component.name, node.component);
            }
        }
        if (node.children) buildStaticComponentMap(node.children);
    }
}

export function getStaticComponent(name: string) {
    return staticComponentMap.get(name);
}

export async function loadComponentAllowlist() {
    try {
        const res = await fetch('/__overlay_allowlist.json');
        const data = await res.json();
        if (data.components && Array.isArray(data.components)) {
            componentAllowlist = new Set(data.components);
            allowlistLoaded = true;
        }
    } catch (err) {
        console.warn('[Overlay] Failed to load component allowlist:', err);
    }
}

function isProjectComponent(name: string, source: any) {
    if (!filterEnabled) return true;
    if (!allowlistLoaded) return true;
    if (componentAllowlist.has(name)) return true;
    if (source?.fileName) return !source.fileName.includes('node_modules');
    return false;
}

function filterFiberTree(nodes: any[]): any[] {
    const result = [];
    for (const node of nodes) {
        const isProject = isProjectComponent(node.name, node.source);
        const filteredChildren = filterFiberTree(node.children);

        if (isProject) {
            result.push({
                ...node,
                children: filteredChildren
            });
        } else {
            result.push(...filteredChildren);
        }
    }
    return result;
}

function annotateFiberPositions(nodes: any[]) {
    for (const node of nodes) {
        const dom = getDomFromFiber(node.fiber);
        const el = dom instanceof Element ? dom : dom?._elements?.[0];
        if (el) {
            const r = el.getBoundingClientRect();
            node.__roY = r.top + window.scrollY;
            node.__roX = r.left + window.scrollX;
        }
        if (node.children) annotateFiberPositions(node.children);
    }
}

function detectMinified(nodes: any[]): boolean {
    const names: string[] = [];
    function collect(list: any[]) {
        for (const n of list) {
            if (n.name) names.push(n.name);
            if (n.children) collect(n.children);
        }
    }
    collect(nodes);
    if (names.length < 3) return false;
    const singleChar = names.filter(n => n.length <= 2).length;
    return singleChar / names.length > 0.5;
}

function countServerOnlyNodes(nodes: any[]): number {
    return nodes.reduce((acc, n) => {
        const isSelf = n.isServerOnly ? 1 : 0;
        return acc + isSelf + countServerOnlyNodes(n.children || []);
    }, 0);
}

function countClientNodes(nodes: any[]): number {
    return nodes.reduce((acc, n) => {
        const isClient = n.component?.isClientComponent || n.isBridge ? 1 : 0;
        return acc + isClient + countClientNodes(n.children || []);
    }, 0);
}

let lastSavedTreeHash = '';
function saveCalculatedTree() {
    // Need stripFiberRefs from utils? Or duplicate it?
    // Doing simplified strip here
    function strip(nodes: any[]): any[] {
        return nodes.map(n => ({
            file: n.file,
            component: n.component,
            source: n.source,
            hasFiber: !!n.fiber,
            children: strip(n.children || [])
        }));
    }
    const cleanTree = strip(state.TREE);
    const json = JSON.stringify(cleanTree, null, 2);
    const hash = json.length + '-' + json.slice(0, 100);
    if (hash === lastSavedTreeHash) return;
    lastSavedTreeHash = hash;

    fetch('/__save_calculated_tree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: json,
    }).catch(() => { });
}

export function refreshFiberTree() {
    resetFiberKeyCache();
    state.FIBER_TREE = captureFullFiberTree();
    state.isMinified = detectMinified(state.FIBER_TREE);

    if (state.FIBER_TREE.length === 0) return;

    invalidateDisplayNamesCache();
    const filtered = filterEnabled ? filterFiberTree(state.FIBER_TREE) : state.FIBER_TREE;
    annotateFiberPositions(filtered);
    const fiberLookup = buildFiberLookupByName(filtered);
    sortFiberLookupForMerge(fiberLookup);

    state.TREE = mergeStaticWithFiber(JSON.parse(JSON.stringify(state.STATIC_TREE)), fiberLookup);

    const serverCount = countServerOnlyNodes(state.TREE);
    const clientCount = countClientNodes(state.TREE);

    let totalComps = 0;
    let matchedComps = 0;
    const countNodes = (nodes: any[]) => {
        for (const n of nodes) {
            if (n.component) { totalComps++; if (n.hasFiber) matchedComps++; }
            if (n.children) countNodes(n.children);
        }
    };
    countNodes(state.TREE);

    console.log(
        `[Overlay] Components: ${matchedComps} matched / ${totalComps} static` +
        ` | Fibers: ${fiberLookup.size} unique` +
        ` | Server: ${serverCount}, Client: ${clientCount}`
    );

    state.STATS = {
        totalComponents: totalComps,
        serverComponents: serverCount,
        clientComponents: clientCount,
        fiberNodes: fiberLookup.size,
        matchedComponents: matchedComps,
    };

    if (!state.isLoading) {
        callbacks.render();
    }
    saveCalculatedTree();
}

let lastAnalyzedRoute = window.location.pathname;

export async function refreshAnalysis() {
    state.isLoading = true;
    callbacks.render();

    try {
        const res = await fetch('/__overlay_data.json?route=' + encodeURIComponent(window.location.pathname));
        const data = await res.json();

        if (data.componentTree) {
            state.STATIC_TREE = data.componentTree; // Replace array
            staticComponentMap.clear();
            buildStaticComponentMap(state.STATIC_TREE);
        }

        if (data.stats) {
            state.STATS = data.stats;
        }

        if (data.architectureAnalysis) {
            state.ARCHITECTURE = data.architectureAnalysis;
        }

        if (data.projectPath) {
            state.PROJECT_PATH = data.projectPath;
        }

        state.ROUTE = window.location.pathname;
        lastAnalyzedRoute = state.ROUTE;

        // Non-blocking fetch for deps
        fetch('/__overlay_deps.json?route=' + encodeURIComponent(window.location.pathname))
            .then(r => r.json())
            .then(depsData => {
                if (!depsData.error) {
                    state.DEPS = depsData;
                } else {
                    state.DEPS = null;
                }
                callbacks.render();
            })
            .catch(() => {
                state.DEPS = null;
                callbacks.render();
            });

        if (state.FIBER_TREE.length > 0) {
            refreshFiberTree();
        }
    } catch (err) {
        console.warn('[Overlay] Failed to refresh analysis:', err);
    }

    state.isLoading = false;
    callbacks.render();
}

export function checkForRouteChange() {
    const currentRoute = window.location.pathname;
    if (currentRoute !== lastAnalyzedRoute) {
        refreshAnalysis();
    }
}

export function toggle() {
    state.isOpen = !state.isOpen;
    document.body.style.marginRight = state.isOpen ? state.panelWidth + 'px' : '';
    callbacks.render();
    if (callbacks.onToggle) callbacks.onToggle(state.isOpen);
}

export function toggleFilter() {
    filterEnabled = !filterEnabled;
    refreshFiberTree();
}

export function getFilterEnabled() {
    return filterEnabled;
}

// Assign to callbacks for external use
callbacks.refresh = refreshAnalysis;
