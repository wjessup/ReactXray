export function getReactFiber(el: Element): any {
  const keys = Object.keys(el);
  const fiberKey = keys.find(
    (k) =>
      k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")
  );
  return fiberKey ? (el as any)[fiberKey] : null;
}

export function getFiberName(fiber: any): string | null {
  if (!fiber?.type) return null;
  const type = fiber.type;

  if (typeof type === "string") return null;
  if (typeof type === "function") return type.displayName || type.name || null;

  if (typeof type === "object") {
    if (type.displayName) return type.displayName;
    if (type.render?.displayName) return type.render.displayName;
    if (type.render?.name) return type.render.name;
    if (type.type?.displayName) return type.type.displayName;
    if (type.type?.name) return type.type.name;
  }

  return null;
}

export function getComponentStack(el: Element): string[] {
  const fiber = getReactFiber(el);
  if (!fiber) return [];

  const stack: string[] = [];
  let current = fiber;
  const seen = new Set();

  while (current && stack.length < 15) {
    if (seen.has(current)) break;
    seen.add(current);

    const name = getFiberName(current);
    if (
      name &&
      name.length > 1 &&
      !name.startsWith("_") &&
      name !== "Fragment" &&
      !/^[a-z]/.test(name)
    ) {
      if (stack.length === 0 || stack[stack.length - 1] !== name) {
        stack.push(name);
      }
    }
    current = current.return;
  }

  return stack;
}

export function findElementsByComponentName(
  name: string,
  excludeRoot: Element | null
): Element[] {
  const results: Element[] = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT
  );

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const el = node as Element;
    if (excludeRoot && excludeRoot.contains(el)) continue;

    const fiber = getReactFiber(el);
    if (!fiber) continue;

    let current = fiber;
    const seen = new Set();

    while (current) {
      if (seen.has(current)) break;
      seen.add(current);

      if (getFiberName(current) === name) {
        results.push(el);
        break;
      }
      current = current.return;
    }
  }

  return results;
}

export function getLiveComponentData(el: Element, componentName: string) {
  const fiber = getReactFiber(el);
  if (!fiber) return { props: null, state: [] };

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

  const stateValues: { index: number; value: any }[] = [];
  let stateNode = targetFiber.memoizedState;
  let hookIndex = 0;

  while (stateNode && hookIndex < 10) {
    if (
      stateNode.memoizedState !== undefined &&
      stateNode.memoizedState !== null
    ) {
      const val = stateNode.memoizedState;
      if (typeof val !== "function" && typeof val?.current === "undefined") {
        stateValues.push({ index: hookIndex, value: val });
      }
    }
    stateNode = stateNode.next;
    hookIndex++;
  }

  return { props: liveProps, state: stateValues };
}

export function getFiberAncestorNames(el: Element): string[] {
  const fiber = getReactFiber(el);
  if (!fiber) return [];

  const ancestors: string[] = [];
  let current = fiber.return;
  const seen = new Set();

  while (current && ancestors.length < 50) {
    if (seen.has(current)) break;
    seen.add(current);

    const name = getFiberName(current);
    if (name) ancestors.push(name);
    current = current.return;
  }

  return ancestors;
}
