# Similar Projects & Competitive Analysis

This document catalogs existing tools in the React component visualization and analysis space, and explains how the Component Overlay differs from each.

---

## Overview: The Gap in Existing Tools

Most React development tools fall into one of two categories:

1. **Runtime-only tools** - Inspect the live React fiber tree (client components only)
2. **Static-only tools** - Analyze source code AST (miss runtime behavior)

**None merge both approaches**, leaving a blind spot for Next.js App Router applications where React Server Components (RSC) exist only on the server and never appear in the client-side fiber tree.

---

## Runtime Fiber Inspection Tools

### Reactime
- **GitHub**: [open-source-labs/Reactime](https://github.com/open-source-labs/Reactime)
- **What it does**: Time-travel debugging and performance monitoring. Visualizes component graphs, state history, and accessibility tree using React Fiber for state tracking.
- **Strengths**: Excellent for debugging state changes over time, performance profiling
- **Limitations**: 
  - Cannot see React Server Components
  - No TypeScript prop type information
  - No Next.js file convention awareness (page.tsx, layout.tsx)
- **How we differ**: We merge static analysis to show the full tree including server components, and preserve TypeScript type information for props.

### Realize
- **GitHub**: [oslabs-beta/Realize](https://github.com/oslabs-beta/Realize)
- **What it does**: Browser extension + DevTools panel that visualizes running React app's component tree. Supports zoom/pan, props/state viewing, search.
- **Strengths**: Clean UI, good for exploring component hierarchy
- **Limitations**:
  - Requires React DevTools
  - Only sees client components
  - Uglified production builds reduce usefulness
- **How we differ**: We work with the source code directly via AST, so component names and file paths are always available regardless of build optimization.

### React Inspector
- **GitHub**: [hand-dot/react-inspector](https://github.com/hand-dot/react-inspector)
- **What it does**: Chrome extension that uses `__REACT_DEVTOOLS_GLOBAL_HOOK__` to let you hover over UI elements, get the fiber node, and open the source file in your editor.
- **Strengths**: Quick "click to source" workflow
- **Limitations**:
  - Only works in development builds
  - React 19 removed `_debugSource` from fibers, breaking this approach
  - Server components invisible
- **How we differ**: We use static analysis to maintain source file mapping, which is more reliable than runtime debug metadata. Our approach survives React version changes.

### React Fiber Visualizer
- **Chrome Extension**: [React Fiber Visualizer](https://chromewebstore.google.com/detail/react-fiber-visualizer/ffpgaakakoiafckdeoflmiipnjencpnj)
- **What it does**: Adds a "Fiber" panel in DevTools showing the raw fiber tree data structure.
- **Strengths**: Educational, shows internal React structure
- **Limitations**:
  - Low-level (not component-focused)
  - Only tested on React 17
  - No server component support
- **How we differ**: We abstract away fiber internals and present a clean component tree with metadata that developers actually need.

---

## React Server Components Tools

### RSC DevTools
- **Chrome Extension**: [RSC DevTools](https://chromewebstore.google.com/detail/rsc-devtools/jcejahepddjnppkhomnidalpnnnemomn)
- **What it does**: Captures RSC streaming data from the network and visualizes component loading order with a timeline slider.
- **Strengths**: Only tool specifically for RSC visualization, shows streaming/loading sequence
- **Limitations**:
  - Only shows what's in the flight payload (wire format)
  - Doesn't merge with client component tree
  - No source file mapping or prop types
  - Focused on loading performance, not component relationships
- **How we differ**: We show the complete merged tree - server components from static analysis joined with client components from fiber - giving a unified view of the entire application hierarchy.

### rsc-parser
- **GitHub**: Used internally by RSC DevTools
- **What it does**: Parses React Server Components wire format (flight payloads, `__next_f` data).
- **Strengths**: Useful for understanding RSC serialization
- **Limitations**:
  - Library only, no visualization
  - Only sees what's sent over the wire
- **How we differ**: We analyze source files directly, so we see the full component structure including conditional branches that may not render on a given request.

---

## Static AST Analysis Tools

### react-scanner
- **GitHub**: [moroshko/react-scanner](https://github.com/moroshko/react-scanner)
- **What it does**: Extracts React component and props usage statically, outputting JSON reports. Supports TypeScript.
- **Strengths**: Good for audits, design system consistency checking
- **Limitations**:
  - No visualization (JSON output only)
  - No runtime data (actual prop values, state)
  - No tree structure (flat component list)
- **How we differ**: We build an actual component tree with parent-child relationships, and merge with runtime fiber data to show live values.

### React-Component-Analyzer
- **npm**: `react-component-analyzer`
- **What it does**: Generates component tree diagrams and HTML reports from source files.
- **Strengths**: Produces visual output, useful for architecture review
- **Limitations**:
  - Static only - no runtime values
  - Doesn't handle dynamic component patterns (map, conditional rendering)
  - No Next.js awareness
- **How we differ**: We handle complex patterns like components returned from hooks, `.map()` iterations, and conditional rendering. We understand Next.js file conventions.

### visualize-react-component
- **npm**: `visualize-react-component`
- **What it does**: Static AST analysis using `@typescript-eslint/typescript-estree`, displays component tree diagram with source code links.
- **Strengths**: Simple, focused tool
- **Limitations**:
  - Last updated ~3 years ago
  - No React 18+ or Server Component support
  - No runtime integration
- **How we differ**: We're built for modern Next.js with App Router and Server Components. Actively maintained for current React patterns.

---

## Dependency Graph Tools

### Madge
- **GitHub**: [pahen/madge](https://github.com/pahen/madge)
- **What it does**: Builds dependency graphs by analyzing ES6 imports. Detects circular dependencies, orphan files.
- **Strengths**: Fast, widely used, generates visual graphs
- **Limitations**:
  - Shows file-level dependencies, not component-level
  - No React-specific understanding
  - No runtime integration
- **How we differ**: We use ts-morph for import resolution and component tree building, giving us full TypeScript type information and JSX semantics. Our analysis understands which components render which children, not just which files import which.

### dependency-cruiser
- **GitHub**: [sverweij/dependency-cruiser](https://github.com/sverweij/dependency-cruiser)
- **What it does**: Advanced dependency analysis with configurable validation rules and visualization.
- **Strengths**: Powerful rule engine, CI integration
- **Limitations**:
  - File/module focused, not component focused
  - No React semantics
- **How we differ**: We understand JSX - that `<Header />` in `layout.tsx` means `Header` is a child component, not just an import.

---

## Data Fetching Visualization

### React Fetch Tree
- **Website**: [reactfetchtree.com](https://www.reactfetchtree.com/)
- **What it does**: Runtime visualizer showing component tree with data fetching locations highlighted. Helps detect waterfall request patterns.
- **Strengths**: Excellent for performance debugging, shows fetch waterfalls
- **Limitations**:
  - Focused only on data fetching
  - Client components only
  - No TypeScript/prop information
- **How we differ**: We show the full component tree with all metadata, not just fetch-related components. Server components (which often do the data fetching in Next.js) are visible.

---

## Official Tools

### React Developer Tools
- **Chrome Extension**: Official React team extension
- **What it does**: Inspect component tree, edit props/state, profile performance.
- **Strengths**: Official, well-maintained, feature-rich
- **Limitations**:
  - Only sees client components (fiber tree)
  - Server components appear as "unstyled" or missing
  - No source file type information
- **How we differ**: We augment DevTools' view with server component visibility and TypeScript metadata.

---

### React-source-lens
- **GitHub**: [react-source-lens](https://github.com/react-source-lens/react-source-lens)
- **What it does**: Hover over rendered components to see file path and line number. Uses Babel plugin to inject metadata during build.
- **Strengths**: Quick source file mapping, works with large Next.js apps
- **Limitations**:
  - No server vs client boundary visualization
  - No component hierarchy (just individual file mapping)
  - Requires build-time plugin setup
- **How we differ**: We show full component relationships and server/client boundaries without requiring build plugin modifications.

### Next DevTools
- **Chrome Extension**: [Next DevTools](https://chromewebstore.google.com/detail/next-devtools/admidbamafmdejfidoeijgghcffngbmp)
- **What it does**: Inspect props, page data, and route structure for Next.js apps. Shows performance indicators and oversized props.
- **Strengths**: Next.js specific, shows routing structure
- **Limitations**:
  - Runtime client-side inspection only
  - No server component visibility
  - Limited to what's available in browser DevTools
- **How we differ**: We merge static analysis with runtime data, showing complete server/client component trees.

### react-component-hierarchy (rch)
- **npm**: `react-component-hierarchy`
- **What it does**: CLI tool that prints component tree via console output.
- **Strengths**: Simple, terminal-based overview
- **Limitations**:
  - Outdated (non-transpiled JS focus)
  - No routing hierarchy understanding
  - No dynamic component pattern support
  - Console output only
- **How we differ**: We handle modern Next.js patterns, provide visual UI, and merge runtime data.

### React Sight
- **GitHub**: [React Sight](https://github.com/React-Sight/React-Sight)
- **What it does**: Interactive tree diagram of React app's virtual DOM with props/state on hover.
- **Strengths**: Clean visual interface, educational
- **Limitations**:
  - Client components only
  - No SSR/Server Component support
  - Support status uncertain
- **How we differ**: We show complete server + client component trees with TypeScript metadata.

### React Inspector
- **Chrome Extension**: [React Inspector](https://chromewebstore.google.com/detail/react-inspector/gkkcgbepkkhfnnjolcaggogkjodmlpkh)
- **What it does**: Click UI elements in DevTools to open source files in editor.
- **Strengths**: Quick "click to source" workflow
- **Limitations**:
  - Development builds only
  - React 19 compatibility issues (removed `_debugSource`)
  - No server component support
- **How we differ**: Our static analysis approach is more reliable than runtime debug metadata and survives React version changes.

## Summary: Our Unique Value Proposition

| Capability | Reactime | Realize | RSC DevTools | react-scanner | React-source-lens | Next DevTools | Component Overlay |
|------------|----------|---------|--------------|---------------|-------------------|---------------|-------------------|
| See server components | ❌ | ❌ | Partial | ❌ | ❌ | ❌ | ✅ |
| See client components | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Runtime prop values | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| TypeScript prop types | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Hook names | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Hook values | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Next.js file conventions | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Full component tree | ❌ | ❌ | ❌ | ❌ | ❌ | Partial | ✅ |
| Dynamic component patterns | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Source file mapping | Partial | Partial | ❌ | ✅ | ✅ | Partial | ✅ |

### Key Differentiators

1. **Two-Source Merge Architecture**: We're the only tool that merges static AST analysis with runtime fiber inspection at client/server "bridge points"

2. **Complete RSC Visibility**: Server components that never exist in the browser's fiber tree are visible through static analysis

3. **Nested Component Extraction**: Our `getAllProjectComponentsFromFile()` finds project components buried inside library wrappers (ThemeProvider, AuthProvider, etc.)

4. **Dynamic Component Resolution**: We trace components through `.map()` patterns, conditional rendering, and hook returns - something no other static analyzer does

5. **Next.js Native**: Built specifically for Next.js App Router, understanding layouts, pages, loading states, and error boundaries

6. **Best of Both Worlds**: TypeScript types from static analysis + live values from fiber = complete picture

---

## Potential Integration Points

These projects could potentially be combined with or inform our approach:

- **rsc-parser**: Could enhance our server component understanding by parsing flight payloads
- **React DevTools internals**: Could adopt their fiber walking improvements

### Overlay.dev & PureCode AI
- **Overlay.dev**: AI-assisted hero section generation with React/Next.js component export
- **PureCode AI**: English prompt-based component generation with VS Code integration
- **What they do**: Generate UI components and layouts, not visualization/debugging tools
- **How we differ**: We analyze and visualize existing component hierarchies, not generate new components

### Builder Devtools
- **Website**: [Builder.io DevTools](https://www.builder.io/blog/builder-devtools-nextjs)
- **What it does**: Visual editor overlay for Next.js components with drag-and-drop editing
- **Strengths**: No-code component editing capabilities
- **Limitations**:
  - Focuses on editing, not analysis
  - Commercial product
  - Not for debugging component relationships
- **How we differ**: We provide read-only analysis and debugging of component hierarchies, not editing capabilities

---

*Last updated: January 2026*
