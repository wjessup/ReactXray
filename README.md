# Repo Analyzer

CLI tool that analyzes JavaScript/TypeScript codebases and generates JSON artifacts for AI consumption. Includes a browser overlay for visualizing React component trees on live sites.

## Install

```bash
pnpm install
pnpm build
```

## Commands

### `analyze` - Full codebase analysis

```bash
pnpm analyze <path-to-project>
pnpm analyze ~/Code/my-nextjs-app --only deps,components
pnpm analyze ~/Code/my-nextjs-app --out ./custom-output
```

| Flag            | Description                                                    |
| --------------- | -------------------------------------------------------------- |
| `--out <dir>`   | Output directory (default: `./repo-analysis-output`)           |
| `--only <list>` | Run specific analyzers: `deps`, `tree`, `components`, `routes` |

### `route` - Analyze a specific Next.js route

Generates a component tree visualization for a single route.

```bash
pnpm route <project-path> <route>
pnpm route ~/Code/my-nextjs-app /dashboard/settings
```

Outputs:

- `route-dashboard-settings.json` - Component tree data
- `route-dashboard-settings.html` - Static HTML visualization
- `route-dashboard-settings-overlay.js` - Injectable browser overlay

### `serve` - Live overlay server with proxy

Run a proxy server that injects the component overlay into your running app.

```bash
pnpm serve --proxy http://localhost:3000 --project ~/Code/my-nextjs-app
```

Then open `http://localhost:9876` instead of `localhost:3000`.

| Flag                | Description                                              |
| ------------------- | -------------------------------------------------------- |
| `--proxy <url>`     | Target app URL to proxy                                  |
| `--project <path>`  | Next.js project path for dynamic route analysis          |
| `--overlay <file>`  | Static overlay file to inject (alternative to --project) |
| `-p, --port <port>` | Proxy server port (default: 9876)                        |

**Features:**

- Strips CSP headers so the overlay can run
- Dynamic mode (`--project`): Automatically analyzes whatever route you navigate to
- Static mode (`--overlay`): Uses a pre-generated overlay file
- Route change detection: Overlay updates when you navigate

### `debug` - Dump analysis data for debugging

Outputs static analysis data to the `debug/` folder for inspection.

```bash
pnpm debug <project-path> <route>
pnpm debug ~/Code/my-nextjs-app /search
```

Outputs:
- `debug/static-tree.json` - Component tree from AST analysis
- `debug/calculated-tree.json` - Merged tree (static + fiber) from browser
- `debug/all-components.json` - Full ComponentInfo for each component
- `debug/component-map.json` - Components indexed by name
- `debug/stats.json` - Summary statistics
- `debug/entry-files.json` - Layouts, pages, loading, error files

### `verify` - Validate tree accuracy

Compares the generated tree against actual source files to detect discrepancies.

```bash
pnpm verify <project-path> <tree-json>
pnpm verify ~/Code/my-nextjs-app debug/static-tree.json
```

Reports:
- **Missing children** - Components in source but not in tree
- **Extra children** - Components in tree that shouldn't be direct children
- Helps catch bugs in the static analysis logic

## Browser Overlay

The overlay shows your React component tree alongside your running app.

### Controls

- **🔍 Toggle button** (right edge) - Open/close the panel
- **Ctrl+Shift+C** - Keyboard shortcut to toggle
- **⏸ Pause** - Disable inspect mode to navigate normally
- **Search** - Filter components by name or file path
- **Click component** - Highlights it on the page, scrolls into view
- **Click again** - Cycles through multiple instances (shows "Link (2/5)")
- **Double-click** - Opens file in VS Code
- **Drag left edge** - Resize panel width

### Route Change Detection

When paused, navigate to a different route. The overlay automatically:

1. Detects the URL change
2. Shows a loading spinner
3. Analyzes the new route
4. Updates the component tree

### Manual Reload

```javascript
window.__REPO_OVERLAY__.reload();
```

## Output Files

### Analysis Output (`repo-analysis-output/`)

| File                 | Contents                                                     |
| -------------------- | ------------------------------------------------------------ |
| `dependencies.json`  | Import graph, circular dependencies, orphan files            |
| `file-tree.json`     | Directory structure with file sizes and extensions           |
| `components.json`    | React components with props, hooks, client/server directives |
| `routes.json`        | Next.js API routes (pages/api and app router)                |
| `route-*.json`       | Component tree for a specific route                          |
| `route-*.html`       | Static HTML visualization                                    |
| `route-*-overlay.js` | Injectable browser overlay script                            |

### Debug Output (`debug/`)

| File                   | Contents                                              |
| ---------------------- | ----------------------------------------------------- |
| `static-tree.json`     | Component tree from AST analysis                      |
| `calculated-tree.json` | Merged tree (static + React fiber) captured in browser|
| `all-components.json`  | Full ComponentInfo for each detected component        |
| `component-map.json`   | Components indexed by name for quick lookup           |
| `stats.json`           | Summary: total components, client/server counts       |
| `entry-files.json`     | Next.js entry points (layouts, pages, etc.)           |

## Analyzers

### Dependencies

Uses [Madge](https://github.com/pahen/madge) to map imports/exports and detect circular dependencies.

### File Tree

Recursive directory walk with metadata (size, extension). Ignores `node_modules`, `.git`, `.next`, `dist`, `build`.

### Components

AST parsing with ts-morph to extract React components, their props, hooks, and client/server directives.

**Detection criteria:**
- PascalCase function/arrow function
- Returns JSX (`<...>`) or `null`
- Not a Next.js special export (`generateMetadata`, etc.)

**Tree building:**
- Respects JSX hierarchy - only direct children become tree children
- Traverses through external library wrappers (e.g., finds components inside `<NextIntlClientProvider>`)
- Stops at project component boundaries (children of `<MyComponent>` are built from MyComponent.tsx, not the caller)

### Routes

Scans Next.js `pages/api/*` and `app/**/route.ts` files, extracting HTTP methods and route parameters.

### Route Components

Builds a complete component tree for a specific route, following imports to map the full hierarchy with component metadata.

## Why This Exists

AI assistants reading raw files often miss the full picture. They see `page.tsx` but don't understand:

- What layout wraps it
- Where data flows from (URL params → hooks → props → child components)
- Which components are client vs server
- What queries fetch the data being displayed

This tool generates **synthesized context** that shows the relational structure—how components connect, what data flows through them, and where the boundaries are.

## Data Flow Tracking

The analyzer tracks how data flows from server to client:

- **Server queries** - Async calls in server components (`await fetch()`, database queries)
- **childDataFlow** - Props passed to child components with their source:
  - `literal` - Hardcoded value
  - `computed` - Derived from variables/expressions
  - `serverQuery` - Data from a server-side fetch

Example output:
```json
{
  "name": "SearchPage",
  "childDataFlow": [
    { "component": "FilterProvider", "props": { "initialFilter": { "source": "serverQuery", "query": "parseFilter" } } },
    { "component": "SpecimenGrid", "props": { "data": { "source": "serverQuery", "query": "specimenSearch" } } }
  ]
}
```

## Roadmap

### Planned Improvements

- **URL params / searchParams** - Track where `useSearchParams()` flows
- **React Query / SWR hooks** - Cache key analysis and query dependencies
- **Context providers** - Map what values flow through context
- **Prop drilling detection** - Flag data passing through 3+ components unchanged

### Refactor Opportunity Detection

- Components using the same hook with different keys (duplicate fetching)
- Props passed through multiple layers that could be context
- Client components that could be server components
- Circular data dependencies between components
