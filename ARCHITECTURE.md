# Architecture

## Core Problem

The overlay currently **participates** in the React render cycle instead of **observing** it. Clicking elements, hovering, and panel interactions all trigger React re-renders that get counted as app renders. This pollutes the metrics and defeats the tool's purpose.

## Design Principle

**The overlay must be a passive observer, not an active participant.**

---

## Current State (Problems)

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser Page                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    React App                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │   │
│  │  │ Component A │  │ Component B │  │  Overlay    │   │   │ ← PROBLEM: Overlay
│  │  │             │  │             │  │  (mixed in) │   │   │   lives in same
│  │  └─────────────┘  └─────────────┘  └─────────────┘   │   │   React tree
│  └──────────────────────────────────────────────────────┘   │
│                              ↑                               │
│                    Overlay clicks trigger                    │
│                    React reconciliation                      │
└─────────────────────────────────────────────────────────────┘
```

### Specific Issues

1. **Render pollution** - Panel interactions count toward component renders
2. **Event bubbling** - Clicks/hovers propagate and trigger React handlers
3. **1400-line IIFE** - Unmaintainable blob of inline JavaScript
4. **Duplicated types** - `ComponentInfo` defined 3 times across files
5. **Mixed concerns** - CLI contains HTTP server, proxy logic, business logic
6. **No clear data boundary** - Static analysis and runtime inspection tangled

---

## Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser Page                          │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    React App                          │   │
│  │  ┌─────────────┐  ┌─────────────┐                    │   │
│  │  │ Component A │  │ Component B │                    │   │
│  │  └─────────────┘  └─────────────┘                    │   │
│  └──────────────────────────────────────────────────────┘   │
│                              │                               │
│                    READ ONLY (fiber)                         │
│                              ↓                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Isolated Overlay Layer                   │   │
│  │         (Shadow DOM or detached from React)           │   │
│  │                                                       │   │
│  │  • Events: capture + stopImmediatePropagation        │   │
│  │  • DOM: Shadow root or iframe                        │   │
│  │  • State: Plain JS, no React                         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Static Analysis │ ──→ │  Component JSON  │ ──→ │ Browser Overlay  │
│    (build time)  │      │  (data artifact) │      │   (runtime)      │
└─────────────────┘      └─────────────────┘      └─────────────────┘
        │                                                  │
    ts-morph                                         React Fiber
    parses AST                                      (read-only match)
        │                                                  │
        ↓                                                  ↓
┌─────────────────┐                              ┌─────────────────┐
│ Import graph    │                              │ DOM element ←→  │
│ Props/hooks     │                              │ Component match │
│ Client/server   │                              │ Render tracking │
└─────────────────┘                              └─────────────────┘
```

**Static analysis is the source of truth.** Runtime just matches components to DOM for highlighting.

---

## Module Structure

```
src/
├── types.ts                 # Single source of truth for all interfaces
│
├── analyze/
│   ├── index.ts             # Main entry: analyzeRoute(), analyzeProject()
│   ├── ast.ts               # ts-morph helpers: extractProps(), findHooks()
│   ├── imports.ts           # Build import graph from source files
│   └── routes.ts            # Next.js route file resolution
│
├── overlay/
│   ├── index.ts             # generateOverlayScript() - assembles modules
│   ├── core.ts              # State management, init, toggle
│   ├── panel.ts             # Panel UI rendering (tree view, stats)
│   ├── inspector.ts         # DOM inspection (highlight, select)
│   ├── fiber.ts             # React fiber utilities (read-only)
│   ├── styles.ts            # CSS as string constant
│   └── events.ts            # Event isolation utilities
│
├── server.ts                # HTTP proxy/inject server (extracted from cli)
└── cli.ts                   # Just argument parsing and orchestration
```

---

## Key Isolation Techniques

### 1. Shadow DOM for Panel

```javascript
const host = document.createElement("div");
host.id = "repo-overlay-host";
const shadow = host.attachShadow({ mode: "closed" });
shadow.innerHTML = `<style>${CSS}</style><div id="panel">...</div>`;
document.body.appendChild(host);
```

Shadow DOM prevents:

- Style leakage in both directions
- Event bubbling into React's synthetic event system
- React from "seeing" our DOM nodes

### 2. Event Capture with Full Stop

```javascript
function isolatedHandler(handler) {
  return (e) => {
    e.stopPropagation();
    e.stopImmediatePropagation();
    e.preventDefault();
    handler(e);
  };
}

element.addEventListener("click", isolatedHandler(onClick), { capture: true });
```

### 3. Render Tracking via DevTools Hook

Current approach patches `onCommitFiberRoot` - this is correct, but we need to filter out:

- Our own overlay elements (by checking fiber.stateNode against shadow root)
- Renders triggered by our inspection

```javascript
function isOverlayFiber(fiber) {
  let node = fiber.stateNode;
  while (node) {
    if (node === overlayRoot || node.host === overlayHost) return true;
    node = node.parentNode;
  }
  return false;
}
```

### 4. Passive Fiber Reading

Never write to fiber. Only read:

- `fiber.memoizedProps` - current props
- `fiber.memoizedState` - current state
- `fiber.type` - component function/class
- `fiber.return` - parent fiber
- `fiber.child` / `fiber.sibling` - children

---

## Future: Refactoring Analysis

For analyzing parent/child relationships and refactor opportunities:

### Data Model Extension

```typescript
interface ComponentAnalysis {
  component: ComponentInfo;

  // Static analysis
  imports: string[]; // What this component imports
  importedBy: string[]; // What imports this component
  propsPassedDown: PropFlow[]; // Props this component passes to children
  propsReceivedFrom: PropFlow[]; // Props received from parents

  // Refactor signals
  signals: RefactorSignal[];
}

interface PropFlow {
  propName: string;
  fromComponent: string;
  toComponent: string;
  transformation: "passthrough" | "destructure" | "computed";
}

interface RefactorSignal {
  type:
    | "prop-drilling"
    | "duplicate-state"
    | "large-component"
    | "many-children";
  severity: "info" | "warning" | "critical";
  description: string;
  affectedComponents: string[];
}
```

### Analysis Rules

1. **Prop drilling detection**

   - Track props that pass through 3+ components unchanged
   - Suggest context or composition

2. **Duplicate state**

   - Find useState with same initial value in siblings
   - Suggest lifting state

3. **Component size**

   - Count JSX elements, hooks, props
   - Flag components over threshold

4. **Render coupling**
   - Track which components always re-render together
   - Suggest memoization or restructuring

---

## Migration Path

### Phase 1: Isolate Overlay (Critical)

- [ ] Shadow DOM wrapper for panel
- [ ] Event isolation on all handlers
- [ ] Filter overlay renders from tracking
- [ ] Verify zero pollution in render counts

### Phase 2: Split Modules

- [ ] Extract types.ts
- [ ] Split overlay.ts into focused modules
- [ ] Extract server.ts from cli.ts
- [ ] Consolidate analyzer logic

### Phase 3: Refactoring Analysis

- [ ] Build import graph (who imports whom)
- [ ] Track prop flow through tree
- [ ] Implement detection rules
- [ ] Add refactor suggestions to output

---

## Non-Goals

- **Not a React DevTools replacement** - We show static analysis + light runtime info
- **Not a profiler** - We count renders, we don't measure timing
- **Not a bundler plugin** - We analyze source, not build output
