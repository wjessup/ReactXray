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

| Flag | Description |
|------|-------------|
| `--out <dir>` | Output directory (default: `./repo-analysis-output`) |
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

| Flag | Description |
|------|-------------|
| `--proxy <url>` | Target app URL to proxy |
| `--project <path>` | Next.js project path for dynamic route analysis |
| `--overlay <file>` | Static overlay file to inject (alternative to --project) |
| `-p, --port <port>` | Proxy server port (default: 9876) |

**Features:**
- Strips CSP headers so the overlay can run
- Dynamic mode (`--project`): Automatically analyzes whatever route you navigate to
- Static mode (`--overlay`): Uses a pre-generated overlay file
- Route change detection: Overlay updates when you navigate

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
window.__REPO_OVERLAY__.reload()
```

## Output Files

| File | Contents |
|------|----------|
| `dependencies.json` | Import graph, circular dependencies, orphan files |
| `file-tree.json` | Directory structure with file sizes and extensions |
| `components.json` | React components with props, hooks, client/server directives |
| `routes.json` | Next.js API routes (pages/api and app router) |
| `route-*.json` | Component tree for a specific route |
| `route-*.html` | Static HTML visualization |
| `route-*-overlay.js` | Injectable browser overlay script |

## Analyzers

### Dependencies
Uses [Madge](https://github.com/pahen/madge) to map imports/exports and detect circular dependencies.

### File Tree
Recursive directory walk with metadata (size, extension). Ignores `node_modules`, `.git`, `.next`, `dist`, `build`.

### Components
AST parsing with ts-morph to extract React components, their props, hooks, and client/server directives.

### Routes
Scans Next.js `pages/api/*` and `app/**/route.ts` files, extracting HTTP methods and route parameters.

### Route Components
Builds a complete component tree for a specific route, following imports to map the full hierarchy with component metadata.
