export function isolate<E extends Event>(
  handler: (e: E) => void
): (e: E) => void {
  return (e: E) => {
    e.stopPropagation();
    e.stopImmediatePropagation();
    handler(e);
  };
}

export function isolatePrevent<E extends Event>(
  handler: (e: E) => void
): (e: E) => void {
  return (e: E) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    handler(e);
  };
}

export function addIsolatedListener<K extends keyof HTMLElementEventMap>(
  element: HTMLElement | ShadowRoot,
  type: K,
  handler: (e: HTMLElementEventMap[K]) => void,
  prevent = false
): () => void {
  const wrapped = prevent ? isolatePrevent(handler) : isolate(handler);
  element.addEventListener(type, wrapped as EventListener, { capture: true });
  return () =>
    element.removeEventListener(type, wrapped as EventListener, {
      capture: true,
    });
}

export function blockAllEvents(element: HTMLElement): () => void {
  const events = [
    "mousedown",
    "mouseup",
    "click",
    "dblclick",
    "pointerdown",
    "pointerup",
  ] as const;
  const cleanup: (() => void)[] = [];

  for (const evt of events) {
    cleanup.push(addIsolatedListener(element, evt, () => {}));
  }

  return () => cleanup.forEach((fn) => fn());
}
