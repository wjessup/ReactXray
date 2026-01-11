#!/usr/bin/env tsx
import fs from "fs/promises";
import path from "path";

interface ComponentInfo {
  name: string;
  filePath: string;
  props: { name: string; type: string; optional: boolean }[];
  hooks: string[];
  serverQueries: string[];
  isClientComponent: boolean;
  isServerComponent: boolean;
}

interface ComponentTreeNode {
  file: string;
  component: ComponentInfo | null;
  children: ComponentTreeNode[];
}

export interface RouteComponentAnalysis {
  route: string;
  entryFiles: {
    layouts: string[];
    page: string | null;
    loading: string | null;
    error: string | null;
    template: string | null;
    notFound: string | null;
  };
  componentTree: ComponentTreeNode[];
  stats: {
    totalComponents: number;
    clientComponents: number;
    serverComponents: number;
    uniqueHooks: string[];
  };
}

function renderTree(nodes: ComponentTreeNode[], depth = 0): string {
  return nodes
    .map((node) => {
      const hasChildren = node.children.length > 0;
      const comp = node.component;
      const fileName = node.file.split("/").pop() || node.file;
      const componentName = comp?.name || "—";
      const isClient = comp?.isClientComponent;
      const hooks = comp?.hooks?.length ? comp.hooks.join(", ") : "";
      const queries = comp?.serverQueries?.length
        ? comp.serverQueries.join(", ")
        : "";
      const props = comp?.props?.length
        ? comp.props
            .map((p) => `${p.name}${p.optional ? "?" : ""}: ${p.type}`)
            .join(", ")
        : "";

      const typeClass = isClient ? "client" : "server";
      const typeLabel = isClient ? "client" : "server";

      const childrenHtml = hasChildren
        ? `<div class="children">${renderTree(node.children, depth + 1)}</div>`
        : "";

      return `
        <div class="node ${typeClass}" data-depth="${depth}">
          <div class="node-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <span class="toggle">${hasChildren ? "▼" : "•"}</span>
            <span class="component-name">${componentName}</span>
            <span class="file-name">${fileName}</span>
            <span class="badge ${typeClass}">${typeLabel}</span>
            ${hooks ? `<span class="hooks">${hooks}</span>` : ""}
            ${queries ? `<span class="queries">⚡ ${queries}</span>` : ""}
          </div>
          ${props ? `<div class="props">Props: ${props}</div>` : ""}
          ${childrenHtml}
        </div>
      `;
    })
    .join("");
}

export function generateHtml(data: RouteComponentAnalysis): string {
  const treeHtml = renderTree(data.componentTree);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Route: ${data.route} - Component Tree</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace;
      background: #0d1117;
      color: #c9d1d9;
      padding: 24px;
      line-height: 1.5;
    }
    h1 { color: #58a6ff; font-size: 1.5rem; margin-bottom: 8px; }
    .route { color: #7ee787; font-size: 1.2rem; margin-bottom: 16px; }
    .stats {
      display: flex;
      gap: 24px;
      margin-bottom: 24px;
      padding: 16px;
      background: #161b22;
      border-radius: 8px;
      border: 1px solid #30363d;
    }
    .stat { display: flex; flex-direction: column; }
    .stat-value { font-size: 1.5rem; font-weight: bold; color: #58a6ff; }
    .stat-label { font-size: 0.75rem; color: #8b949e; text-transform: uppercase; }
    .entry-files {
      margin-bottom: 24px;
      padding: 16px;
      background: #161b22;
      border-radius: 8px;
      border: 1px solid #30363d;
    }
    .entry-files h3 { color: #58a6ff; margin-bottom: 8px; font-size: 0.9rem; }
    .entry-file { font-size: 0.8rem; color: #8b949e; margin: 4px 0; }
    .entry-file span { color: #7ee787; }
    .tree { margin-top: 16px; }
    .node {
      margin: 2px 0;
      border-left: 2px solid #30363d;
      margin-left: 8px;
    }
    .node[data-depth="0"] { border-left: none; margin-left: 0; }
    .node-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      cursor: pointer;
      border-radius: 4px;
      transition: background 0.15s;
    }
    .node-header:hover { background: #21262d; }
    .toggle { color: #484f58; font-size: 0.7rem; width: 12px; }
    .collapsed > .children { display: none; }
    .collapsed .toggle { transform: rotate(-90deg); }
    .component-name { color: #d2a8ff; font-weight: 600; }
    .file-name { color: #8b949e; font-size: 0.8rem; }
    .badge {
      font-size: 0.65rem;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      font-weight: 600;
    }
    .badge.client { background: #388bfd33; color: #58a6ff; }
    .badge.server { background: #238636; color: #7ee787; }
    .hooks { color: #ffa657; font-size: 0.75rem; }
    .queries { color: #79c0ff; font-size: 0.75rem; }
    .props {
      font-size: 0.75rem;
      color: #8b949e;
      padding: 4px 12px 8px 32px;
    }
    .children { padding-left: 16px; }
    .controls {
      margin-bottom: 16px;
      display: flex;
      gap: 8px;
    }
    button {
      background: #21262d;
      border: 1px solid #30363d;
      color: #c9d1d9;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-family: inherit;
      font-size: 0.85rem;
    }
    button:hover { background: #30363d; }
  </style>
</head>
<body>
  <h1>Component Tree Visualization</h1>
  <div class="route">Route: ${data.route}</div>
  
  <div class="stats">
    <div class="stat">
      <span class="stat-value">${data.stats.totalComponents}</span>
      <span class="stat-label">Total Components</span>
    </div>
    <div class="stat">
      <span class="stat-value">${data.stats.clientComponents}</span>
      <span class="stat-label">Client Components</span>
    </div>
    <div class="stat">
      <span class="stat-value">${data.stats.serverComponents}</span>
      <span class="stat-label">Server Components</span>
    </div>
    <div class="stat">
      <span class="stat-value">${data.stats.uniqueHooks.length}</span>
      <span class="stat-label">Unique Hooks</span>
    </div>
  </div>

  <div class="entry-files">
    <h3>Entry Files</h3>
    ${data.entryFiles.layouts
      .map(
        (l) =>
          `<div class="entry-file">Layout: <span>${l
            .split("/src/")
            .pop()}</span></div>`
      )
      .join("")}
    ${
      data.entryFiles.page
        ? `<div class="entry-file">Page: <span>${data.entryFiles.page
            .split("/src/")
            .pop()}</span></div>`
        : ""
    }
    ${
      data.entryFiles.loading
        ? `<div class="entry-file">Loading: <span>${data.entryFiles.loading
            .split("/src/")
            .pop()}</span></div>`
        : ""
    }
    ${
      data.entryFiles.error
        ? `<div class="entry-file">Error: <span>${data.entryFiles.error
            .split("/src/")
            .pop()}</span></div>`
        : ""
    }
  </div>

  <div class="controls">
    <button onclick="expandAll()">Expand All</button>
    <button onclick="collapseAll()">Collapse All</button>
  </div>

  <div class="tree">
    ${treeHtml}
  </div>

  <script>
    function expandAll() {
      document.querySelectorAll('.node').forEach(n => n.classList.remove('collapsed'));
    }
    function collapseAll() {
      document.querySelectorAll('.node').forEach(n => {
        if (n.querySelector('.children')) n.classList.add('collapsed');
      });
    }
    collapseAll();
    document.querySelectorAll('.node[data-depth="0"]').forEach(n => n.classList.remove('collapsed'));
  </script>
</body>
</html>`;
}

async function main() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error("Usage: tsx src/visualize.ts <route-analysis.json>");
    process.exit(1);
  }

  const content = await fs.readFile(inputFile, "utf-8");
  const data: RouteComponentAnalysis = JSON.parse(content);
  const html = generateHtml(data);

  const outputFile = inputFile.replace(".json", ".html");
  await fs.writeFile(outputFile, html);
  console.log(`Generated: ${outputFile}`);
}

const isDirectRun = process.argv[1]?.includes("visualize");
if (isDirectRun) {
  main();
}
