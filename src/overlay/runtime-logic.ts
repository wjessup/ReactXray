export function buildFiberLookupByName(
  fiberNodes: any[],
  lookup = new Map<string, any[]>(),
) {
  for (const node of fiberNodes) {
    if (node.name) {
      if (!lookup.has(node.name)) lookup.set(node.name, []);
      lookup.get(node.name)!.push(node);
    }
    if (node.children) buildFiberLookupByName(node.children, lookup);
  }
  return lookup;
}

export function sortFiberLookupForMerge(lookup: Map<string, any[]>) {
  for (const candidates of lookup.values()) {
    candidates.sort((a, b) => {
      const ay = a?.__roY ?? null;
      const by = b?.__roY ?? null;
      if (ay === null || by === null) return 0;
      if (ay !== by) return ay - by;
      const ax = a?.__roX ?? 0;
      const bx = b?.__roX ?? 0;
      return ax - bx;
    });
  }
  return lookup;
}

export function collectStaticNames(nodes: any[], names = new Set<string>()) {
  for (const node of nodes) {
    if (node.component?.name) names.add(node.component.name);
    if (node.children) collectStaticNames(node.children, names);
  }
  return names;
}

export function isFiberDescendantOf(candidate: any, parentFiber: any): boolean {
  let cur = candidate.fiber?.return;
  const seen = new Set<any>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    if (cur === parentFiber) return true;
    cur = cur.return;
  }
  return false;
}

export function mergeStaticWithFiber(
  staticNodes: any[],
  fiberLookup: Map<string, any[]>,
  usedFibers = new Set<any>(),
  staticNamesInTree: Set<string> | null = null,
  parentFiber: any = null,
  parentUnrendered = false,
): any[] {
  if (!staticNamesInTree) {
    staticNamesInTree = collectStaticNames(staticNodes);
  }

  return staticNodes.map((staticNode) => {
    const compName = staticNode.component?.name;
    const isClientComponent = staticNode.component?.isClientComponent;

    if (staticNode.file === "{children}") {
      return {
        ...staticNode,
        children: mergeStaticWithFiber(
          staticNode.children || [],
          fiberLookup,
          usedFibers,
          staticNamesInTree,
          parentFiber,
          parentUnrendered,
        ),
        isSlot: true,
      };
    }

    let fiberMatch = null;

    if (!parentUnrendered && compName && fiberLookup.has(compName)) {
      const candidates = fiberLookup.get(compName)!;

      if (parentFiber) {
        for (const candidate of candidates) {
          if (usedFibers.has(candidate)) continue;
          if (isFiberDescendantOf(candidate, parentFiber)) {
            fiberMatch = { fiber: candidate.fiber, source: candidate.source };
            usedFibers.add(candidate);
            break;
          }
        }
      }

      if (!fiberMatch) {
        for (const candidate of candidates) {
          if (!usedFibers.has(candidate)) {
            fiberMatch = candidate;
            usedFibers.add(candidate);
            break;
          }
        }
      }
    }

    const nextParentFiber = fiberMatch?.fiber || parentFiber;
    const thisUnrendered = parentUnrendered || (isClientComponent && !fiberMatch);

    if (fiberMatch && isClientComponent) {
      return {
        file: staticNode.file,
        component: staticNode.component,
        source: fiberMatch.source || {
          fileName: staticNode.component?.filePath,
        },
        fiber: fiberMatch.fiber,
        children: mergeStaticWithFiber(
          staticNode.children || [],
          fiberLookup,
          usedFibers,
          staticNamesInTree,
          nextParentFiber,
          false,
        ),
        isBridge: true,
        hasFiber: true,
        renderCondition: staticNode.renderCondition,
        usageLine: staticNode.usageLine,
      };
    }

    return {
      file: staticNode.file,
      component: staticNode.component,
      source: staticNode.component?.filePath
        ? { fileName: staticNode.component.filePath }
        : null,
      fiber: fiberMatch?.fiber || null,
      children: mergeStaticWithFiber(
        staticNode.children || [],
        fiberLookup,
        usedFibers,
        staticNamesInTree,
        nextParentFiber,
        thisUnrendered,
      ),
      isServerOnly: !fiberMatch && !isClientComponent,
      hasFiber: !!fiberMatch,
      renderCondition: staticNode.renderCondition,
      usageLine: staticNode.usageLine,
    };
  });
}

export function findNodeIdByFiber(
  nodes: any[],
  fiber: any,
  prefix = "",
): string | null {
  for (let i = 0; i < nodes.length; i++) {
    const nodeId = prefix ? prefix + "-" + i : String(i);
    const node = nodes[i];
    if (node?.fiber && (node.fiber === fiber || node.fiber.alternate === fiber || node.fiber === fiber.alternate)) return nodeId;
    if (node?.children?.length) {
      const found = findNodeIdByFiber(node.children, fiber, nodeId);
      if (found) return found;
    }
  }
  return null;
}

export function findNodeIdForFiber(
  displayTree: any[],
  fiber: any,
): string | null {
  let current = fiber;
  const seen = new Set<any>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const id = findNodeIdByFiber(displayTree, current);
    if (id) return id;
    current = current.return;
  }
  return null;
}


export function getNodeByPath(tree: any[], path: string): any | null {
  if (!path) return null;
  const parts = path.split("-").map(Number);
  let current = tree;
  let node = null;
  for (const idx of parts) {
    if (!current || idx >= current.length) return null;
    node = current[idx];
    current = node.children || [];
  }
  return node;
}
