import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Component {
  name: string;
  filePath: string;
}

interface Screen {
  screen: string;
  pagePath: string;
  components: Component[];
}

interface SharedComponent {
  name: string;
  filePath: string;
  usedByScreens: string[];
  usageCount: number;
}

interface Stats {
  totalScreens: number;
  totalUniqueComponents: number;
  totalSharedComponents: number;
}

interface ScreenDeps {
  screens: Screen[];
  sharedComponents: SharedComponent[];
  stats: Stats;
}

const FEATURE_WEIGHT = 3;
const SHARED_WEIGHT = 1;
const UNIQUE_WEIGHT = 2;

export function generateReport(inputPath: string) {
  const outputDir = dirname(inputPath);
  const outputPath = resolve(outputDir, "migration-report.html");

  const data: ScreenDeps = JSON.parse(readFileSync(inputPath, "utf-8"));

  function classifyComponent(
    comp: Component,
    sharedSet: Set<string>
  ): "shared" | "feature" | "unique" {
    if (sharedSet.has(comp.filePath)) return "shared";
    if (comp.filePath.includes("\\features\\") || comp.filePath.includes("/features/"))
      return "feature";
    return "unique";
  }

  function computeScreenComplexity(
    screen: Screen,
    sharedSet: Set<string>
  ): number {
    let score = 0;
    for (const comp of screen.components) {
      const kind = classifyComponent(comp, sharedSet);
      if (kind === "feature") score += FEATURE_WEIGHT;
      else if (kind === "shared") score += SHARED_WEIGHT;
      else score += UNIQUE_WEIGHT;
    }
    return score;
  }

  function heatColor(value: number, min: number, max: number): string {
    if (max === min) return "hsl(120, 60%, 70%)";
    const ratio = (value - min) / (max - min);
    const hue = 120 - ratio * 120;
    return `hsl(${Math.round(hue)}, 75%, 55%)`;
  }

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const sharedSet = new Set(data.sharedComponents.map((c) => c.filePath));

  const sharedSorted = [...data.sharedComponents].sort(
    (a, b) => b.usageCount - a.usageCount
  );
  const maxSharedUsage = sharedSorted[0]?.usageCount ?? 1;
  const minSharedUsage = sharedSorted[sharedSorted.length - 1]?.usageCount ?? 1;

  interface ScreenRow {
    screen: Screen;
    componentCount: number;
    featureCount: number;
    sharedCount: number;
    uniqueCount: number;
    complexity: number;
  }

  const screenRows: ScreenRow[] = data.screens.map((s) => {
    let featureCount = 0;
    let sharedCount = 0;
    let uniqueCount = 0;
    for (const c of s.components) {
      const kind = classifyComponent(c, sharedSet);
      if (kind === "feature") featureCount++;
      else if (kind === "shared") sharedCount++;
      else uniqueCount++;
    }
    return {
      screen: s,
      componentCount: s.components.length,
      featureCount,
      sharedCount,
      uniqueCount,
      complexity: computeScreenComplexity(s, sharedSet),
    };
  });

  screenRows.sort((a, b) => b.complexity - a.complexity);
  const maxComplexity = screenRows[0]?.complexity ?? 1;
  const minComplexity = screenRows[screenRows.length - 1]?.complexity ?? 0;

  function renderComponentRows(screen: Screen): string {
    return screen.components
      .map((c) => {
        const kind = classifyComponent(c, sharedSet);
        const badge =
          kind === "shared"
            ? '<span class="badge badge-shared">shared</span>'
            : kind === "feature"
              ? '<span class="badge badge-feature">feature</span>'
              : '<span class="badge badge-unique">unique</span>';
        return `<tr class="comp-row"><td>${escapeHtml(c.name)}</td><td class="filepath">${escapeHtml(c.filePath)}</td><td>${badge}</td></tr>`;
      })
      .join("\n");
  }

  function renderScreensTable(): string {
    return screenRows
      .map((row, idx) => {
        const color = heatColor(row.complexity, minComplexity, maxComplexity);
        const id = `screen-${idx}`;
        return `
        <tr class="screen-row" onclick="toggleExpand('${id}')">
          <td class="rank">${idx + 1}</td>
          <td class="screen-name">${escapeHtml(row.screen.screen)}</td>
          <td class="filepath">${escapeHtml(row.screen.pagePath)}</td>
          <td class="num">${row.componentCount}</td>
          <td class="num">${row.featureCount}</td>
          <td class="num">${row.sharedCount}</td>
          <td class="num">${row.uniqueCount}</td>
          <td class="num" style="background:${color};color:#fff;font-weight:700">${row.complexity}</td>
        </tr>
        <tr class="expand-row" id="${id}" style="display:none">
          <td colspan="8">
            <table class="inner-table">
              <thead><tr><th>Component</th><th>File</th><th>Type</th></tr></thead>
              <tbody>${renderComponentRows(row.screen)}</tbody>
            </table>
          </td>
        </tr>`;
      })
      .join("\n");
  }

  function renderSharedTable(): string {
    return sharedSorted
      .map((c, idx) => {
        const color = heatColor(c.usageCount, minSharedUsage, maxSharedUsage);
        const id = `shared-${idx}`;
        return `
        <tr class="screen-row" onclick="toggleExpand('${id}')">
          <td class="rank">${idx + 1}</td>
          <td>${escapeHtml(c.name)}</td>
          <td class="filepath">${escapeHtml(c.filePath)}</td>
          <td class="num" style="background:${color};color:#fff;font-weight:700">${c.usageCount}</td>
        </tr>
        <tr class="expand-row" id="${id}" style="display:none">
          <td colspan="4">
            <div class="used-by-list">${c.usedByScreens.map((s) => `<div class="used-by-item">${escapeHtml(s)}</div>`).join("")}</div>
          </td>
        </tr>`;
      })
      .join("\n");
  }

  const complexityBuckets = {
    low: screenRows.filter((r) => r.complexity <= 15).length,
    medium: screenRows.filter((r) => r.complexity > 15 && r.complexity <= 50).length,
    high: screenRows.filter((r) => r.complexity > 50 && r.complexity <= 100).length,
    critical: screenRows.filter((r) => r.complexity > 100).length,
  };

  const avgComplexity =
    screenRows.reduce((sum, r) => sum + r.complexity, 0) / screenRows.length;
  const avgComponents =
    screenRows.reduce((sum, r) => sum + r.componentCount, 0) / screenRows.length;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Migration Complexity Report</title>
<style>
  :root {
    --bg: #0f1117;
    --surface: #1a1d27;
    --surface2: #232733;
    --border: #2d3140;
    --text: #e4e6f0;
    --text-dim: #8b90a5;
    --accent: #6c8dfa;
    --green: #34d399;
    --yellow: #fbbf24;
    --orange: #fb923c;
    --red: #f87171;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
    padding: 2rem;
  }
  h1 { font-size: 1.75rem; font-weight: 700; margin-bottom: 0.5rem; }
  h2 { font-size: 1.25rem; font-weight: 600; margin: 2rem 0 1rem; color: var(--accent); }
  .subtitle { color: var(--text-dim); margin-bottom: 2rem; }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }
  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.25rem;
  }
  .stat-card .label { font-size: 0.8rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; }
  .stat-card .value { font-size: 1.75rem; font-weight: 700; margin-top: 0.25rem; }
  .stat-card .value.green { color: var(--green); }
  .stat-card .value.yellow { color: var(--yellow); }
  .stat-card .value.orange { color: var(--orange); }
  .stat-card .value.red { color: var(--red); }
  .stat-card .value.accent { color: var(--accent); }

  .complexity-bar {
    display: flex;
    height: 28px;
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 2rem;
    border: 1px solid var(--border);
  }
  .complexity-bar > div {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 600;
    color: #000;
    min-width: 30px;
  }

  .filter-bar {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }
  .filter-bar input {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
    color: var(--text);
    font-size: 0.85rem;
    width: 300px;
  }
  .filter-bar input:focus { outline: none; border-color: var(--accent); }
  .filter-bar label { font-size: 0.8rem; color: var(--text-dim); }
  .filter-bar select {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
    color: var(--text);
    font-size: 0.85rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    background: var(--surface);
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--border);
  }
  th {
    text-align: left;
    padding: 0.65rem 0.75rem;
    background: var(--surface2);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-dim);
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
    position: sticky;
    top: 0;
    z-index: 2;
  }
  th:hover { color: var(--accent); }
  th.sorted-asc::after { content: ' ▲'; color: var(--accent); }
  th.sorted-desc::after { content: ' ▼'; color: var(--accent); }
  td { padding: 0.5rem 0.75rem; border-top: 1px solid var(--border); font-size: 0.85rem; }
  .screen-row { cursor: pointer; transition: background 0.15s; }
  .screen-row:hover { background: var(--surface2); }
  .rank { color: var(--text-dim); width: 40px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .filepath { color: var(--text-dim); font-size: 0.78rem; font-family: 'JetBrains Mono', 'Fira Code', monospace; }

  .inner-table { background: var(--surface2); border: none; }
  .inner-table th { background: rgba(0,0,0,0.2); }
  .inner-table td { border-color: rgba(255,255,255,0.05); }

  .badge {
    display: inline-block;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
  }
  .badge-shared { background: rgba(108,141,250,0.2); color: var(--accent); }
  .badge-feature { background: rgba(251,191,36,0.2); color: var(--yellow); }
  .badge-unique { background: rgba(139,144,165,0.15); color: var(--text-dim); }

  .used-by-list { display: flex; flex-wrap: wrap; gap: 0.5rem; padding: 0.5rem 0; }
  .used-by-item {
    background: var(--surface2);
    padding: 0.25rem 0.65rem;
    border-radius: 6px;
    font-size: 0.78rem;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    color: var(--text-dim);
    border: 1px solid var(--border);
  }

  .screen-name { max-width: 350px; word-break: break-all; }

  .section-tabs {
    display: flex;
    gap: 0;
    margin-bottom: 0;
  }
  .section-tab {
    padding: 0.65rem 1.5rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-bottom: none;
    border-radius: 12px 12px 0 0;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-dim);
    transition: all 0.15s;
  }
  .section-tab.active { background: var(--surface2); color: var(--accent); border-color: var(--accent); }
  .section-tab:hover { color: var(--text); }
  .tab-content { display: none; }
  .tab-content.active { display: block; }

  .legend {
    display: flex;
    gap: 1.5rem;
    margin-bottom: 1rem;
    font-size: 0.8rem;
    color: var(--text-dim);
  }
  .legend-item { display: flex; align-items: center; gap: 0.35rem; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; }

  @media (max-width: 768px) {
    body { padding: 1rem; }
    .filter-bar input { width: 100%; }
  }
</style>
</head>
<body>

<h1>Migration Complexity Report</h1>
<p class="subtitle">Generated from screen-deps.json &mdash; ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>

<h2>Overall Stats</h2>
<div class="stats-grid">
  <div class="stat-card"><div class="label">Total Screens</div><div class="value accent">${data.stats.totalScreens}</div></div>
  <div class="stat-card"><div class="label">Unique Components</div><div class="value">${data.stats.totalUniqueComponents}</div></div>
  <div class="stat-card"><div class="label">Shared Components</div><div class="value">${data.stats.totalSharedComponents}</div></div>
  <div class="stat-card"><div class="label">Avg Components / Screen</div><div class="value">${avgComponents.toFixed(1)}</div></div>
  <div class="stat-card"><div class="label">Avg Complexity</div><div class="value yellow">${avgComplexity.toFixed(1)}</div></div>
  <div class="stat-card"><div class="label">Max Complexity</div><div class="value red">${maxComplexity}</div></div>
</div>

<h2>Complexity Distribution</h2>
<div class="legend">
  <div class="legend-item"><div class="legend-dot" style="background:var(--green)"></div> Low (&le;15): ${complexityBuckets.low}</div>
  <div class="legend-item"><div class="legend-dot" style="background:var(--yellow)"></div> Medium (16-50): ${complexityBuckets.medium}</div>
  <div class="legend-item"><div class="legend-dot" style="background:var(--orange)"></div> High (51-100): ${complexityBuckets.high}</div>
  <div class="legend-item"><div class="legend-dot" style="background:var(--red)"></div> Critical (&gt;100): ${complexityBuckets.critical}</div>
</div>
<div class="complexity-bar">
  <div style="flex:${complexityBuckets.low};background:var(--green)">${complexityBuckets.low}</div>
  <div style="flex:${complexityBuckets.medium};background:var(--yellow)">${complexityBuckets.medium}</div>
  <div style="flex:${complexityBuckets.high};background:var(--orange)">${complexityBuckets.high}</div>
  <div style="flex:${complexityBuckets.critical};background:var(--red)">${complexityBuckets.critical}</div>
</div>

<div class="section-tabs">
  <div class="section-tab active" onclick="switchTab('screens')">Screens (${data.stats.totalScreens})</div>
  <div class="section-tab" onclick="switchTab('shared')">Shared Components (${data.stats.totalSharedComponents})</div>
</div>

<div id="tab-screens" class="tab-content active">
  <div class="filter-bar">
    <input type="text" id="screen-filter" placeholder="Filter screens..." oninput="filterScreens()">
    <label>Complexity:</label>
    <select id="complexity-filter" onchange="filterScreens()">
      <option value="all">All</option>
      <option value="critical">Critical (&gt;100)</option>
      <option value="high">High (51-100)</option>
      <option value="medium">Medium (16-50)</option>
      <option value="low">Low (&le;15)</option>
    </select>
  </div>
  <div style="overflow-x: auto;">
    <table id="screens-table">
      <thead>
        <tr>
          <th>#</th>
          <th onclick="sortTable('screens-table', 1, 'text')">Screen</th>
          <th onclick="sortTable('screens-table', 2, 'text')">Page Path</th>
          <th onclick="sortTable('screens-table', 3, 'num')">Components</th>
          <th onclick="sortTable('screens-table', 4, 'num')">Feature</th>
          <th onclick="sortTable('screens-table', 5, 'num')">Shared</th>
          <th onclick="sortTable('screens-table', 6, 'num')">Unique</th>
          <th onclick="sortTable('screens-table', 7, 'num')">Complexity</th>
        </tr>
      </thead>
      <tbody>
        ${renderScreensTable()}
      </tbody>
    </table>
  </div>
</div>

<div id="tab-shared" class="tab-content">
  <div class="filter-bar">
    <input type="text" id="shared-filter" placeholder="Filter components..." oninput="filterShared()">
  </div>
  <div style="overflow-x: auto;">
    <table id="shared-table">
      <thead>
        <tr>
          <th>#</th>
          <th onclick="sortTable('shared-table', 1, 'text')">Component</th>
          <th onclick="sortTable('shared-table', 2, 'text')">File Path</th>
          <th onclick="sortTable('shared-table', 3, 'num')">Usage Count</th>
        </tr>
      </thead>
      <tbody>
        ${renderSharedTable()}
      </tbody>
    </table>
  </div>
</div>

<script>
function toggleExpand(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'table-row' : 'none';
}

function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.section-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelector('.section-tab[onclick*="' + tab + '"]').classList.add('active');
}

function filterScreens() {
  const text = document.getElementById('screen-filter').value.toLowerCase();
  const level = document.getElementById('complexity-filter').value;
  const rows = document.querySelectorAll('#screens-table tbody tr.screen-row');
  rows.forEach(row => {
    const screenText = row.children[1].textContent.toLowerCase() + ' ' + row.children[2].textContent.toLowerCase();
    const complexity = parseInt(row.children[7].textContent);
    let levelMatch = true;
    if (level === 'critical') levelMatch = complexity > 100;
    else if (level === 'high') levelMatch = complexity > 50 && complexity <= 100;
    else if (level === 'medium') levelMatch = complexity > 15 && complexity <= 50;
    else if (level === 'low') levelMatch = complexity <= 15;
    const visible = screenText.includes(text) && levelMatch;
    row.style.display = visible ? '' : 'none';
    const expandRow = row.nextElementSibling;
    if (expandRow && expandRow.classList.contains('expand-row')) {
      expandRow.style.display = 'none';
    }
  });
}

function filterShared() {
  const text = document.getElementById('shared-filter').value.toLowerCase();
  const rows = document.querySelectorAll('#shared-table tbody tr.screen-row');
  rows.forEach(row => {
    const content = row.children[1].textContent.toLowerCase() + ' ' + row.children[2].textContent.toLowerCase();
    const visible = content.includes(text);
    row.style.display = visible ? '' : 'none';
    const expandRow = row.nextElementSibling;
    if (expandRow && expandRow.classList.contains('expand-row')) {
      expandRow.style.display = 'none';
    }
  });
}

function sortTable(tableId, colIdx, type) {
  const table = document.getElementById(tableId);
  const th = table.querySelectorAll('thead th')[colIdx];
  const tbody = table.querySelector('tbody');
  const rowPairs = [];
  const allRows = Array.from(tbody.querySelectorAll('tr'));

  for (let i = 0; i < allRows.length; i++) {
    if (allRows[i].classList.contains('screen-row')) {
      rowPairs.push({ main: allRows[i], expand: allRows[i + 1]?.classList.contains('expand-row') ? allRows[i + 1] : null });
      if (allRows[i + 1]?.classList.contains('expand-row')) i++;
    }
  }

  const isDesc = th.classList.contains('sorted-desc') ? false : true;
  table.querySelectorAll('thead th').forEach(h => { h.classList.remove('sorted-asc', 'sorted-desc'); });
  th.classList.add(isDesc ? 'sorted-desc' : 'sorted-asc');

  rowPairs.sort((a, b) => {
    let valA = a.main.children[colIdx].textContent.trim();
    let valB = b.main.children[colIdx].textContent.trim();
    if (type === 'num') {
      valA = parseInt(valA) || 0;
      valB = parseInt(valB) || 0;
    } else {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }
    if (valA < valB) return isDesc ? 1 : -1;
    if (valA > valB) return isDesc ? -1 : 1;
    return 0;
  });

  rowPairs.forEach((pair, idx) => {
    pair.main.children[0].textContent = idx + 1;
    tbody.appendChild(pair.main);
    if (pair.expand) tbody.appendChild(pair.expand);
  });
}
</script>

</body>
</html>`;

  writeFileSync(outputPath, html, "utf-8");
  console.log(`Report generated: ${outputPath}`);
  console.log(`  Screens: ${data.stats.totalScreens}`);
  console.log(`  Shared Components: ${data.stats.totalSharedComponents}`);
  console.log(`  Unique Components: ${data.stats.totalUniqueComponents}`);
}

// Execute if running directly
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const args = process.argv.slice(2);
  const inputPath = args[0] ? resolve(process.cwd(), args[0]) : resolve(__dirname, "screen-deps.json");
  
  if (!args[0]) {
    console.log("No input file provided, using default:", inputPath);
    console.log("Usage: tsx src/dependencies/generate-report.ts <path-to-screen-deps.json>");
  }

  if (existsSync(inputPath)) {
      generateReport(inputPath);
  } else {
      console.error(`Input file not found: ${inputPath}`);
      process.exit(1);
  }
}
