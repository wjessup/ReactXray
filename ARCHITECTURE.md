# Component Overlay Architecture

## Overview

The Component Overlay is a development tool that visualizes the full React component tree for Next.js applications. It combines **static AST analysis** with **runtime React fiber inspection** to provide a complete picture of both server and client components.

## The Problem

Next.js App Router uses React Server Components (RSC), which creates a split architecture with **multiple client/server boundaries**:

```
┌─────────────────────────────────────────────────────────────────┐
│                         SERVER                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │ RootLayout  │ -> │StandardLayout│ -> │   Search    │         │
│  │ (layout.tsx)│    │ (layout.tsx) │    │ (page.tsx)  │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│         │                  │                  │                  │
│         ▼                  ▼                  ▼                  │
│    HTML/RSC Payload ──────────────────────────────────────────► │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                         │
│                                                                  │
│  React Fiber Tree starts here:                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │ SearchPage  │ -> │ FilterPanel │ -> │  Results    │         │
│  │  (CLIENT)   │    │  (CLIENT)   │    │  (CLIENT)   │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

**Server Components:**
- Execute only on the server
- Can do direct data fetching (async/await)
- Output HTML/RSC payload sent to client
- **Do NOT exist in the client-side React fiber tree**

**Client Components:**
- Marked with `"use client"` directive
- Hydrate on the client
- Have state, effects, event handlers
- **Exist in the React fiber tree**

This means traditional React DevTools only see client components. The server component hierarchy is invisible.

## The Multiple Boundaries Problem

A single server component can render **multiple client components** at various depths:

```
StandardLayout [SERVER]
├── PreviewBanner [CLIENT] ← Bridge #1
├── SiteBanner [CLIENT] ← Bridge #2
├── ScrollToTop [CLIENT] ← Bridge #3
├── TipsProvider [wrapper]
│   └── SpecimenModalProvider [wrapper]
│       ├── HeaderWithSearch [SERVER]
│       │   └── ModernSearch [CLIENT] ← Bridge #4 (nested!)
│       ├── MainNavigationMenu [CLIENT] ← Bridge #5
│       ├── Footer [CLIENT] ← Bridge #6
│       └── MobileBottomNav [CLIENT] ← Bridge #7
└── {children} → page components
```

The challenge is that:
1. Library wrapper components (FeatureFlagProvider, TipsProvider) don't exist in our codebase
2. Project components can be deeply nested inside these wrappers
3. We need to find ALL project components rendered by a file, not just top-level ones

### Solution: Extract All Project Components

When analyzing a file's JSX, we extract components from ALL levels:
- `directChildren` - top-level JSX elements
- `nestedInComponent` - elements nested inside other components
- `inferredInComponent` - dynamically computed component references

The `getAllProjectComponentsFromFile` function gathers all of these, filters to only project components (those in our codebase), and adds them as children in the tree.

## Solution: Two-Source Merge

We use two data sources and merge them at "bridge points":

### Source 1: Static AST Analysis

Analyzes the actual source files using `ts-morph` to extract:

```typescript
interface ComponentInfo {
  name: string;
  filePath: string;
  props: PropInfo[];           // TypeScript prop types
  hooks: string[];             // Hook names used
  serverQueries: string[];     // Data fetching calls
  isClientComponent: boolean;  // Has "use client"
  isServerComponent: boolean;
  nextjsFileType: 'page' | 'layout' | 'loading' | 'error' | null;
}
```

**Strengths:**
- Sees server components
- Has TypeScript type information
- Knows Next.js file conventions
- Has hook names (not just values)

**Weaknesses:**
- Cannot capture dynamic component composition
- No runtime values
- Guesses at JSX structure from static analysis

### Source 2: React Fiber Tree

Captures the live React fiber tree from `window.__REACT_DEVTOOLS_GLOBAL_HOOK__`:

```typescript
interface FiberNode {
  name: string;
  fiber: ReactFiber;           // Actual fiber reference
  source: { fileName, lineNumber };
  children: FiberNode[];
}
```

**Strengths:**
- Shows actual rendered components
- Has runtime prop values
- Has live hook state
- Captures dynamic rendering

**Weaknesses:**
- Only sees client components
- No TypeScript types
- Must infer hook types from structure

## The Merge Algorithm

```
┌──────────────────────────────────────────────────────────────────┐
│                        MERGED TREE                                │
│                                                                   │
│  RootLayout [RSC] ◄─────────────────── From Static Analysis      │
│  ├── JsonLdWebsite [RSC]                                         │
│  ├── ReactQueryProvider [BRIDGE] ◄───── Bridge #1                │
│  │   └── ... ◄────────────────────────── From Fiber              │
│  └── {children}                                                   │
│      └── StandardLayout [RSC]                                     │
│          ├── PreviewBanner [BRIDGE] ◄── Bridge #2                │
│          ├── HeaderWithSearch [RSC]                               │
│          │   └── ModernSearch [BRIDGE] ◄ Bridge #3 (nested!)     │
│          │       └── ... ◄─────────────── From Fiber             │
│          ├── MainNavigationMenu [BRIDGE] Bridge #4               │
│          ├── Footer [BRIDGE] ◄───────── Bridge #5                │
│          └── {children}                                           │
│              └── Search [RSC]                                     │
│                  └── SearchPage [BRIDGE] Bridge #6                │
│                      └── ... ◄───────── From Fiber Tree          │
└──────────────────────────────────────────────────────────────────┘
```

### Bridge Points

A **bridge point** is a client component that:
1. Has `"use client"` directive (or is imported by a client component)
2. Appears in the static tree (extracted from source files)
3. Has a matching fiber node in the runtime tree

At bridge points, we:
- Keep static metadata (props types, hooks names, file type)
- Replace children with fiber's actual rendered subtree
- Attach fiber reference for runtime inspection

**Important**: Server components can render other server components which THEN render client components. For example:

```
StandardLayout [SERVER] ─renders→ HeaderWithSearch [SERVER] ─renders→ ModernSearch [CLIENT]
```

`HeaderWithSearch` is a server component (does `await safeAuthenticate()`) that renders `ModernSearch` (a client component with hooks). The bridge is at `ModernSearch`, not `HeaderWithSearch`.

### Implementation

```javascript
function mergeStaticWithFiber(staticNodes, fiberLookup) {
  return staticNodes.map(staticNode => {
    const compName = staticNode.component?.name;
    const isClient = staticNode.component?.isClientComponent;
    
    // Find matching fiber node
    const fiberMatch = fiberLookup.get(compName);
    
    if (fiberMatch && isClient) {
      // BRIDGE POINT: Use fiber's subtree
      return {
        ...staticNode,
        fiber: fiberMatch.fiber,
        children: fiberMatch.children,  // Fiber tree takes over
        isBridge: true,
      };
    }
    
    // Server component: keep static structure
    return {
      ...staticNode,
      children: mergeStaticWithFiber(staticNode.children, fiberLookup),
      isServerOnly: !fiberMatch && !isClient,
    };
  });
}
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                           BUILD TIME                                 │
│                                                                      │
│  Source Files ──► ts-morph AST ──► ComponentInfo[] ──► static-tree  │
│                      Parser           Extraction                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         SERVER (Proxy)                               │
│                                                                      │
│  analyzeRoute() ──► generateOverlayScript() ──► Inject into HTML    │
│       │                     │                                        │
│       ▼                     ▼                                        │
│  STATIC_TREE         Embedded in script                              │
│  (JSON)              as initial data                                 │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      BROWSER (Runtime)                               │
│                                                                      │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐                │
│  │STATIC_TREE │    │ Fiber Tree │    │  MERGED    │                │
│  │  (const)   │ +  │ (captured) │ =  │   TREE     │                │
│  └────────────┘    └────────────┘    └────────────┘                │
│                                             │                        │
│                                             ▼                        │
│                                      ┌────────────┐                 │
│                                      │  Render    │                 │
│                                      │   Panel    │                 │
│                                      └────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Visual Indicators

| Element | Meaning |
|---------|---------|
| `RSC` badge (green) | Server component - rendered on server, no fiber |
| `⚡CLIENT` badge (blue border) | Bridge point - where fiber connects |
| `CLIENT` badge | Client component within fiber tree |
| `📐` | Layout file (`layout.tsx`) |
| `📄` | Page file (`page.tsx`) |
| `⏳` | Loading file (`loading.tsx`) |
| `⚠️` | Error file (`error.tsx`) |
| `⚡3` | Component uses 3 hooks |
| Green left border | Server-only component |
| Blue left border | Bridge component |
| `{children}` (dashed) | Next.js children slot |
| Render count | Client re-render tracking |
| `—` (render count) | Server component (no re-renders) |

## Debug Tools

### CLI Debug Command

```bash
node dist/cli.js debug /path/to/nextjs-project /route
```

Outputs to `debug/`:
- `static-tree.json` - Full component hierarchy from AST
- `all-components.json` - Flat list with all metadata
- `component-map.json` - Components indexed by name
- `entry-files.json` - Layout/page file paths
- `stats.json` - Summary statistics

### Browser Debug API

```javascript
// Compare static vs fiber
await __REPO_OVERLAY__.debug.compareStatic()

// Dump all data
await __REPO_OVERLAY__.debug.dumpAll()

// Get specific data
__REPO_OVERLAY__.debug.getStaticComponentMap()
__REPO_OVERLAY__.debug.getFiberTreeRaw()
__REPO_OVERLAY__.debug.getDisplayTree()
```

## File Structure

```
src/
├── analyze/
│   ├── index.ts      # Main analysis functions
│   ├── ast.ts        # Component extraction from AST
│   ├── imports.ts    # Import graph building
│   └── routes.ts     # Next.js route resolution
├── overlay/
│   ├── index.ts      # Overlay script generation
│   └── styles.ts     # CSS styles
├── server.ts         # Proxy server with injection
├── cli.ts            # CLI commands
└── types.ts          # TypeScript interfaces

debug/                # Debug output files
├── static-tree.json
├── all-components.json
├── component-map.json
├── entry-files.json
└── stats.json
```

## Key Concepts

### Why Static + Fiber?

Neither source alone is sufficient:

| Requirement | Static Only | Fiber Only | Merged |
|-------------|-------------|------------|--------|
| Server components | ✅ | ❌ | ✅ |
| Dynamic rendering | ❌ | ✅ | ✅ |
| TypeScript types | ✅ | ❌ | ✅ |
| Runtime values | ❌ | ✅ | ✅ |
| Hook names | ✅ | ❌ | ✅ |
| Hook values | ❌ | ✅ | ✅ |
| Full hierarchy | ✅ | ❌ | ✅ |

### The Fiber Tree Limitation

React's fiber tree is an internal data structure for **client-side reconciliation**. It tracks:
- Component instances
- State and effects
- DOM relationships

Server components never instantiate on the client - they're just HTML by the time they reach the browser. There's no fiber node for `RootLayout` because React on the client never "sees" it as a component.

### Why Bridge at Client Boundaries?

At client component boundaries, we trust fiber over static analysis because:
1. Fiber shows what **actually rendered** after all JS logic
2. Static analysis can only **guess** at dynamic composition
3. Props and state are **live values** in fiber

Above the bridge (server territory), we trust static analysis because fiber has no visibility there.
