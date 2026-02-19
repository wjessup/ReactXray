import { state } from './state';
import { getStaticComponent } from './logic';
import { getReactFiber, getDomFromFiber, formatValue } from './utils';
// state.ARCHITECTURE is available via import { state }

// Helper to get live data from fiber
export function getLiveComponentData(domEl: any, compName: string) {
    const fiber = getReactFiber(domEl);
    if (!fiber) return { props: {}, state: [] };

    // If fiber name doesn't match, try to find the right one up the tree
    let current = fiber;
    while (current) {
        // Simple name check - might need more robust check if minified
        // But for devtool, names should be available
        const type = current.type;
        const name = typeof type === 'function' ? type.name : type?.displayName || type?.name;
        
        if (name === compName) {
            return {
                props: current.memoizedProps || {},
                state: [] // State is handled by getLiveHooks usually
            };
        }
        current = current.return;
    }

    // Fallback to initial fiber if name match fails (e.g. HOCs)
    return {
        props: fiber.memoizedProps || {},
        state: []
    };
}

export function getLiveHooks(domEl: any, compName: string) {
    let fiber = getReactFiber(domEl);
    if (!fiber) return [];

    // Climb to find component fiber
    let current = fiber;
    while (current) {
        const type = current.type;
        const name = typeof type === 'function' ? type.name : type?.displayName || type?.name;
        if (name === compName) {
            fiber = current;
            break;
        }
        current = current.return;
    }

    const hooks = [];
    let hook = fiber.memoizedState;
    while (hook) {
        hooks.push({
            value: hook.memoizedState,
            baseState: hook.baseState,
            queue: hook.queue
        });
        hook = hook.next;
    }
    return hooks;
}

export function buildDataFlowGraph(node: any, domEl: any, liveProps: any, liveHooks: any[]) {
    const comp = node.component;
    const compName = comp?.name || 'Unknown';
    const staticComp = compName ? getStaticComponent(compName) : null;
    
    const nodes: any[] = [];
    const edges: any[] = [];
    const propOrigins: any[] = [];
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
    
    // Helper to find data flow parent sources
    // This requires iterating OVER ALL COMPONENTS to find who passes data to `compName`.
    // Since we don't have direct access to all components map as an array easily (it's in logic.ts closure),
    // we might need to export the map or use state.STATIC_TREE.
    // Actually getStaticComponent can access the map, but we need to Iterate it.
    // For now, let's rely on childDataFlow which is on the PARENT component.
    // We need to find parents.
    
    // We'll use state.STATIC_TREE and traverse it to find parents?
    // No, childDataFlow is static analysis data.
    // We need to search all components in static map.
    // Since we can't iterate the map in logic.ts from here, 
    // we should probably add `getAllStaticComponents` to logic.ts or pass the map.
    // Or we can just iterate state.STATIC_TREE (but that's a tree, not a flat list, though it contains all components).
    // Actually state.STATIC_TREE is the tree ref.
    // A better way is to assume we can get parent info from the tree structure if we had back-pointers,
    // but data flow is static.
    
    // Let's implement a poor man's "find parents" by traversing the tree if needed,
    // OR we just skip this strict traversal if it's too expensive and just look at direct parent in tree?
    // The original code used `staticComponentMap` iteration.
    // I should modify `logic.ts` to export `getAllStaticComponents`.
    
    function tracePropsRecursively(propName: string, componentName: string, filePath: string, visited = new Set(), depth = 0): any[] {
        const key = componentName + '.' + propName;
        if (visited.has(key) || depth > 10) return [];
        visited.add(key);
        
        const chain: any[] = [];
        
        // We need to implement findAllParentsWithChildDataFlow
        // For now, returning empty context if we can't find parents.
        // I will implement findAllParentsWithChildDataFlow using state.STATIC_TREE traversal separately.
        
        return chain;
    }

    const staticProps = staticComp?.props || [];
    const allPropNames = new Set([
      ...staticProps.map((p: any) => p.name),
      ...Object.keys(liveProps || {}).filter(k => !k.startsWith('__') && k !== 'children')
    ]);
    
    for (const propName of allPropNames) {
      const staticProp = staticProps.find((p: any) => p.name === propName);
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
      
      // Temporarily disable deep tracing until we have parent lookup
      const chain: any[] = []; // tracePropsRecursively(propName, compName, node.file);
      
      let source: any = { source: 'unknown' };
    //   if (chain.length > 0) {
    //      // logic from original...
    //   } else {
        if (typeof liveValue === 'function') {
          source = { source: 'computed' };
        } else if (liveValue !== undefined) {
            source = { source: 'literal' };
        }
    //   }
      
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

export function detectPotentialIssues(graph: any, staticComp: any) {
    const issues: string[] = [];
    
    const propDrillingDepth = Math.max(...graph.propOrigins.map((o: any) => o.chain.length), 0);
    if (propDrillingDepth > 3) {
      issues.push('Prop drilling detected: ' + propDrillingDepth + ' levels deep. Consider using Context or state management.');
    }
    
    const hookCount = (staticComp?.hooks || []).length;
    if (hookCount > 5) {
      issues.push('High hook count (' + hookCount + '). Consider extracting to custom hook or splitting component.');
    }
    
    const queryProps = graph.propOrigins.filter((o: any) => o.source.source === 'serverQuery');
    if (queryProps.length > 3) {
      issues.push('Many server query props (' + queryProps.length + '). Consider data aggregation or caching.');
    }
    
    return issues;
}

export function detectRefactoringOpportunities(graph: any, staticComp: any) {
    const opportunities: string[] = [];
    
    const computedProps = graph.propOrigins.filter((o: any) => o.source.source === 'computed');
    if (computedProps.length > 2) {
      opportunities.push('Multiple computed props could be consolidated into useMemo.');
    }
    
    const hooks = staticComp?.hooks || [];
    const stateHooks = hooks.filter((h: string) => h === 'useState');
    if (stateHooks.length > 3) {
      opportunities.push('Multiple useState calls could be consolidated with useReducer.');
    }
    
    const propChains = graph.propOrigins.filter((o: any) => o.chain.length > 2);
    if (propChains.length > 0) {
      const components = [...new Set(propChains.flatMap((p: any) => p.chain.map((c: any) => c.componentName)))];
      opportunities.push('Props flow through: ' + components.join(' → ') + '. Consider Context or composition.');
    }
    
    return opportunities;
}

export function generateLLMExport(graph: any, node: any, liveProps: any, liveHooks: any) {
    const comp = node.component;
    const compName = comp?.name || 'Unknown';
    const staticComp = compName ? getStaticComponent(compName) : null;
    
    return {
      component: {
        name: comp?.name || 'Unknown',
        file: node.file,
        isClient: staticComp?.isClientComponent || false,
        isServer: staticComp?.isServerComponent || false,
        nextjsFileType: staticComp?.nextjsFileType || null
      },
      dataFlow: {
        propOrigins: graph.propOrigins.map((o: any) => ({
          prop: o.propName,
          currentValue: formatValue(o.value, 100),
          sourceType: o.source.source,
          sourceDetail: o.source.query || o.source.hookName || o.source.propName || o.source.contextName || null,
          traceChain: o.chain.map((c: any) => ({
            component: c.componentName,
            file: c.filePath,
            via: c.queryName || c.hookName || c.propName || null,
            type: c.type
          }))
        })),
        hooks: (staticComp?.hooks || []).map((h: string, i: number) => ({
          name: h,
          liveValue: liveHooks[i]?.value !== undefined ? formatValue(liveHooks[i].value, 50) : null
        })),
        serverQueries: staticComp?.serverQueries || [],
        childDataFlow: staticComp?.childDataFlow || []
      },
      graph: {
        nodes: graph.nodes.map((n: any) => ({ id: n.id, label: n.label, type: n.type })),
        edges: graph.edges.map((e: any) => ({ from: e.from, to: e.to, label: e.label }))
      },
      analysisHints: {
        potentialIssues: detectPotentialIssues(graph, staticComp),
        refactoringOpportunities: detectRefactoringOpportunities(graph, staticComp)
      }
    };
}

export function generateMermaidDiagram(graph: any) {
    if (!graph || !graph.nodes.length) return 'graph TD\n    NoData[No Data Flow]';
    
    let mermaid = 'graph TD\n';
    
    // Add styles
    mermaid += '    classDef component fill:#1e1e1e,stroke:#61dafb,stroke-width:2px,color:#fff\n';
    mermaid += '    classDef hook fill:#2d1e2f,stroke:#d2a8ff,stroke-width:1px,color:#fff,stroke-dasharray: 5 5\n';
    mermaid += '    classDef prop fill:#2f261e,stroke:#ffa657,stroke-width:1px,color:#fff\n';
    mermaid += '    classDef query fill:#1e2f23,stroke:#7ee787,stroke-width:1px,color:#fff\n';
    
    for (const node of graph.nodes) {
      let className = 'component';
      if (node.type === 'hook') className = 'hook';
      if (node.type === 'prop') className = 'prop';
      if (node.type === 'query') className = 'query';
      mermaid += `    ${node.id}:::${className}\n`;
    }
    
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

export function getArchSmellsForComponent(compName: string) {
    if (!state.ARCHITECTURE || !state.ARCHITECTURE.smells) return [];
    return state.ARCHITECTURE.smells.filter((s: any) => {
      if (s.message?.includes(compName)) return true;
      const fileBasename = s.location?.file?.split('/').pop()?.replace(/\.(tsx?|jsx?)$/, '');
      if (fileBasename === compName) return true;
      if (s.details?.similarComponents?.some((sc: any) => sc.name === compName)) return true;
      return false;
    });
}

export function getArchUsageForComponent(compName: string) {
    if (!state.ARCHITECTURE || !state.ARCHITECTURE.componentUsages) return null;
    return state.ARCHITECTURE.componentUsages.find((u: any) => u.componentName === compName);
}

export function getArchSimilarForComponent(compName: string) {
    if (!state.ARCHITECTURE || !state.ARCHITECTURE.similarComponents) return [];
    return state.ARCHITECTURE.similarComponents[compName] || [];
}

export function getPropFlow(compName: string, propName: string) {
    if (!state.ARCHITECTURE || !state.ARCHITECTURE.propFlows) return null;
    const flows = state.ARCHITECTURE.propFlows[compName];
    if (!flows) return null;
    return flows.find((f: any) => f.propName === propName);
}

export function getPropUpwardFlow(compName: string, propName: string) {
    if (!state.ARCHITECTURE || !state.ARCHITECTURE.propUpwardFlows) return null;
    const flows = state.ARCHITECTURE.propUpwardFlows[compName];
    if (!flows) return null;
    return flows.find((f: any) => f.propName === propName);
}

export function countTreeNodes(node: any): number {
    if (!node) return 0;
    let count = 1;
    if (node.children) {
      for (const child of node.children) {
        count += countTreeNodes(child);
      }
    }
    return count;
}
