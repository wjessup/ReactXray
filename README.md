# Repo Analyzer

CLI tool that analyzes JavaScript/TypeScript codebases and generates JSON artifacts for AI consumption.

## Install

```bash
pnpm install
```

## Usage

```bash
pnpm analyze <path-to-project>
```

### Examples

```bash
pnpm analyze ~/Code/my-nextjs-app
pnpm analyze ~/Code/my-nextjs-app -- --only deps,components
pnpm analyze ~/Code/my-nextjs-app -- --out ./custom-output
```

### Options

| Flag | Description |
|------|-------------|
| `--out <dir>` | Output directory (default: `./repo-analysis-output`) |
| `--only <list>` | Run specific analyzers: `deps`, `tree`, `components`, `routes` |

## Output

JSON files written to the output directory:

| File | Contents |
|------|----------|
| `dependencies.json` | Import graph, circular dependencies, orphan files |
| `file-tree.json` | Directory structure with file sizes and extensions |
| `components.json` | React components with props, hooks, client/server directives |
| `routes.json` | Next.js API routes (pages/api and app router) |

## Analyzers

### Dependencies
Uses [Madge](https://github.com/pahen/madge) to map imports/exports and detect circular dependencies.

### File Tree
Recursive directory walk with metadata (size, extension). Ignores `node_modules`, `.git`, `.next`, `dist`, `build`.

### Components
AST parsing with ts-morph to extract React components, their props, and hook usage.

### Routes
Scans Next.js `pages/api/*` and `app/**/route.ts` files, extracting HTTP methods and route parameters.
