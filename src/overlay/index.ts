import type { RouteAnalysis } from "../types.js";
import { OVERLAY_CSS, HIGHLIGHT_CSS } from "./styles.js";

export function generateOverlayScript(data: RouteAnalysis): string {
  const treeJson = JSON.stringify(data.componentTree);
  const statsJson = JSON.stringify(data.stats);
  const routeJson = JSON.stringify(data.route);

  return `(function() {
  if (window.__REPO_OVERLAY__) {
    window.__REPO_OVERLAY__.toggle();
    return;
  }

  const OVERLAY_ID = '__repo_overlay_' + Math.random().toString(36).slice(2);

  const STATIC_TREE = ${treeJson};
  let TREE = JSON.parse(JSON.stringify(STATIC_TREE));
  let STATS = ${statsJson};
  let ROUTE = ${routeJson};

  let panelWidth = parseInt(localStorage.getItem('ro-panel-width') || '380', 10);
  let isOpen = false;
  let isLoading = true;
  let isPaused = false;
  let searchTerm = '';
  let ignoredPaths = JSON.parse(localStorage.getItem('ro-ignored-paths') || '[]');
  let settingsOpen = false;

  const renderCounts = new Map();
  let totalRenders = 0;

  const networkRequests = [];
  const componentNetworkMap = new Map();

  let selectedFiber = null;
  let selectedElement = null;

  function getDomFromFiber(fiber) {
    if (!fiber) return null;
    if (fiber.stateNode instanceof Element) return fiber.stateNode;
    
    const elements = [];
    function collectElements(f, depth = 0) {
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

  function getFiberFromElement(el) {
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

  const host = document.createElement('div');
  host.id = OVERLAY_ID;
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = \`${OVERLAY_CSS}\`;
  shadow.appendChild(style);

  const highlightStyle = document.createElement('style');
  highlightStyle.textContent = \`${HIGHLIGHT_CSS}\`;
  document.head.appendChild(highlightStyle);

  const container = document.createElement('div');
  container.style.cssText = '--panel-width:' + panelWidth + 'px';
  shadow.appendChild(container);

  let hoverHighlight = null;
  let selectedHighlight = null;

  function createHoverHighlight() {
    if (hoverHighlight) return hoverHighlight;
    hoverHighlight = document.createElement('div');
    hoverHighlight.className = 'overlay-highlight';
    hoverHighlight.innerHTML = '<span class="label"></span>';
    document.body.appendChild(hoverHighlight);
    return hoverHighlight;
  }

  function showHoverHighlight(el, label) {
    if (!el) return;
    const hl = createHoverHighlight();
    const rect = el.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0 || !isFinite(rect.top)) {
      hl.style.display = 'none';
      return;
    }
    hl.style.cssText = \`
      position:fixed;top:\${rect.top}px;left:\${rect.left}px;
      width:\${rect.width}px;height:\${rect.height}px;display:block;
    \`;
    hl.querySelector('.label').textContent = label;
  }

  function hideHoverHighlight() {
    if (hoverHighlight) hoverHighlight.style.display = 'none';
  }

  function createSelectedHighlight() {
    if (selectedHighlight) return selectedHighlight;
    selectedHighlight = document.createElement('div');
    selectedHighlight.className = 'overlay-highlight selected';
    selectedHighlight.innerHTML = '<span class="label"></span>';
    document.body.appendChild(selectedHighlight);
    return selectedHighlight;
  }

  function showSelectedHighlight(el, label) {
    if (!el) return;
    const hl = createSelectedHighlight();
    const rect = el.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0 || !isFinite(rect.top)) {
      hl.style.display = 'none';
      return;
    }
    hl.style.cssText = \`
      position:absolute;top:\${rect.top + window.scrollY}px;left:\${rect.left + window.scrollX}px;
      width:\${rect.width}px;height:\${rect.height}px;display:block;
    \`;
    hl.querySelector('.label').textContent = label;
  }

  function hideSelectedHighlight() {
    if (selectedHighlight) selectedHighlight.style.display = 'none';
  }

  function getReactFiber(el) {
    const keys = Object.keys(el);
    const fiberKey = keys.find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
    return fiberKey ? el[fiberKey] : null;
  }

  function getFiberName(fiber) {
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

  function isOverlayElement(el) {
    if (!el) return false;
    let current = el;
    while (current) {
      if (current === host || current.id === OVERLAY_ID) return true;
      if (current === hoverHighlight || current === selectedHighlight) return true;
      current = current.parentElement;
    }
    return false;
  }

  function findReactRoot() {
    const candidates = [
      document.getElementById('root'),
      document.getElementById('__next'),
      document.documentElement,
      document.body
    ].filter(Boolean);

    for (const el of candidates) {
      const containerKey = Object.keys(el).find(k =>
        k.startsWith('__reactContainer$') || k.startsWith('_reactRootContainer')
      );
      if (containerKey) {
        const container = el[containerKey];
        if (container?.current) return container;
        if (container?._internalRoot) return container._internalRoot;
        if (container) return container;
      }

      const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
      if (fiberKey) {
        let fiber = el[fiberKey];
        while (fiber.return) {
          fiber = fiber.return;
        }
        return { current: fiber };
      }
    }
    return null;
  }

  function extractSourceLocation(fiber) {
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

  function buildFiberTree(fiber, depth = 0) {
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

  function captureFullFiberTree() {
    const root = findReactRoot();
    if (!root?.current) return [];
    return buildFiberTree(root.current);
  }

  function convertFiberTreeToDisplayFormat(fiberNodes, staticNamesInPath = new Set()) {
    return fiberNodes
      .filter(node => !staticNamesInPath.has(node.name))
      .map(node => {
        const staticInfo = staticComponentMap.get(node.name);
        return {
          file: staticInfo?.filePath || node.source?.fileName || 'unknown',
          component: staticInfo || { name: node.name },
          children: convertFiberTreeToDisplayFormat(node.children, staticNamesInPath),
          source: node.source,
          fiber: node.fiber,
          hasFiber: true,
        };
      });
  }

  let FIBER_TREE = [];
  let componentAllowlist = new Set();
  let allowlistLoaded = false;
  let filterEnabled = true;
  
  const staticComponentMap = new Map();
  
  function buildStaticComponentMap(nodes) {
    for (const node of nodes) {
      if (node.component && node.component.name) {
        if (!staticComponentMap.has(node.component.name)) {
          staticComponentMap.set(node.component.name, node.component);
        }
      }
      if (node.children) buildStaticComponentMap(node.children);
    }
  }
  
  buildStaticComponentMap(STATIC_TREE);

  async function loadComponentAllowlist() {
    try {
      const res = await fetch('/__overlay_allowlist.json');
      const data = await res.json();
      if (data.components && Array.isArray(data.components)) {
        componentAllowlist = new Set(data.components);
        allowlistLoaded = true;
        console.log('[Overlay] Loaded ' + componentAllowlist.size + ' project components');
      }
    } catch (err) {
      console.warn('[Overlay] Failed to load component allowlist:', err);
    }
  }

  function isProjectComponent(name, source) {
    if (!filterEnabled) return true;
    if (!allowlistLoaded) return true;
    if (componentAllowlist.has(name)) return true;
    if (source?.fileName && source.fileName.includes('node_modules')) return false;
    return false;
  }

  function filterFiberTree(nodes) {
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

  function buildFiberLookupByName(fiberNodes, lookup = new Map()) {
    for (const node of fiberNodes) {
      if (node.name) {
        if (!lookup.has(node.name)) lookup.set(node.name, []);
        lookup.get(node.name).push(node);
      }
      if (node.children) buildFiberLookupByName(node.children, lookup);
    }
    return lookup;
  }

  function collectStaticNames(nodes, names = new Set()) {
    for (const node of nodes) {
      if (node.component?.name) names.add(node.component.name);
      if (node.children) collectStaticNames(node.children, names);
    }
    return names;
  }

  function mergeStaticWithFiber(staticNodes, fiberLookup, usedFibers = new Set(), staticNamesInTree = null) {
    if (!staticNamesInTree) {
      staticNamesInTree = collectStaticNames(staticNodes);
    }
    
    return staticNodes.map(staticNode => {
      const compName = staticNode.component?.name;
      const isClientComponent = staticNode.component?.isClientComponent;
      
      if (staticNode.file === '{children}') {
        return {
          ...staticNode,
          children: mergeStaticWithFiber(staticNode.children || [], fiberLookup, usedFibers, staticNamesInTree),
          isSlot: true,
        };
      }
      
      let fiberMatch = null;
      if (compName && fiberLookup.has(compName)) {
        const candidates = fiberLookup.get(compName);
        for (const candidate of candidates) {
          if (!usedFibers.has(candidate)) {
            fiberMatch = candidate;
            usedFibers.add(candidate);
            break;
          }
        }
      }
      
      if (fiberMatch && isClientComponent) {
        return {
          file: staticNode.file,
          component: staticNode.component,
          source: fiberMatch.source || { fileName: staticNode.component?.filePath },
          fiber: fiberMatch.fiber,
          children: mergeStaticWithFiber(staticNode.children || [], fiberLookup, usedFibers, staticNamesInTree),
          isBridge: true,
          hasFiber: true,
        };
      }
      
      return {
        file: staticNode.file,
        component: staticNode.component,
        source: staticNode.component?.filePath ? { fileName: staticNode.component.filePath } : null,
        fiber: fiberMatch?.fiber || null,
        children: mergeStaticWithFiber(staticNode.children || [], fiberLookup, usedFibers, staticNamesInTree),
        isServerOnly: !fiberMatch && !isClientComponent,
        hasFiber: !!fiberMatch,
      };
    });
  }

  function refreshFiberTree() {
    FIBER_TREE = captureFullFiberTree();
    const filtered = filterEnabled ? filterFiberTree(FIBER_TREE) : FIBER_TREE;
    const fiberLookup = buildFiberLookupByName(filtered);
    
    TREE = mergeStaticWithFiber(JSON.parse(JSON.stringify(STATIC_TREE)), fiberLookup);
    
    const serverCount = countServerOnlyNodes(TREE);
    const clientCount = countNodes(TREE) - serverCount;
    STATS = { 
      totalComponents: countNodes(TREE),
      serverComponents: serverCount,
      clientComponents: clientCount,
      fiberNodes: fiberLookup.size,
    };
    renderPanel();
    saveCalculatedTree();
  }

  let lastAnalyzedRoute = window.location.pathname;
  
  async function refreshAnalysis() {
    isLoading = true;
    renderPanel();
    
    try {
      const res = await fetch('/__overlay_data.json?route=' + encodeURIComponent(window.location.pathname));
      const data = await res.json();
      
      if (data.componentTree) {
        STATIC_TREE.length = 0;
        STATIC_TREE.push(...data.componentTree);
        
        staticComponentMap.clear();
        buildStaticComponentMap(STATIC_TREE);
      }
      
      if (data.stats) {
        STATS = data.stats;
      }
      
      ROUTE = window.location.pathname;
      lastAnalyzedRoute = ROUTE;
      
      refreshFiberTree();
    } catch (err) {
      console.warn('[Overlay] Failed to refresh analysis:', err);
    }
    
    isLoading = false;
    renderPanel();
  }

  function checkForRouteChange() {
    const currentRoute = window.location.pathname;
    if (currentRoute !== lastAnalyzedRoute) {
      refreshAnalysis();
    }
  }

  window.addEventListener('popstate', checkForRouteChange);
  
  const origPushState = history.pushState;
  history.pushState = function(...args) {
    origPushState.apply(this, args);
    setTimeout(checkForRouteChange, 50);
  };
  
  const origReplaceState = history.replaceState;
  history.replaceState = function(...args) {
    origReplaceState.apply(this, args);
    setTimeout(checkForRouteChange, 50);
  };
  
  let lastSavedTreeHash = '';
  function saveCalculatedTree() {
    const cleanTree = stripFiberRefs(TREE);
    const json = JSON.stringify(cleanTree, null, 2);
    const hash = json.length + '-' + json.slice(0, 100);
    if (hash === lastSavedTreeHash) return;
    lastSavedTreeHash = hash;
    
    fetch('/__save_calculated_tree', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
    }).catch(() => {});
  }
  
  function countServerOnlyNodes(nodes) {
    return nodes.reduce((acc, n) => {
      const isSelf = n.isServerOnly ? 1 : 0;
      return acc + isSelf + countServerOnlyNodes(n.children || []);
    }, 0);
  }

  function countNodes(nodes) {
    return nodes.reduce((acc, n) => acc + 1 + countNodes(n.children), 0);
  }

  function isOverlayFiber(fiber) {
    if (!fiber) return false;
    let node = fiber.stateNode;
    if (node instanceof Element && isOverlayElement(node)) return true;
    return false;
  }

  let pendingRenderUpdates = new Set();
  let renderUpdateScheduled = false;

  function flushRenderUpdates() {
    renderUpdateScheduled = false;
    if (isPaused) return;

    for (const name of pendingRenderUpdates) {
      const count = renderCounts.get(name) || 0;
      shadow.querySelectorAll(\`.node[data-name="\${name}"] .render-count\`).forEach(el => {
        el.textContent = count;
        el.style.opacity = '1';
      });
    }
    pendingRenderUpdates.clear();

    const totalEl = shadow.querySelector('#total-renders');
    if (totalEl) totalEl.textContent = totalRenders;
  }

  function trackRender(name) {
    if (!name || isPaused) return;
    const count = (renderCounts.get(name) || 0) + 1;
    renderCounts.set(name, count);
    totalRenders++;

    pendingRenderUpdates.add(name);
    if (!renderUpdateScheduled) {
      renderUpdateScheduled = true;
      requestAnimationFrame(flushRenderUpdates);
    }
  }

  function findChangedFibers(fiber, seen) {
    if (!fiber || seen.has(fiber) || isPaused) return;
    seen.add(fiber);

    if (isOverlayFiber(fiber)) return;

    const flags = fiber.flags ?? fiber.effectTag ?? 0;
    const hasUpdate = (flags & 4) !== 0;
    const hasCallback = (flags & 32) !== 0;
    const didWork = hasUpdate || hasCallback || (fiber.alternate && fiber.memoizedState !== fiber.alternate.memoizedState);

    if (didWork) {
      const name = getFiberName(fiber);
      if (name) trackRender(name);
    }

    if (fiber.child) findChangedFibers(fiber.child, seen);
    if (fiber.sibling) findChangedFibers(fiber.sibling, seen);
  }

  function setupRenderTracking() {
    const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!hook) return false;

    const orig = hook.onCommitFiberRoot;
    hook.onCommitFiberRoot = function(rendererID, fiberRoot, ...args) {
      if (orig) orig.call(this, rendererID, fiberRoot, ...args);
      try {
        if (fiberRoot.current) findChangedFibers(fiberRoot.current, new Set());
      } catch {}
    };
    return true;
  }

  setupRenderTracking();

  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || 'unknown';
    const method = args[1]?.method || 'GET';
    const stack = new Error().stack || '';
    const componentName = extractComponentFromStack(stack);
    const startTime = performance.now();

    try {
      const response = await origFetch.apply(this, args);
      const duration = Math.round(performance.now() - startTime);
      recordNetworkCall({ url: url.split('?')[0], method, status: response.status, duration, component: componentName });
      return response;
    } catch (err) {
      const duration = Math.round(performance.now() - startTime);
      recordNetworkCall({ url: url.split('?')[0], method, status: 'error', duration, component: componentName });
      throw err;
    }
  };

  function extractComponentFromStack(stack) {
    for (const line of stack.split('\\n')) {
      const match = line.match(/at\\s+([A-Z][a-zA-Z0-9_]*)/);
      if (match && !['Error', 'Object', 'Function', 'Promise', 'Array'].includes(match[1])) {
        return match[1];
      }
    }
    return null;
  }

  function recordNetworkCall(entry) {
    networkRequests.unshift(entry);
    if (networkRequests.length > 100) networkRequests.pop();
    if (entry.component) {
      const list = componentNetworkMap.get(entry.component) || [];
      list.unshift(entry);
      if (list.length > 20) list.pop();
      componentNetworkMap.set(entry.component, list);
    }
  }

  function getComponentStack(el) {
    const fiber = getReactFiber(el);
    if (!fiber) return [];
    const stack = [];
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

  function findElementsByComponentName(name) {
    const results = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node;
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
          results.push(node);
          break;
        }
        current = current.return;
      }
    }
    return results;
  }

  function getLiveComponentData(el, componentName) {
    const fiber = getReactFiber(el);
    if (!fiber) return { props: null, state: [], networkCalls: [] };

    let targetFiber = fiber;
    let current = fiber;
    const seen = new Set();
    while (current) {
      if (seen.has(current)) break;
      seen.add(current);
      if (getFiberName(current) === componentName) {
        targetFiber = current;
        break;
      }
      current = current.return;
    }

    const liveProps = targetFiber.memoizedProps || {};
    const stateValues = [];
    let stateNode = targetFiber.memoizedState;
    let hookIndex = 0;
    while (stateNode && hookIndex < 10) {
      if (stateNode.memoizedState !== undefined && stateNode.memoizedState !== null) {
        const val = stateNode.memoizedState;
        if (typeof val !== 'function' && typeof val?.current === 'undefined') {
          stateValues.push({ index: hookIndex, value: val });
        }
      }
      stateNode = stateNode.next;
      hookIndex++;
    }

    return { props: liveProps, state: stateValues, networkCalls: componentNetworkMap.get(componentName) || [] };
  }

  function getLiveHooks(el, componentName) {
    const fiber = getReactFiber(el);
    if (!fiber) return [];

    let targetFiber = fiber;
    let current = fiber;
    const seen = new Set();
    while (current) {
      if (seen.has(current)) break;
      seen.add(current);
      if (getFiberName(current) === componentName) {
        targetFiber = current;
        break;
      }
      current = current.return;
    }

    const hooks = [];
    let hookNode = targetFiber.memoizedState;
    let idx = 0;
    while (hookNode && idx < 20) {
      let hookType = 'unknown';
      let value = null;
      
      if (hookNode.queue !== undefined && hookNode.baseState !== undefined) {
        hookType = 'useState';
        value = hookNode.memoizedState;
      } else if (hookNode.tag !== undefined && (hookNode.destroy !== undefined || hookNode.create !== undefined)) {
        const tag = hookNode.tag;
        if (tag & 4) hookType = 'useLayoutEffect';
        else if (tag & 2) hookType = 'useEffect';
        else hookType = 'useEffect';
        value = null;
      } else if (hookNode.memoizedState && typeof hookNode.memoizedState === 'object' && 'current' in hookNode.memoizedState) {
        hookType = 'useRef';
        value = hookNode.memoizedState.current;
      } else if (Array.isArray(hookNode.deps)) {
        hookType = 'useMemo/useCallback';
        value = hookNode.memoizedState;
      } else if (hookNode.memoizedState !== undefined) {
        hookType = 'useState';
        value = hookNode.memoizedState;
      }
      
      if (hookType !== 'unknown') {
        hooks.push({ index: idx, type: hookType, value });
      }
      
      hookNode = hookNode.next;
      idx++;
    }
    return hooks;
  }

  function formatValue(val, maxLen = 50) {
    if (val === null) return 'null';
    if (val === undefined) return 'undefined';
    if (typeof val === 'string') return '"' + (val.length > maxLen ? val.slice(0, maxLen) + '...' : val) + '"';
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    if (Array.isArray(val)) return '[' + val.length + ' items]';
    if (typeof val === 'object') {
      const keys = Object.keys(val);
      return keys.length === 0 ? '{}' : '{' + keys.slice(0, 3).join(', ') + (keys.length > 3 ? '...' : '') + '}';
    }
    if (typeof val === 'function') return 'fn()';
    return String(val).slice(0, maxLen);
  }

  function nodeMatchesSearch(node, term) {
    if (!term) return true;
    const lower = term.toLowerCase();
    if ((node.component?.name || '').toLowerCase().includes(lower)) return true;
    if (node.file.toLowerCase().includes(lower)) return true;
    for (const child of node.children) {
      if (nodeMatchesSearch(child, term)) return true;
    }
    return false;
  }

  function isPathIgnored(filePath) {
    if (!filePath || ignoredPaths.length === 0) return false;
    const normalizedPath = filePath.toLowerCase();
    for (const pattern of ignoredPaths) {
      if (!pattern.trim()) continue;
      const normalizedPattern = pattern.toLowerCase().trim();
      if (normalizedPath.includes(normalizedPattern)) return true;
    }
    return false;
  }

  function filterIgnoredNodes(nodes) {
    const result = [];
    for (const node of nodes) {
      const filePath = node.source?.fileName || node.file || node.component?.filePath || '';
      if (isPathIgnored(filePath)) continue;
      result.push({
        ...node,
        children: filterIgnoredNodes(node.children || [])
      });
    }
    return result;
  }

  function getParentName(nodeId) {
    const parts = nodeId.split('-').map(Number);
    if (parts.length < 2) return null;
    let current = DISPLAY_TREE;
    for (let i = 0; i < parts.length - 1; i++) {
      const node = current[parts[i]];
      if (!node) return null;
      if (i === parts.length - 2) return node.component?.name || null;
      current = node.children || [];
    }
    return null;
  }

  function getSiblingIndex(nodeId) {
    const parts = nodeId.split('-').map(Number);
    if (parts.length === 0) return 0;
    
    let current = DISPLAY_TREE;
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

  function getFiberParentName(el) {
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

  function getFiberSiblingIndex(el, componentName) {
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

  function findBestMatchingElement(node, nodeId) {
    if (!node.component) return null;
    
    if (node.fiber) {
      const domEl = getDomFromFiber(node.fiber);
      if (domEl) return domEl;
    }
    
    const name = node.component.name;
    const allMatches = findElementsByComponentName(name);
    if (allMatches.length === 0) return null;
    if (allMatches.length === 1) return allMatches[0];

    const parentName = getParentName(nodeId);
    const sibIdx = getSiblingIndex(nodeId);

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

  function findAllMatchingElements(node, nodeId) {
    if (!node.component) return [];
    
    if (node.fiber) {
      const domEl = getDomFromFiber(node.fiber);
      if (domEl) return [domEl];
    }
    
    const name = node.component.name;
    const allMatches = findElementsByComponentName(name);
    if (allMatches.length <= 1) return allMatches;

    const parentName = getParentName(nodeId);
    const sibIdx = getSiblingIndex(nodeId);

    const withParent = allMatches.filter(el => getFiberParentName(el) === parentName);
    if (withParent.length === 0) return allMatches;

    const exactMatch = withParent.find(el => getFiberSiblingIndex(el, name) === sibIdx);
    if (exactMatch) {
      return [exactMatch, ...withParent.filter(el => el !== exactMatch)];
    }

    return withParent;
  }

  function findNodeById(nodes, id, prefix = '') {
    for (let i = 0; i < nodes.length; i++) {
      const nodeId = prefix ? prefix + '-' + i : String(i);
      if (nodeId === id) return nodes[i];
      if (nodes[i].children.length) {
        const found = findNodeById(nodes[i].children, id, nodeId);
        if (found) return found;
      }
    }
    return null;
  }

  let lastClickedNodeId = null;
  let cycleIndex = 0;
  let detailOverlay = null;
  let currentDetailNode = null;
  let currentDetailDomEl = null;
  let currentTab = 'props';
  let currentDataFlowGraph = null;
  let currentSourceCode = null;
  let sourceLoadingState = 'idle';
  const sourceCache = new Map();

  async function fetchSourceCode(filePath) {
    if (!filePath || filePath === 'unknown') return null;
    if (sourceCache.has(filePath)) return sourceCache.get(filePath);
    
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

  let hljsLoaded = false;
  let hljsLoading = false;
  let hljsStylesInjected = false;
  
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
    
    if (!hljsStylesInjected) {
      const hljsStyles = document.createElement('style');
      hljsStyles.textContent = \`
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
      \`;
      shadow.appendChild(hljsStyles);
      hljsStylesInjected = true;
    }
    
    hljsLoaded = true;
    hljsLoading = false;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function highlightCode(code, language) {
    if (window.hljs && hljsLoaded) {
      try {
        const result = window.hljs.highlight(code, { language: language || 'typescript', ignoreIllegals: true });
        console.log('[Overlay] Highlighted code with hljs, language:', language);
        return result.value;
      } catch (e) {
        console.warn('[Overlay] hljs highlight failed:', e);
        return escapeHtml(code);
      }
    }
    console.warn('[Overlay] hljs not loaded, returning escaped code');
    return escapeHtml(code);
  }

  function renderSourceCode(code, filePath) {
    if (!code) return '<div class="detail-empty">Source not available</div>';
    
    const ext = filePath.split('.').pop() || 'tsx';
    const langMap = { tsx: 'typescript', ts: 'typescript', jsx: 'javascript', js: 'javascript', css: 'css', json: 'json' };
    const language = langMap[ext] || 'typescript';
    
    const highlighted = highlightCode(code, language);
    
    return '<div class="source-container"><div class="source-header"><span class="source-path">' + escapeHtml(filePath) + '</span><button class="source-copy-btn" title="Copy source">📋 Copy</button><button class="source-open-btn" title="Open in editor">↗ Open</button></div><div class="source-code"><pre><code class="hljs language-' + language + '">' + highlighted + '</code></pre></div></div>';
  }

  function renderTree(nodes, depth = 0, prefix = '') {
    return nodes.map((node, i) => {
      const nodeId = prefix ? prefix + '-' + i : String(i);
      const hasChildren = (node.children || []).length > 0;
      const comp = node.component;
      const rawFile = node.source?.fileName || node.file || 'unknown';
      
      if (node.isSlot || rawFile === '{children}') {
        const childrenHtml = hasChildren ? renderTree(node.children, depth, prefix + '-' + i) : '';
        return '<div class="children-slot" data-id="' + nodeId + '">' + childrenHtml + '</div>';
      }
      
      const fileName = rawFile.split('/').pop() || rawFile;
      const lineNum = node.source?.lineNumber;
      const fileDisplay = lineNum ? fileName + ':' + lineNum : fileName;
      const name = comp?.name || '—';
      const renderCount = renderCounts.get(name) || 0;
      const matches = nodeMatchesSearch(node, searchTerm);
      const childrenHtml = hasChildren ? '<div class="children">' + renderTree(node.children, depth + 1, nodeId) + '</div>' : '';
      const hasSource = rawFile !== 'unknown';
      
      const staticComp = name !== '—' ? staticComponentMap.get(name) : null;
      const isServerOnly = node.isServerOnly;
      const isBridge = node.isBridge;
      const hasFiber = node.hasFiber;
      const badges = [];
      
      if (staticComp?.nextjsFileType) {
        const fileTypeIcons = { page: '📄', layout: '📐', loading: '⏳', error: '⚠️', template: '📋', 'not-found': '🔍' };
        const fileTypeDescriptions = {
          page: 'Next.js Page — Route entry point that renders at this URL path',
          layout: 'Next.js Layout — Shared UI wrapper that persists across child routes',
          loading: 'Next.js Loading — Suspense fallback shown while route loads',
          error: 'Next.js Error Boundary — Catches and displays errors in this route segment',
          template: 'Next.js Template — Like layout but re-mounts on navigation',
          'not-found': 'Next.js Not Found — Shown when route segment has no match'
        };
        const icon = fileTypeIcons[staticComp.nextjsFileType] || '';
        const desc = fileTypeDescriptions[staticComp.nextjsFileType] || staticComp.nextjsFileType;
        if (icon) badges.push('<span class="badge nextjs" title="' + desc + '">' + icon + '</span>');
      }
      
      if (isBridge) {
        badges.push('<span class="badge client bridge" title="\\'use client\\' — ACTIVE (solid blue)&#10;&#10;This file has \\'use client\\' AND is currently hydrated/running in the browser.&#10;&#10;• Found in React\\'s fiber tree (actively rendered)&#10;• Component is mounted and interactive&#10;• Can inspect live props, state, hooks">\\'use client\\'</span>');
      } else if (staticComp?.isClientComponent) {
        badges.push('<span class="badge client" title="\\'use client\\' — NOT ACTIVE (faded blue)&#10;&#10;This file has \\'use client\\' but is NOT currently in the React fiber tree.&#10;&#10;Possible reasons:&#10;• Component is conditionally hidden (CSS/responsive)&#10;• Component hasn\\'t mounted yet&#10;• Component is inside an unrendered branch&#10;&#10;The directive exists in source, but component isn\\'t running right now.">\\'use client\\' ⏸</span>');
      } else if (isServerOnly && !hasFiber) {
        badges.push('<span class="badge server rsc" title="SERVER ONLY (solid green)&#10;&#10;This component runs ONLY on the server — zero JavaScript sent to browser.&#10;&#10;• No \\'use client\\' directive&#10;• Not imported by any client component&#10;• Can directly access databases, filesystems, secrets&#10;• Can use async/await at component level&#10;• Output is pure HTML streamed to client">SERVER ONLY</span>');
      } else if (hasFiber && !staticComp?.isClientComponent) {
        badges.push('<span class="badge client inherited" title="RUNS ON CLIENT (inherited, dashed blue)&#10;&#10;This file has NO \\'use client\\' directive, but runs on the client anyway!&#10;&#10;Why? A parent component with \\'use client\\' imports this file.&#10;When a client component imports another component, that import becomes client code too.&#10;&#10;• The component itself didn\\'t opt-in to client&#10;• A parent\\'s \\'use client\\' pulled it into the client bundle&#10;• Consider adding \\'use client\\' if this is intentional">↳ client</span>');
      } else if (!staticComp?.isClientComponent && staticComp && !hasFiber) {
        badges.push('<span class="badge server" title="SERVER COMPONENT (green)&#10;&#10;This component renders on the server.&#10;&#10;• No \\'use client\\' directive&#10;• Executes during server render&#10;• May pass props to client children&#10;• Cannot use client-side hooks directly">SERVER</span>');
      }
      
      const hooksCount = staticComp?.hooks?.length || 0;
      const hooksHtml = hooksCount > 0 ? '<span class="hooks" title="' + staticComp.hooks.join(', ') + '">⚡' + hooksCount + '</span>' : '';
      
      const propsCount = staticComp?.props?.length || 0;
      const propsHtml = propsCount > 0 ? '<span class="props-count" title="' + staticComp.props.map(p => p.name + (p.optional ? '?' : '')).join(', ') + '">📌' + propsCount + '</span>' : '';
      
      const dataFlow = staticComp?.childDataFlow || [];
      const serverDataPassed = dataFlow.flatMap(f => 
        Object.entries(f.props)
          .filter(([, v]) => v.source === 'serverQuery')
          .map(([k, v]) => f.component + '.' + k + ' <- ' + v.query + '()')
      );
      const dataFlowHtml = serverDataPassed.length > 0 
        ? '<span class="data-flow" title="' + serverDataPassed.join('\\n') + '">📥' + serverDataPassed.length + '</span>' 
        : '';
      
      const badgesHtml = badges.join('');
      
      const renderCountHtml = isServerOnly 
        ? '<span class="render-count server-only" title="Server-rendered">—</span>'
        : '<span class="render-count" style="' + (renderCount === 0 ? 'opacity:0.3' : '') + '">' + renderCount + '</span>';
      
      const nodeClasses = ['node', matches ? '' : 'hidden', isServerOnly ? 'server-only' : '', isBridge ? 'bridge' : ''].filter(Boolean).join(' ');

      return \`
        <div class="\${nodeClasses}" data-depth="\${depth}" data-name="\${name}" data-file="\${rawFile}" data-id="\${nodeId}">
          <div class="node-header">
            <span class="toggle">\${hasChildren ? '▼' : '•'}</span>
            <span class="name">\${name}</span>
            \${badgesHtml}
            \${propsHtml}
            \${hooksHtml}
            \${dataFlowHtml}
            <span class="info-btn" title="View details">ℹ</span>
            \${renderCountHtml}
            <span class="file \${hasSource ? 'has-source' : ''}" title="\${rawFile}">\${fileDisplay}</span>
          </div>
          \${childrenHtml}
        </div>
      \`;
    }).join('');
  }

  let DISPLAY_TREE = [];
  
  function renderPanel() {
    DISPLAY_TREE = filterIgnoredNodes(TREE);
    const treeContent = isLoading 
      ? '<div class="loading"><div class="loading-spinner"></div><div class="loading-text">Analyzing components...</div></div>'
      : DISPLAY_TREE.length === 0
        ? '<div class="loading"><div class="loading-text">No components found</div></div>'
        : renderTree(DISPLAY_TREE);

    const filterLabel = filterEnabled ? 'FILTERED' : 'ALL';
    const ignoredCount = ignoredPaths.filter(p => p.trim()).length;

    container.innerHTML = \`
      <div class="panel \${isOpen ? 'open' : ''}">
        <div class="resize-handle"></div>
        <div class="header">
          <div class="header-row">
            <h2>🧩 Component Overlay</h2>
            <div class="header-buttons">
              <button class="settings-btn" title="Settings - ignore paths">\${ignoredCount > 0 ? '⚙️' + ignoredCount : '⚙️'}</button>
              <button class="refresh-btn" title="Re-analyze page">🔄</button>
              <button class="filter-btn \${filterEnabled ? 'on' : 'off'}" title="Toggle filter (show only project components)">\${filterLabel}</button>
              <button class="pause-btn \${isPaused ? 'paused' : ''}">\${isPaused ? '▶' : '⏸'}</button>
            </div>
          </div>
          <div class="stats">
            <div class="stat"><span class="stat-value">\${STATS.totalComponents}</span><span class="stat-label">total</span></div>
            <div class="stat"><span class="stat-value" style="color:#7ee787">\${STATS.serverComponents || 0}</span><span class="stat-label">server</span></div>
            <div class="stat"><span class="stat-value" style="color:#58a6ff">\${STATS.fiberNodes || 0}</span><span class="stat-label">client</span></div>
            <div class="stat"><span class="stat-value" id="total-renders" style="color:#f85149">\${totalRenders}</span><span class="stat-label">renders</span></div>
          </div>
          <div class="route">\${ROUTE}</div>
        </div>
        <div class="search">
          <input type="text" placeholder="Search components..." value="\${searchTerm}">
        </div>
        <div class="tree-container">
          <div class="sticky-parents"></div>
          <div class="tree">\${treeContent}</div>
        </div>
      </div>
      <button class="toggle-btn \${isOpen ? 'open' : ''}">\${isOpen ? '✕' : '🔍'}</button>
    \`;

    container.style.setProperty('--panel-width', panelWidth + 'px');
    attachPanelEvents();
  }

  function attachPanelEvents() {
    const panel = shadow.querySelector('.panel');
    const toggleBtn = shadow.querySelector('.toggle-btn');
    const resizeHandle = shadow.querySelector('.resize-handle');
    const searchInput = shadow.querySelector('.search input');
    const pauseBtn = shadow.querySelector('.pause-btn');
    const refreshBtn = shadow.querySelector('.refresh-btn');
    const filterBtn = shadow.querySelector('.filter-btn');
    const settingsBtn = shadow.querySelector('.settings-btn');

    toggleBtn.addEventListener('click', e => { e.stopPropagation(); e.stopImmediatePropagation(); toggle(); }, { capture: true });

    settingsBtn?.addEventListener('click', e => {
      e.stopPropagation(); e.stopImmediatePropagation();
      showSettingsDialog();
    }, { capture: true });

    refreshBtn?.addEventListener('click', e => {
      e.stopPropagation(); e.stopImmediatePropagation();
      refreshAnalysis();
    }, { capture: true });

    filterBtn?.addEventListener('click', e => {
      e.stopPropagation(); e.stopImmediatePropagation();
      filterEnabled = !filterEnabled;
      refreshFiberTree();
    }, { capture: true });

    let isResizing = false;
    resizeHandle.addEventListener('mousedown', e => {
      e.stopPropagation(); e.stopImmediatePropagation();
      isResizing = true;
      resizeHandle.classList.add('dragging');
    }, { capture: true });

    document.addEventListener('mousemove', e => {
      if (!isResizing) return;
      panelWidth = Math.max(280, Math.min(800, window.innerWidth - e.clientX));
      container.style.setProperty('--panel-width', panelWidth + 'px');
      localStorage.setItem('ro-panel-width', panelWidth.toString());
    });

    document.addEventListener('mouseup', () => {
      isResizing = false;
      if (resizeHandle) resizeHandle.classList.remove('dragging');
    });

    searchInput.addEventListener('input', e => {
      e.stopPropagation(); e.stopImmediatePropagation();
      searchTerm = e.target.value;
      const tree = shadow.querySelector('.tree');
      if (tree) tree.innerHTML = renderTree(TREE);
      attachNodeEvents();
    }, { capture: true });

    pauseBtn.addEventListener('click', e => {
      e.stopPropagation(); e.stopImmediatePropagation();
      isPaused = !isPaused;
      pauseBtn.textContent = isPaused ? '▶' : '⏸';
      pauseBtn.classList.toggle('paused', isPaused);
      if (isPaused) disableInspectMode();
      else if (isOpen) enableInspectMode();
    }, { capture: true });

    const treeEl = shadow.querySelector('.tree');
    const stickyParents = shadow.querySelector('.sticky-parents');

    function getAncestorsForNode(nodeEl) {
      const ancestors = [];
      let parent = nodeEl?.parentElement;
      while (parent) {
        if (parent.classList.contains('node')) {
          const name = parent.dataset.name;
          const nodeId = parent.dataset.id;
          if (name && name !== '—') ancestors.unshift({ name, nodeId });
        }
        if (parent.classList.contains('tree')) break;
        parent = parent.parentElement;
      }
      return ancestors;
    }

    function renderStickyParents(ancestors) {
      if (!stickyParents) return;
      if (ancestors.length === 0) {
        stickyParents.classList.remove('visible');
        return;
      }

      stickyParents.innerHTML = ancestors.map((a, i) => 
        (i > 0 ? '<span class="sticky-sep">›</span>' : '') +
        '<span class="sticky-crumb" data-id="' + a.nodeId + '"><span class="crumb-name">' + a.name + '</span></span>'
      ).join('');
      stickyParents.classList.add('visible');

      stickyParents.querySelectorAll('.sticky-crumb').forEach(crumb => {
        crumb.addEventListener('click', e => {
          e.stopPropagation();
          const nodeId = crumb.dataset.id;
          const nodeEl = treeEl.querySelector('.node[data-id="' + nodeId + '"]');
          if (nodeEl) {
            const header = nodeEl.querySelector(':scope > .node-header');
            if (header) header.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      });
    }

    function updateStickyParentsForSelected() {
      const selectedHeader = shadow.querySelector('.node-header.selected');
      if (selectedHeader) {
        const nodeEl = selectedHeader.parentElement;
        renderStickyParents(getAncestorsForNode(nodeEl));
        return;
      }
      updateStickyParentsForScroll();
    }

    function updateStickyParentsForScroll() {
      if (!treeEl || !stickyParents) return;
      
      const selectedHeader = shadow.querySelector('.node-header.selected');
      if (selectedHeader) return;
      
      const treeRect = treeEl.getBoundingClientRect();
      const scrollTop = treeEl.scrollTop;
      
      if (scrollTop < 20) {
        stickyParents.classList.remove('visible');
        return;
      }

      let topNode = null;
      let topOffset = Infinity;
      
      treeEl.querySelectorAll('.node').forEach(node => {
        const header = node.querySelector(':scope > .node-header');
        if (!header) return;
        const rect = header.getBoundingClientRect();
        const offset = rect.top - treeRect.top;
        if (offset >= -10 && offset < topOffset) {
          topOffset = offset;
          topNode = node;
        }
      });

      if (!topNode) {
        stickyParents.classList.remove('visible');
        return;
      }

      renderStickyParents(getAncestorsForNode(topNode));
    }

    window.__updateStickyParents = updateStickyParentsForSelected;

    treeEl.addEventListener('scroll', updateStickyParentsForScroll, { passive: true });

    attachNodeEvents();
  }

  function attachNodeEvents() {
    shadow.querySelectorAll('.node-header').forEach(header => {
      const node = header.parentElement;

      function selectNode() {
        const name = node.dataset.name;
        const nodeId = node.dataset.id;

        shadow.querySelectorAll('.node-header.selected').forEach(el => el.classList.remove('selected'));
        header.classList.add('selected');

        const treeNode = findNodeById(DISPLAY_TREE, nodeId);
        let domEl = null;

        if (selectedFiber && getFiberName(selectedFiber) === name) {
          domEl = selectedElement || getDomFromFiber(selectedFiber);
        }

        const isRealNode = domEl instanceof Node;
        const isInDocument = isRealNode ? document.contains(domEl) : (domEl?._elements?.some(el => document.contains(el)) ?? false);
        
        if (domEl && isInDocument) {
          showSelectedHighlight(domEl, name);
          if (isRealNode) {
            domEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else if (domEl._elements?.[0]) {
            domEl._elements[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        } else {
          hideSelectedHighlight();
        }

        selectedFiber = null;
        selectedElement = null;

        return { treeNode, domEl };
      }

      header.addEventListener('click', e => {
        e.stopPropagation(); e.stopImmediatePropagation();
        if (e.target.classList.contains('toggle')) {
          if (node.querySelector('.children')) node.classList.toggle('collapsed');
          return;
        }
        if (e.target.classList.contains('info-btn')) {
          const { treeNode, domEl } = selectNode();
          if (window.__updateStickyParents) window.__updateStickyParents();
          if (treeNode) showDetailDialog(treeNode, domEl);
          return;
        }
        selectNode();
        if (window.__updateStickyParents) window.__updateStickyParents();
      }, { capture: true });

      header.addEventListener('mouseenter', e => {
        e.stopPropagation();
        const name = node.dataset.name;
        const nodeId = node.dataset.id;
        const treeNode = findNodeById(DISPLAY_TREE, nodeId);
        if (treeNode) {
          const domEl = findBestMatchingElement(treeNode, nodeId);
          if (domEl) showHoverHighlight(domEl, name);
        }
      }, { capture: true });

      header.addEventListener('mouseleave', e => {
        e.stopPropagation();
        hideHoverHighlight();
      }, { capture: true });

      header.addEventListener('dblclick', e => {
        e.stopPropagation(); e.stopImmediatePropagation();
        const nodeId = node.dataset.id;
        const treeNode = findNodeById(DISPLAY_TREE, nodeId);
        const filePath = treeNode?.source?.fileName || node.dataset.file;
        const lineNumber = treeNode?.source?.lineNumber || 1;
        if (filePath && filePath !== 'unknown') {
          const uri = 'cursor://file/' + filePath + ':' + lineNumber;
          window.open(uri);
        }
      }, { capture: true });
    });
  }

  let settingsOverlay = null;

  function showSettingsDialog() {
    if (!settingsOverlay) {
      settingsOverlay = document.createElement('div');
      settingsOverlay.className = 'settings-overlay';
      settingsOverlay.style.display = 'none';
      shadow.appendChild(settingsOverlay);

      settingsOverlay.addEventListener('click', e => {
        const target = e.target;
        
        if (target === settingsOverlay) {
          hideSettingsDialog();
          return;
        }
        
        if (target.closest('.settings-close')) {
          hideSettingsDialog();
          return;
        }
        
        if (target.closest('.settings-save')) {
          const textarea = settingsOverlay.querySelector('.ignored-paths-input');
          if (textarea) {
            const paths = textarea.value.split('\\n').map(p => p.trim()).filter(p => p);
            ignoredPaths = paths;
            localStorage.setItem('ro-ignored-paths', JSON.stringify(paths));
            console.log('[Overlay] Saved ignored paths:', paths);
          }
          hideSettingsDialog();
          renderPanel();
          return;
        }
        
        if (target.closest('.settings-clear')) {
          const textarea = settingsOverlay.querySelector('.ignored-paths-input');
          if (textarea) textarea.value = '';
          return;
        }
        
        const presetBtn = target.closest('.settings-preset');
        if (presetBtn) {
          const textarea = settingsOverlay.querySelector('.ignored-paths-input');
          if (textarea) {
            const currentValue = textarea.value.trim();
            const newPath = presetBtn.dataset.paths;
            if (currentValue && !currentValue.includes(newPath)) {
              textarea.value = currentValue + '\\n' + newPath;
            } else if (!currentValue) {
              textarea.value = newPath;
            }
          }
          return;
        }
      });
    }

    const currentPaths = ignoredPaths.join('\\n');
    
    settingsOverlay.innerHTML = \`
      <div class="settings-dialog">
        <div class="settings-header">
          <h3>⚙️ Settings</h3>
          <button class="settings-close">×</button>
        </div>
        <div class="settings-content">
          <div class="settings-section">
            <label>Ignored Paths</label>
            <p class="settings-hint">Components with file paths containing these strings will be hidden from the tree. One per line.</p>
            <textarea class="ignored-paths-input" placeholder="components/ui&#10;shadcn-ui&#10;@radix-ui">\${currentPaths}</textarea>
          </div>
          <div class="settings-examples">
            <span class="settings-example-label">Examples:</span>
            <button class="settings-preset" data-paths="components/ui">shadcn/ui</button>
            <button class="settings-preset" data-paths="@radix-ui">radix-ui</button>
            <button class="settings-preset" data-paths="node_modules">node_modules</button>
          </div>
        </div>
        <div class="settings-footer">
          <button class="settings-clear">Clear All</button>
          <button class="settings-save">Save</button>
        </div>
      </div>
    \`;

    settingsOverlay.style.display = 'flex';
  }

  function hideSettingsDialog() {
    if (settingsOverlay) settingsOverlay.style.display = 'none';
  }

  function showDetailDialog(node, domEl) {
    currentDetailNode = node;
    currentDetailDomEl = domEl;
    currentTab = 'props';
    currentSourceCode = null;
    sourceLoadingState = 'idle';

    if (!detailOverlay) {
      detailOverlay = document.createElement('div');
      detailOverlay.className = 'detail-overlay';
      detailOverlay.style.display = 'none';
      shadow.appendChild(detailOverlay);

      detailOverlay.addEventListener('click', e => {
        e.stopPropagation(); e.stopImmediatePropagation();
        if (e.target === detailOverlay || e.target.classList.contains('detail-close')) hideDetailDialog();
        if (e.target.classList.contains('detail-tab')) {
          const newTab = e.target.dataset.tab;
          if (newTab && newTab !== currentTab) {
            currentTab = newTab;
            if (newTab === 'source' && !currentSourceCode) {
              const node = currentDetailNode;
              const staticComp = node?.component?.name ? staticComponentMap.get(node.component.name) : null;
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
        if (e.target.classList.contains('source-copy-btn')) {
          if (currentSourceCode) {
            navigator.clipboard.writeText(currentSourceCode);
            e.target.textContent = '✓ Copied!';
            setTimeout(() => { e.target.textContent = '📋 Copy'; }, 1500);
          }
        }
        if (e.target.classList.contains('source-open-btn')) {
          const node = currentDetailNode;
          const staticComp = node?.component?.name ? staticComponentMap.get(node.component.name) : null;
          const filePath = node?.source?.fileName || node?.file || staticComp?.filePath;
          const lineNumber = node?.source?.lineNumber || 1;
          if (filePath && filePath !== 'unknown') {
            const uri = 'cursor://file/' + filePath + ':' + lineNumber;
            window.open(uri);
          }
        }
        if (e.target.classList.contains('copy-llm-btn')) {
          const node = currentDetailNode;
          const domEl = currentDetailDomEl;
          const comp = node?.component;
          const compName = comp?.name;
          const live = domEl && compName ? getLiveComponentData(domEl, compName) : { props: {}, state: [] };
          const liveHooks = domEl && compName ? getLiveHooks(domEl, compName) : [];
          const exportData = generateLLMExport(currentDataFlowGraph, node, live.props || {}, liveHooks);
          navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
          e.target.textContent = '✓ Copied!';
          setTimeout(() => { e.target.textContent = '📋 Copy for LLM'; }, 1500);
        }
        if (e.target.classList.contains('copy-mermaid-btn')) {
          const mermaid = generateMermaidDiagram(currentDataFlowGraph);
          navigator.clipboard.writeText(mermaid.replace(/\\\\n/g, '\\n'));
          e.target.textContent = '✓ Copied!';
          setTimeout(() => { e.target.textContent = '📊 Copy Mermaid'; }, 1500);
        }
      }, { capture: true });
    }

    renderDetailContent();
    detailOverlay.style.display = 'flex';
  }

  function hideDetailDialog() {
    if (detailOverlay) detailOverlay.style.display = 'none';
    currentDetailNode = null;
    currentDetailDomEl = null;
  }

  function buildDataFlowGraph(node, domEl, liveProps, liveHooks) {
    const comp = node.component;
    const compName = comp?.name || 'Unknown';
    const staticComp = compName ? staticComponentMap.get(compName) : null;
    
    const nodes = [];
    const edges = [];
    const propOrigins = [];
    let nodeId = 0;
    
    const compNodeId = 'comp_' + nodeId++;
    nodes.push({
      id: compNodeId,
      label: compName,
      type: 'component',
      meta: { filePath: node.file, isClient: staticComp?.isClientComponent }
    });
    
    const hookNodes = new Map();
    const staticHooks = staticComp?.hooks || [];
    for (let i = 0; i < staticHooks.length; i++) {
      const hookName = staticHooks[i];
      const hookNodeId = 'hook_' + nodeId++;
      hookNodes.set(hookName, hookNodeId);
      nodes.push({
        id: hookNodeId,
        label: hookName,
        type: 'hook',
        meta: { index: i, liveValue: liveHooks[i]?.value }
      });
      edges.push({ from: hookNodeId, to: compNodeId, label: 'provides' });
    }
    
    const queryNodes = new Map();
    const serverQueries = staticComp?.serverQueries || [];
    for (const queryName of serverQueries) {
      const queryNodeId = 'query_' + nodeId++;
      queryNodes.set(queryName, queryNodeId);
      nodes.push({
        id: queryNodeId,
        label: queryName + '()',
        type: 'query',
        meta: { isAsync: true }
      });
      edges.push({ from: queryNodeId, to: compNodeId, label: 'fetches' });
    }
    
    function findAllParentsWithChildDataFlow(targetCompName) {
      const parents = [];
      
      for (const [compName, compInfo] of staticComponentMap) {
        const childDataFlow = compInfo?.childDataFlow || [];
        for (const flow of childDataFlow) {
          if (flow.component === targetCompName) {
            parents.push({
              parentName: compName,
              parentInfo: compInfo,
              propsPassedToChild: flow.props
            });
          }
        }
      }
      
      return parents;
    }
    
    function findComponentInTree(tree, targetName, path = []) {
      for (const n of tree) {
        const nodeName = n.component?.name;
        const newPath = [...path, n];
        
        if (nodeName === targetName) {
          return { node: n, path: newPath };
        }
        
        if (n.children?.length) {
          const found = findComponentInTree(n.children, targetName, newPath);
          if (found) return found;
        }
      }
      return null;
    }
    
    function tracePropsRecursively(propName, componentName, filePath, visited = new Set(), depth = 0) {
      const key = componentName + '.' + propName;
      if (visited.has(key) || depth > 10) return [];
      visited.add(key);
      
      const chain = [];
      
      const parents = findAllParentsWithChildDataFlow(componentName);
      
      if (parents.length === 0) {
        return chain;
      }
      
      for (const parentInfo of parents) {
        const propSource = parentInfo.propsPassedToChild[propName];
        if (!propSource) continue;
        
        const parentStatic = parentInfo.parentInfo;
        const parentFile = parentStatic?.filePath || 'unknown';
        
        if (propSource.source === 'serverQuery' && propSource.query) {
          chain.push({
            componentName: parentInfo.parentName,
            filePath: parentFile,
            queryName: propSource.query,
            type: 'query',
            expression: propSource.query + '()'
          });
        } else if (propSource.source === 'hook' && propSource.hookName) {
          chain.push({
            componentName: parentInfo.parentName,
            filePath: parentFile,
            hookName: propSource.hookName,
            type: 'hook',
            expression: propSource.hookName + '()'
          });
        } else if (propSource.source === 'prop' && propSource.propName) {
          chain.push({
            componentName: parentInfo.parentName,
            filePath: parentFile,
            propName: propSource.propName,
            type: 'prop',
            expression: 'props.' + propSource.propName
          });
          const deeperChain = tracePropsRecursively(propSource.propName, parentInfo.parentName, parentFile, visited, depth + 1);
          chain.push(...deeperChain);
        } else if (propSource.source === 'computed') {
          chain.push({
            componentName: parentInfo.parentName,
            filePath: parentFile,
            type: 'computed',
            expression: 'computed'
          });
          
          const parentHooks = parentStatic?.hooks || [];
          for (const hookName of parentHooks) {
            if (hookName.startsWith('use') && (
              hookName.toLowerCase().includes('query') || 
              hookName.toLowerCase().includes('mutation') ||
              hookName.toLowerCase().includes('state') ||
              hookName.toLowerCase().includes('context')
            )) {
              chain.push({
                componentName: parentInfo.parentName,
                filePath: parentFile,
                hookName: hookName,
                type: 'hook',
                expression: hookName + '()',
                inferred: true
              });
              break;
            }
          }
        } else if (propSource.source === 'literal') {
          chain.push({
            componentName: parentInfo.parentName,
            filePath: parentFile,
            type: 'literal',
            expression: 'literal'
          });
        } else {
          chain.push({
            componentName: parentInfo.parentName,
            filePath: parentFile,
            type: propSource.source || 'unknown',
            expression: propSource.source || 'unknown'
          });
        }
        
        break;
      }
      
      return chain;
    }
    
    const staticProps = staticComp?.props || [];
    const allPropNames = new Set([
      ...staticProps.map(p => p.name),
      ...Object.keys(liveProps || {}).filter(k => !k.startsWith('__') && k !== 'children')
    ]);
    
    for (const propName of allPropNames) {
      const staticProp = staticProps.find(p => p.name === propName);
      const liveValue = liveProps?.[propName];
      
      const propNodeId = 'prop_' + nodeId++;
      nodes.push({
        id: propNodeId,
        label: propName,
        type: 'prop',
        meta: { 
          value: liveValue !== undefined ? formatValue(liveValue, 30) : (staticProp?.type || 'unknown'),
          type: staticProp?.type,
          optional: staticProp?.optional
        }
      });
      edges.push({ from: propNodeId, to: compNodeId, label: 'prop' });
      
      const chain = tracePropsRecursively(propName, compName, node.file);
      
      let source = { source: 'unknown' };
      if (chain.length > 0) {
        const firstLink = chain[0];
        if (firstLink.queryName) {
          source = { source: 'serverQuery', query: firstLink.queryName };
        } else if (firstLink.hookName) {
          source = { source: 'hook', hookName: firstLink.hookName };
        } else if (firstLink.propName) {
          source = { source: 'prop', propName: firstLink.propName };
        } else if (firstLink.type === 'computed') {
          source = { source: 'computed' };
        } else {
          source = { source: 'literal' };
        }
      } else {
        if (typeof liveValue === 'function') {
          source = { source: 'computed' };
        } else if (liveValue !== undefined) {
          source = { source: 'literal' };
        }
      }
      
      for (const link of chain) {
        if (link.queryName) {
          let qNode = nodes.find(n => n.label === link.queryName + '()' && n.type === 'query');
          if (!qNode) {
            const qId = 'query_' + nodeId++;
            qNode = { id: qId, label: link.queryName + '()', type: 'query', meta: { inComponent: link.componentName } };
            nodes.push(qNode);
          }
          edges.push({ from: qNode.id, to: propNodeId, label: 'via ' + link.componentName });
        }
        
        if (link.hookName) {
          let hNode = nodes.find(n => n.label === link.hookName && n.type === 'hook');
          if (!hNode) {
            const hId = 'hook_' + nodeId++;
            hNode = { id: hId, label: link.hookName, type: 'hook', meta: { inComponent: link.componentName, inferred: link.inferred } };
            nodes.push(hNode);
          }
          edges.push({ from: hNode.id, to: propNodeId, label: 'via ' + link.componentName });
        }
        
        if (link.type === 'prop' && link.propName) {
          let pNode = nodes.find(n => n.label === link.componentName + '.' + link.propName && n.type === 'prop');
          if (!pNode) {
            const pId = 'pprop_' + nodeId++;
            pNode = { id: pId, label: link.componentName + '.' + link.propName, type: 'prop', meta: { fromComponent: link.componentName } };
            nodes.push(pNode);
          }
          edges.push({ from: pNode.id, to: propNodeId, label: 'passed as' });
        }
      }
      
      propOrigins.push({
        propName,
        value: liveValue,
        type: staticProp?.type,
        optional: staticProp?.optional,
        source,
        chain: [
          { componentName: compName, filePath: node.file, propName, type: 'component' },
          ...chain
        ]
      });
    }
    
    return {
      componentName: compName,
      filePath: node.file,
      nodes,
      edges,
      propOrigins
    };
  }
  
  function renderDataFlowGraph(graph) {
    if (!graph || !graph.propOrigins.length) return '<div class="detail-empty">No props detected for this component</div>';
    
    const sourceColors = {
      hook: '#d2a8ff',
      query: '#7ee787',
      serverQuery: '#7ee787',
      prop: '#ffa657',
      context: '#f778ba',
      computed: '#f0883e',
      literal: '#8b949e',
      unknown: '#484f58'
    };
    
    const sourceIcons = {
      hook: '⚡',
      query: '🔍',
      serverQuery: '🔍',
      prop: '↑',
      context: '🌐',
      computed: '⚙️',
      literal: '📝',
      unknown: '❓'
    };
    
    function getTypeCategory(typeStr) {
      if (!typeStr) return 'unknown';
      const t = typeStr.toLowerCase();
      if (t.includes('=>') || t.includes('function') || t.includes('void')) return 'function';
      if (t === 'boolean' || t.includes('boolean')) return 'boolean';
      if (t === 'number' || t.includes('number')) return 'number';
      if (t === 'string' || t.includes('string')) return 'string';
      if (t.startsWith('{') || t.includes('interface')) return 'object';
      if (t.includes('[]') || t.startsWith('array')) return 'array';
      return 'type';
    }
    
    function formatType(typeStr) {
      if (!typeStr) return '';
      let t = typeStr
        .replace(/import\([^)]+\)\./g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (t.length > 40) {
        t = t.slice(0, 37) + '...';
      }
      return t;
    }
    
    let html = '<div class="dataflow-graph">';
    
    html += '<div class="dataflow-origins">';
    
    for (const origin of graph.propOrigins) {
      const sourceType = origin.source.source === 'serverQuery' ? 'query' : origin.source.source;
      const sourceColor = sourceColors[sourceType] || sourceColors.unknown;
      const sourceIcon = sourceIcons[sourceType] || sourceIcons.unknown;
      const hasChain = origin.chain.length > 1;
      const typeCategory = getTypeCategory(origin.type);
      const formattedType = formatType(origin.type);
      const isFunction = typeCategory === 'function';
      const isOptional = origin.optional;
      
      html += '<div class="df-row' + (hasChain ? ' traced' : '') + '">';
      
      html += '<div class="df-prop">';
      html += '<span class="df-name' + (isFunction ? ' fn' : '') + '">' + origin.propName + '</span>';
      if (isOptional) html += '<span class="df-opt">?</span>';
      if (formattedType) {
        html += '<span class="df-type ' + typeCategory + '" title="' + (origin.type || '').replace(/"/g, '&quot;') + '">' + formattedType + '</span>';
      }
      html += '</div>';
      
      html += '<div class="df-source" style="--src-color:' + sourceColor + '">';
      html += '<span class="df-src-icon">' + sourceIcon + '</span>';
      
      if (origin.source.source === 'serverQuery') {
        html += '<span class="df-src-label">' + (origin.source.query || 'query') + '()</span>';
      } else if (origin.source.source === 'hook') {
        html += '<span class="df-src-label">' + (origin.source.hookName || 'hook') + '</span>';
      } else if (origin.source.source === 'prop') {
        html += '<span class="df-src-label">from parent</span>';
      } else if (origin.source.source === 'context') {
        html += '<span class="df-src-label">' + (origin.source.contextName || 'context') + '</span>';
      } else if (origin.source.source === 'computed') {
        html += '<span class="df-src-label">computed</span>';
      } else if (origin.source.source === 'literal') {
        html += '<span class="df-src-label">literal</span>';
      } else {
        html += '<span class="df-src-label">unknown</span>';
      }
      
      html += '</div>';
      html += '</div>';
      
      if (hasChain) {
        html += '<div class="df-chain">';
        for (let i = origin.chain.length - 1; i >= 0; i--) {
          const link = origin.chain[i];
          const isLast = i === 0;
          
          html += '<span class="df-chain-item' + (isLast ? ' target' : '') + '">';
          html += '<span class="df-chain-comp">' + link.componentName + '</span>';
          
          if (link.queryName) {
            html += '<span class="df-chain-via query">.' + link.queryName + '()</span>';
          } else if (link.hookName) {
            html += '<span class="df-chain-via hook">.' + link.hookName + '()</span>';
          } else if (link.propName) {
            html += '<span class="df-chain-via prop">.' + link.propName + '</span>';
          }
          
          html += '</span>';
          if (!isLast) html += '<span class="df-chain-arrow">→</span>';
        }
        html += '</div>';
      }
    }
    
    html += '</div>';
    
    const hookCount = graph.nodes.filter(n => n.type === 'hook').length;
    const queryCount = graph.nodes.filter(n => n.type === 'query').length;
    const propCount = graph.propOrigins.length;
    const tracedCount = graph.propOrigins.filter(p => p.chain.length > 1).length;
    const fnCount = graph.propOrigins.filter(p => getTypeCategory(p.type) === 'function').length;
    
    html += '<div class="df-summary">';
    html += '<span class="df-stat">' + propCount + ' props</span>';
    html += '<span class="df-stat traced">' + tracedCount + ' traced</span>';
    if (fnCount > 0) html += '<span class="df-stat fn">' + fnCount + ' callbacks</span>';
    html += '</div>';
    
    html += '<div class="dataflow-actions">';
    html += '<button class="copy-llm-btn" title="Copy as JSON for LLM">📋 Copy for LLM</button>';
    html += '<button class="copy-mermaid-btn" title="Copy as Mermaid diagram">📊 Mermaid</button>';
    html += '</div>';
    
    html += '</div>';
    return html;
  }
  
  function generateMermaidDiagram(graph) {
    if (!graph) return '';
    
    let mermaid = 'flowchart TD\\n';
    
    const typeStyles = {
      component: 'fill:#1f6feb,stroke:#58a6ff,color:#fff',
      prop: 'fill:#9e6a03,stroke:#ffa657,color:#fff',
      hook: 'fill:#8957e5,stroke:#d2a8ff,color:#fff',
      query: 'fill:#238636,stroke:#7ee787,color:#fff',
      context: 'fill:#bf3989,stroke:#f778ba,color:#fff',
      literal: 'fill:#6e7681,stroke:#8b949e,color:#fff'
    };
    
    for (const node of graph.nodes) {
      const shape = node.type === 'component' ? '([' + node.label + '])' :
                    node.type === 'query' ? '{{' + node.label + '}}' :
                    node.type === 'hook' ? '((' + node.label + '))' :
                    '[' + node.label + ']';
      mermaid += '    ' + node.id + shape + '\\n';
    }
    
    for (const edge of graph.edges) {
      const label = edge.label ? '|' + edge.label + '|' : '';
      mermaid += '    ' + edge.from + ' -->' + label + ' ' + edge.to + '\\n';
    }
    
    return mermaid;
  }
  
  function generateLLMExport(graph, node, liveProps, liveHooks) {
    const comp = node.component;
    const staticComp = comp?.name ? staticComponentMap.get(comp.name) : null;
    
    return {
      component: {
        name: comp?.name || 'Unknown',
        file: node.file,
        isClient: staticComp?.isClientComponent || false,
        isServer: staticComp?.isServerComponent || false,
        nextjsFileType: staticComp?.nextjsFileType || null
      },
      dataFlow: {
        propOrigins: graph.propOrigins.map(o => ({
          prop: o.propName,
          currentValue: formatValue(o.value, 100),
          sourceType: o.source.source,
          sourceDetail: o.source.query || o.source.hookName || o.source.propName || o.source.contextName || null,
          traceChain: o.chain.map(c => ({
            component: c.componentName,
            file: c.filePath,
            via: c.queryName || c.hookName || c.propName || null,
            type: c.type
          }))
        })),
        hooks: (staticComp?.hooks || []).map((h, i) => ({
          name: h,
          liveValue: liveHooks[i]?.value !== undefined ? formatValue(liveHooks[i].value, 50) : null
        })),
        serverQueries: staticComp?.serverQueries || [],
        childDataFlow: staticComp?.childDataFlow || []
      },
      graph: {
        nodes: graph.nodes.map(n => ({ id: n.id, label: n.label, type: n.type })),
        edges: graph.edges.map(e => ({ from: e.from, to: e.to, label: e.label }))
      },
      analysisHints: {
        potentialIssues: detectPotentialIssues(graph, staticComp),
        refactoringOpportunities: detectRefactoringOpportunities(graph, staticComp)
      }
    };
  }
  
  function detectPotentialIssues(graph, staticComp) {
    const issues = [];
    
    const propDrillingDepth = Math.max(...graph.propOrigins.map(o => o.chain.length), 0);
    if (propDrillingDepth > 3) {
      issues.push('Prop drilling detected: ' + propDrillingDepth + ' levels deep. Consider using Context or state management.');
    }
    
    const hookCount = (staticComp?.hooks || []).length;
    if (hookCount > 5) {
      issues.push('High hook count (' + hookCount + '). Consider extracting to custom hook or splitting component.');
    }
    
    const queryProps = graph.propOrigins.filter(o => o.source.source === 'serverQuery');
    if (queryProps.length > 3) {
      issues.push('Many server query props (' + queryProps.length + '). Consider data aggregation or caching.');
    }
    
    return issues;
  }
  
  function detectRefactoringOpportunities(graph, staticComp) {
    const opportunities = [];
    
    const computedProps = graph.propOrigins.filter(o => o.source.source === 'computed');
    if (computedProps.length > 2) {
      opportunities.push('Multiple computed props could be consolidated into useMemo.');
    }
    
    const hooks = staticComp?.hooks || [];
    const stateHooks = hooks.filter(h => h === 'useState');
    if (stateHooks.length > 3) {
      opportunities.push('Multiple useState calls could be consolidated with useReducer.');
    }
    
    const propChains = graph.propOrigins.filter(o => o.chain.length > 2);
    if (propChains.length > 0) {
      const components = [...new Set(propChains.flatMap(p => p.chain.map(c => c.componentName)))];
      opportunities.push('Props flow through: ' + components.join(' → ') + '. Consider Context or composition.');
    }
    
    return opportunities;
  }

  function renderDetailContent() {
    if (!detailOverlay || !currentDetailNode) return;

    const node = currentDetailNode;
    const domEl = currentDetailDomEl;
    const comp = node.component;
    const compName = comp?.name;
    const staticComp = compName ? staticComponentMap.get(compName) : null;
    const live = domEl && compName ? getLiveComponentData(domEl, compName) : { props: {}, state: [] };
    const liveHooks = domEl && compName ? getLiveHooks(domEl, compName) : [];
    
    const staticProps = staticComp?.props || [];
    const staticHookNames = staticComp?.hooks || [];
    
    const liveProps = Object.entries(live.props || {}).filter(([k]) => !k.startsWith('__') && k !== 'children');
    
    const mergedProps = [];
    const seenKeys = new Set();
    
    for (const [key, value] of liveProps) {
      seenKeys.add(key);
      const staticProp = staticProps.find(p => p.name === key);
      mergedProps.push({
        name: key,
        value,
        type: staticProp?.type || null,
        optional: staticProp?.optional ?? true,
      });
    }
    
    for (const sp of staticProps) {
      if (!seenKeys.has(sp.name)) {
        mergedProps.push({
          name: sp.name,
          value: undefined,
          type: sp.type,
          optional: sp.optional,
        });
      }
    }
    
    const mergedHooks = liveHooks.map((h, i) => ({
      ...h,
      staticName: staticHookNames[i] || null,
    }));

    currentDataFlowGraph = buildDataFlowGraph(node, domEl, live.props || {}, liveHooks);

    const tabs = [
      { id: 'props', label: 'Props', count: mergedProps.length },
      { id: 'state', label: 'State', count: live.state?.length || 0 },
      { id: 'hooks', label: 'Hooks', count: mergedHooks.length || staticHookNames.length },
      { id: 'dataflow', label: 'Data Flow', count: currentDataFlowGraph.propOrigins.length },
      { id: 'source', label: 'Source', count: 0 },
    ];

    const tabsHtml = tabs.map(t => '<button class="detail-tab ' + (currentTab === t.id ? 'active' : '') + '" data-tab="' + t.id + '">' + t.label + (t.count ? ' (' + t.count + ')' : '') + '</button>').join('');

    let contentHtml = '';

    if (currentTab === 'props') {
      if (mergedProps.length) {
        contentHtml = mergedProps.map(p => {
          const typeHtml = p.type ? '<span class="detail-type">' + p.type + '</span>' : '';
          const optMark = p.optional ? '?' : '';
          const valueHtml = p.value !== undefined ? formatValue(p.value, 100) : '<span class="detail-undefined">undefined</span>';
          return '<div class="detail-row"><div class="detail-key">' + p.name + optMark + ' ' + typeHtml + '</div><div class="detail-value">' + valueHtml + '</div></div>';
        }).join('');
      } else contentHtml = '<div class="detail-empty">No props</div>';
    } else if (currentTab === 'state') {
      if (live.state?.length) {
        contentHtml = live.state.map(s => '<div class="detail-row"><div class="detail-key">useState[' + s.index + ']</div><div class="detail-value">' + formatValue(s.value, 100) + '</div></div>').join('');
      } else contentHtml = '<div class="detail-empty">No state</div>';
    } else if (currentTab === 'hooks') {
      if (mergedHooks.length) {
        contentHtml = mergedHooks.map(h => {
          const hookName = h.staticName || h.type;
          return '<div class="detail-row"><div class="detail-key">' + hookName + '[' + h.index + ']</div><div class="detail-value">' + (h.value !== null ? formatValue(h.value, 80) : '—') + '</div></div>';
        }).join('');
      } else if (staticHookNames.length) {
        contentHtml = staticHookNames.map((name, i) => '<div class="detail-row"><div class="detail-key">' + name + '[' + i + ']</div><div class="detail-value">—</div></div>').join('');
      } else contentHtml = '<div class="detail-empty">No hooks detected</div>';
    } else if (currentTab === 'dataflow') {
      contentHtml = renderDataFlowGraph(currentDataFlowGraph);
    } else if (currentTab === 'source') {
      const filePath = node.source?.fileName || node.file || staticComp?.filePath;
      if (sourceLoadingState === 'loading') {
        contentHtml = '<div class="source-loading"><div class="loading-spinner"></div><div class="loading-text">Loading source...</div></div>';
      } else if (currentSourceCode) {
        contentHtml = renderSourceCode(currentSourceCode, filePath);
      } else {
        contentHtml = '<div class="detail-empty">Source not available</div>';
      }
    }

    const headerBadges = [];
    if (staticComp?.nextjsFileType) {
      const fileTypeLabels = { page: '📄 Page', layout: '📐 Layout', loading: '⏳ Loading', error: '⚠️ Error', template: '📋 Template', 'not-found': '🔍 Not Found' };
      headerBadges.push('<span class="badge nextjs">' + (fileTypeLabels[staticComp.nextjsFileType] || staticComp.nextjsFileType) + '</span>');
    }
    if (staticComp?.isClientComponent) {
      headerBadges.push('<span class="badge client">Client Component</span>');
    } else if (staticComp?.isServerComponent) {
      headerBadges.push('<span class="badge server">Server Component</span>');
    }
    const headerBadgesHtml = headerBadges.length ? '<div class="badges">' + headerBadges.join('') + '</div>' : '';

    detailOverlay.innerHTML = \`
      <div class="detail-dialog">
        <div class="detail-header">
          <div>
            <h3>\${compName || 'Unknown'}</h3>
            <div class="file">\${node.file}</div>
            \${headerBadgesHtml}
          </div>
          <button class="detail-close">×</button>
        </div>
        <div class="detail-tabs">\${tabsHtml}</div>
        <div class="detail-content">\${contentHtml}</div>
      </div>
    \`;
  }

  let inspectMoveHandler = null;
  let inspectClickHandler = null;

  function enableInspectMode() {
    inspectMoveHandler = e => {
      if (isOverlayElement(e.target)) return;
      const stack = getComponentStack(e.target);
      const label = stack.length > 0 ? stack.slice(0, 3).join(' → ') : e.target.tagName.toLowerCase();
      showHoverHighlight(e.target, label);
    };

    inspectClickHandler = e => {
      if (isOverlayElement(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const fiber = getFiberFromElement(e.target);
      const name = fiber ? getFiberName(fiber) : null;
      const domEl = fiber ? getDomFromFiber(fiber) : e.target;

      console.log('%c🧩 Selected:', 'color: #d2a8ff; font-weight: bold', name || 'Unknown', domEl);

      if (name) {
        selectedFiber = fiber;
        selectedElement = domEl;

        const stack = getComponentStack(e.target);
        const nodeId = selectTreeNodeByStack(stack);
        showSelectedHighlight(domEl, name);
      }
    };

    document.addEventListener('mousemove', inspectMoveHandler);
    document.addEventListener('click', inspectClickHandler, true);
  }

  function disableInspectMode() {
    if (inspectMoveHandler) document.removeEventListener('mousemove', inspectMoveHandler);
    if (inspectClickHandler) document.removeEventListener('click', inspectClickHandler, true);
    hideHoverHighlight();
    hideSelectedHighlight();
  }

  function selectTreeNodeByStack(stack) {
    const result = findNodeByAncestry(DISPLAY_TREE, stack, '', []);
    if (result && selectTreeNodeById(result.nodeId)) return result.nodeId;

    for (let i = 1; i < stack.length; i++) {
      const shiftedStack = stack.slice(i);
      const fallback = findNodeByAncestry(DISPLAY_TREE, shiftedStack, '', []);
      if (fallback && selectTreeNodeById(fallback.nodeId)) return fallback.nodeId;
    }

    for (const name of stack) {
      const fallback = findFirstNodeWithName(DISPLAY_TREE, name);
      if (fallback && selectTreeNodeById(fallback.nodeId)) return fallback.nodeId;
    }
    return null;
  }

  function findNodeByAncestry(nodes, stack, prefix, currentPath) {
    if (stack.length === 0) return null;
    const targetName = stack[0];
    const parentNames = stack.slice(1);

    let bestMatch = null;
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
          bestMatch = { node: nodes[i], nodeId };
        }
      }

      if (nodes[i].children.length) {
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

  function findFirstNodeWithName(nodes, name, prefix = '') {
    for (let i = 0; i < nodes.length; i++) {
      const nodeId = prefix ? prefix + '-' + i : String(i);
      if (nodes[i].component?.name === name) return { node: nodes[i], nodeId };
      if (nodes[i].children.length) {
        const found = findFirstNodeWithName(nodes[i].children, name, nodeId);
        if (found) return found;
      }
    }
    return null;
  }

  function selectTreeNodeById(nodeId) {
    const nodeEl = shadow.querySelector('.node[data-id="' + nodeId + '"]');
    if (!nodeEl) return false;

    let parent = nodeEl.parentElement;
    while (parent && parent !== shadow) {
      if (parent.classList.contains('node') && parent.classList.contains('collapsed')) {
        parent.classList.remove('collapsed');
      }
      parent = parent.parentElement;
    }

    shadow.querySelectorAll('.node-header.selected').forEach(el => el.classList.remove('selected'));
    const header = nodeEl.querySelector(':scope > .node-header');
    if (header) {
      header.classList.add('selected');
      setTimeout(() => {
        header.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (window.__updateStickyParents) window.__updateStickyParents();
      }, 100);
    }
    return true;
  }

  function toggle() {
    isOpen = !isOpen;
    const panel = shadow.querySelector('.panel');
    const btn = shadow.querySelector('.toggle-btn');
    if (panel) panel.classList.toggle('open', isOpen);
    if (btn) { btn.classList.toggle('open', isOpen); btn.textContent = isOpen ? '✕' : '🔍'; }
    document.body.style.marginRight = isOpen ? panelWidth + 'px' : '';

    if (isOpen && !isPaused) enableInspectMode();
    else disableInspectMode();
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && settingsOverlay?.style.display === 'flex') {
      e.preventDefault(); e.stopPropagation();
      hideSettingsDialog();
      return;
    }
    if (e.key === 'Escape' && detailOverlay?.style.display === 'flex') {
      e.preventDefault(); e.stopPropagation();
      hideDetailDialog();
      return;
    }
    if (e.ctrlKey && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      toggle();
    }
    if (e.ctrlKey && e.shiftKey && e.key === 'P') {
      e.preventDefault();
      isPaused = !isPaused;
      const btn = shadow.querySelector('.pause-btn');
      if (btn) { btn.textContent = isPaused ? '▶ Resume' : '⏸ Pause'; btn.classList.toggle('paused', isPaused); }
      if (isPaused) disableInspectMode();
      else if (isOpen) enableInspectMode();
    }
  });

  document.body.appendChild(host);
  renderPanel();
  toggle();
  
  loadComponentAllowlist().then(() => {
    function waitForFiberTree(attempts = 0) {
      refreshFiberTree();
      if (FIBER_TREE.length === 0 && attempts < 20) {
        setTimeout(() => waitForFiberTree(attempts + 1), 250);
      } else {
        isLoading = false;
        renderPanel();
      }
    }
    setTimeout(() => waitForFiberTree(), 100);
  });

  function getStaticComponentMap() {
    const obj = {};
    for (const [name, comp] of staticComponentMap) {
      obj[name] = comp;
    }
    return obj;
  }
  
  function stripFiberRefs(nodes) {
    return nodes.map(n => ({
      file: n.file,
      component: n.component,
      source: n.source,
      hasFiber: !!n.fiber,
      children: stripFiberRefs(n.children || [])
    }));
  }
  
  function compareTreeNodes(staticNode, fiberNode, path = '') {
    const diffs = [];
    const sName = staticNode?.component?.name || staticNode?.file;
    const fName = fiberNode?.component?.name || fiberNode?.name;
    
    if (sName !== fName) {
      diffs.push({ path, static: sName, fiber: fName, issue: 'name mismatch' });
    }
    
    const sChildren = staticNode?.children || [];
    const fChildren = fiberNode?.children || [];
    
    if (sChildren.length !== fChildren.length) {
      diffs.push({ path: path + '/' + sName, staticCount: sChildren.length, fiberCount: fChildren.length, issue: 'child count mismatch' });
    }
    
    return diffs;
  }
  
  async function fetchStaticData() {
    try {
      const res = await fetch('/__overlay_data.json?route=' + encodeURIComponent(window.location.pathname));
      return await res.json();
    } catch (e) {
      console.error('Failed to fetch static data:', e);
      return null;
    }
  }

  function buildFullTreeDataFlow(nodes, depth = 0) {
    const result = [];
    
    for (const node of nodes) {
      const comp = node.component;
      const compName = comp?.name;
      if (!compName) continue;
      
      const staticComp = staticComponentMap.get(compName);
      const domEl = node.fiber ? getDomFromFiber(node.fiber) : null;
      const live = domEl ? getLiveComponentData(domEl, compName) : { props: {}, state: [] };
      const liveHooks = domEl ? getLiveHooks(domEl, compName) : [];
      
      const graph = buildDataFlowGraph(node, domEl, live.props || {}, liveHooks);
      
      result.push({
        depth,
        component: compName,
        file: node.file,
        isClient: staticComp?.isClientComponent || false,
        isServer: staticComp?.isServerComponent || false,
        propOrigins: graph.propOrigins.map(o => ({
          prop: o.propName,
          value: formatValue(o.value, 50),
          sourceType: o.source.source,
          sourceDetail: o.source.query || o.source.hookName || o.source.propName || null,
          chainLength: o.chain.length
        })),
        hooks: staticComp?.hooks || [],
        serverQueries: staticComp?.serverQueries || [],
        issues: detectPotentialIssues(graph, staticComp),
        refactorHints: detectRefactoringOpportunities(graph, staticComp),
        children: node.children?.length || 0
      });
      
      if (node.children?.length) {
        result.push(...buildFullTreeDataFlow(node.children, depth + 1));
      }
    }
    
    return result;
  }

  window.__REPO_OVERLAY__ = {
    toggle,
    show: () => { if (!isOpen) toggle(); },
    hide: () => { if (isOpen) toggle(); },
    setWidth: w => { panelWidth = w; shadow.querySelector(':host').style.setProperty('--panel-width', w + 'px'); localStorage.setItem('ro-panel-width', w.toString()); },
    refresh: refreshAnalysis,
    refreshFiber: refreshFiberTree,
    toggleFilter: () => { filterEnabled = !filterEnabled; refreshFiberTree(); },
    getTree: () => TREE,
    getFiberTree: () => FIBER_TREE,
    getAllowlist: () => Array.from(componentAllowlist),
    logTree: () => console.log(JSON.stringify(TREE, null, 2)),
    copyTree: () => { navigator.clipboard.writeText(JSON.stringify(TREE, null, 2)); console.log('Tree copied to clipboard'); },
    
    debug: {
      getStaticComponentMap,
      getFiberTreeRaw: () => FIBER_TREE,
      getDisplayTree: () => TREE,
      getDisplayTreeClean: () => stripFiberRefs(TREE),
      
      async dumpAll() {
        const staticData = await fetchStaticData();
        const data = {
          staticTree: staticData?.componentTree || null,
          staticAllComponents: staticData?.allComponents || null,
          staticStats: staticData?.stats || null,
          fiberTree: FIBER_TREE.map(n => ({ name: n.name, source: n.source, childCount: n.children?.length || 0 })),
          displayTree: stripFiberRefs(TREE),
          componentMap: getStaticComponentMap(),
          allowlist: Array.from(componentAllowlist),
        };
        console.log('=== DEBUG DATA ===');
        console.log(JSON.stringify(data, null, 2));
        return data;
      },
      
      async compareStatic() {
        const staticData = await fetchStaticData();
        if (!staticData) return;
        
        console.log('=== STATIC TREE (from AST analysis) ===');
        console.log('Components found:', staticData.allComponents?.length || 0);
        console.log('Tree nodes:', staticData.componentTree?.length || 0);
        
        console.log('\\n=== STATIC COMPONENT INFO ===');
        for (const comp of (staticData.allComponents || [])) {
          console.log(comp.name + ':', {
            file: comp.filePath,
            props: comp.props,
            hooks: comp.hooks,
            isClient: comp.isClientComponent,
            isServer: comp.isServerComponent,
            nextjsType: comp.nextjsFileType,
          });
        }
        
        console.log('\\n=== FIBER TREE (from React DevTools) ===');
        console.log('Components found:', FIBER_TREE.length);
        for (const node of FIBER_TREE) {
          console.log(node.name + ':', { source: node.source, children: node.children?.length || 0 });
        }
        
        console.log('\\n=== DISPLAY TREE (what you see) ===');
        console.log('Nodes:', countNodes(TREE));
        
        return { staticData, fiberTree: FIBER_TREE, displayTree: TREE };
      },
      
      logStaticTree: async () => {
        const data = await fetchStaticData();
        console.log('=== STATIC COMPONENT TREE ===');
        console.log(JSON.stringify(data?.componentTree, null, 2));
        return data?.componentTree;
      },
      
      logAllComponents: async () => {
        const data = await fetchStaticData();
        console.log('=== ALL COMPONENTS (with full info) ===');
        console.log(JSON.stringify(data?.allComponents, null, 2));
        return data?.allComponents;
      },
      
      downloadCalculatedTree() {
        const cleanTree = stripFiberRefs(TREE);
        const blob = new Blob([JSON.stringify(cleanTree, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'calculated-tree.json';
        a.click();
        URL.revokeObjectURL(url);
      },
      
      logDataFlow() {
        console.log('=== SERVER -> CLIENT DATA FLOW ===');
        function findDataFlow(nodes, depth = 0) {
          for (const node of nodes) {
            const comp = node.component;
            if (comp?.childDataFlow?.length) {
              const indent = '  '.repeat(depth);
              console.log(indent + comp.name + ' passes data to:');
              for (const flow of comp.childDataFlow) {
                console.log(indent + '  -> ' + flow.component + ':');
                for (const [prop, source] of Object.entries(flow.props)) {
                  const src = source.source === 'serverQuery' 
                    ? 'serverQuery(' + source.query + ')' 
                    : source.source;
                  console.log(indent + '      ' + prop + ': ' + src);
                }
              }
            }
            if (node.children) findDataFlow(node.children, depth + 1);
          }
        }
        findDataFlow(TREE);
      },
      
      getFullDataFlow() {
        return buildFullTreeDataFlow(TREE);
      },
      
      exportForLLM() {
        const dataFlow = buildFullTreeDataFlow(TREE);
        const summary = {
          route: ROUTE,
          timestamp: new Date().toISOString(),
          stats: {
            totalComponents: dataFlow.length,
            clientComponents: dataFlow.filter(c => c.isClient).length,
            serverComponents: dataFlow.filter(c => c.isServer).length,
            totalProps: dataFlow.reduce((sum, c) => sum + c.propOrigins.length, 0),
            totalHooks: dataFlow.reduce((sum, c) => sum + c.hooks.length, 0),
            totalQueries: dataFlow.reduce((sum, c) => sum + c.serverQueries.length, 0),
          },
          issues: dataFlow.flatMap(c => c.issues.map(i => ({ component: c.component, issue: i }))),
          refactorOpportunities: dataFlow.flatMap(c => c.refactorHints.map(h => ({ component: c.component, hint: h }))),
          components: dataFlow
        };
        return summary;
      },
      
      copyFullDataFlow() {
        const data = this.exportForLLM();
        navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        console.log('Full data flow copied to clipboard (' + data.components.length + ' components)');
        return data;
      },
      
      logFullDataFlow() {
        const data = this.exportForLLM();
        console.log('=== FULL PAGE DATA FLOW ANALYSIS ===');
        console.log('Route:', data.route);
        console.log('Stats:', data.stats);
        console.log('\\n=== ISSUES ===');
        for (const i of data.issues) {
          console.log('  [' + i.component + '] ' + i.issue);
        }
        console.log('\\n=== REFACTOR OPPORTUNITIES ===');
        for (const h of data.refactorOpportunities) {
          console.log('  [' + h.component + '] ' + h.hint);
        }
        console.log('\\n=== COMPONENTS ===');
        console.log(JSON.stringify(data.components, null, 2));
        return data;
      },
    }
  };
})();`;
}

export function generateBookmarklet(data: RouteAnalysis): string {
  return `javascript:${encodeURIComponent(generateOverlayScript(data))}`;
}
