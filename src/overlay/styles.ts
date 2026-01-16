export const OVERLAY_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  .panel {
    position: fixed;
    top: 0;
    right: 0;
    width: var(--panel-width, 380px);
    font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', Menlo, monospace;
    font-size: 12px;
    height: 100vh;
    background: #0d1117;
    color: #c9d1d9;
    z-index: 2147483647;
    transform: translateX(100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    flex-direction: column;
    border-left: 1px solid #30363d;
  }

  .panel.open { transform: translateX(0); }

  .toggle-btn {
    position: fixed;
    top: 50%;
    right: 0;
    transform: translateY(-50%);
    width: 28px;
    height: 56px;
    background: #238636;
    color: white;
    border: none;
    border-radius: 6px 0 0 6px;
    cursor: pointer;
    z-index: 2147483647;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', Menlo, monospace;
  }

  .toggle-btn:hover { background: #2ea043; width: 32px; }
  .toggle-btn.open { right: var(--panel-width, 380px); }

  .resize-handle {
    position: absolute;
    left: 0;
    top: 0;
    width: 6px;
    height: 100%;
    cursor: ew-resize;
    background: transparent;
    z-index: 2147483647;
  }

  .resize-handle:hover, .resize-handle.dragging { background: #58a6ff; }

  .header {
    padding: 12px 16px;
    background: #161b22;
    border-bottom: 1px solid #30363d;
    flex-shrink: 0;
  }

  .header h2 {
    color: #58a6ff;
    font-size: 13px;
    margin: 0 0 4px 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .header .route { color: #7ee787; font-size: 11px; }

  .header-row { display: flex; align-items: center; gap: 8px; }

  .stats { display: flex; gap: 12px; margin-top: 8px; }
  .stat { display: flex; gap: 4px; font-size: 11px; }
  .stat-value { color: #58a6ff; font-weight: bold; }
  .stat-label { color: #8b949e; }

  .search {
    padding: 8px 12px;
    background: #161b22;
    border-bottom: 1px solid #30363d;
    flex-shrink: 0;
  }

  .search input {
    width: 100%;
    background: #0d1117;
    border: 1px solid #30363d;
    color: #c9d1d9;
    padding: 6px 10px;
    border-radius: 4px;
    font-family: inherit;
    font-size: 11px;
  }

  .search input:focus { outline: none; border-color: #58a6ff; }

  .tree-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
  }

  .sticky-parents {
    position: sticky;
    top: 0;
    z-index: 10;
    background: #161b22;
    border-bottom: 1px solid #30363d;
    padding: 6px 12px;
    display: none;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    font-size: 11px;
  }

  .sticky-parents.visible { display: flex; }

  .sticky-crumb {
    color: #8b949e;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .sticky-crumb:hover { background: #21262d; color: #c9d1d9; }

  .sticky-crumb .crumb-name { color: #d2a8ff; }

  .sticky-sep { color: #484f58; font-size: 9px; }

  .tree {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .tree::-webkit-scrollbar { width: 6px; }
  .tree::-webkit-scrollbar-track { background: #161b22; }
  .tree::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }

  .node {
    margin: 1px 0;
    border-left: 2px solid #30363d;
    margin-left: 6px;
  }

  .node[data-depth="0"] { border-left: none; margin-left: 0; }

  .node-header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 6px;
    cursor: pointer;
    border-radius: 3px;
    transition: background 0.1s;
  }

  .node-header:hover { background: #21262d; }
  .node-header.selected { background: #388bfd44; outline: 2px solid #58a6ff; }

  .toggle { color: #484f58; font-size: 9px; width: 9px; flex-shrink: 0; }
  .collapsed > .children { display: none; }
  .collapsed .toggle { transform: rotate(-90deg); }

  .name { color: #58a6ff; font-weight: 600; font-size: 11px; }

  .file {
    color: #8b949e;
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 120px;
  }

  .file.has-source {
    color: #7ee787;
    cursor: pointer;
  }

  .file.has-source:hover {
    text-decoration: underline;
  }

  .badge {
    font-size: 8px;
    padding: 1px 3px;
    border-radius: 2px;
    text-transform: uppercase;
    font-weight: 600;
    flex-shrink: 0;
  }

  .badge.client { background: #388bfd33; color: #58a6ff; }
  .badge.client.bridge { background: #58a6ff; color: #0d1117; font-weight: 700; }
  .badge.server { background: #23863633; color: #7ee787; }
  .badge.server.rsc { background: #238636; color: #0d1117; font-weight: 700; }
  .badge.nextjs { background: #8b5cf633; color: #d2a8ff; }

  .node.server-only > .node-header { border-left: 2px solid #7ee787; padding-left: 4px; margin-left: -6px; }
  .node.bridge > .node-header { border-left: 2px solid #58a6ff; padding-left: 4px; margin-left: -6px; }
  .render-count.server-only { background: #23863622; color: #7ee787; font-style: italic; }

  .hooks {
    color: #ffa657;
    font-size: 9px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .data-flow {
    color: #7ee787;
    font-size: 9px;
    cursor: help;
  }

  .info-btn {
    color: #6e7681;
    font-size: 11px;
    cursor: pointer;
    padding: 0 2px;
    flex-shrink: 0;
  }

  .info-btn:hover { color: #58a6ff; }

  .render-count {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 8px;
    background: #f8514922;
    color: #f85149;
    font-weight: 600;
    min-width: 16px;
    text-align: center;
    flex-shrink: 0;
  }

  .render-count.hot {
    background: #f8514944;
    animation: pulse 0.3s ease-out;
  }

  @keyframes pulse {
    0% { transform: scale(1.3); background: #f85149; color: white; }
    100% { transform: scale(1); }
  }

  .children { padding-left: 10px; }
  
  .children-slot {
    border-left: 2px dashed #484f58;
    margin: 2px 0 2px 8px;
    padding-left: 8px;
    position: relative;
  }
  
  .children-slot::before {
    content: '{children}';
    position: absolute;
    top: 0;
    left: 8px;
    color: #484f58;
    font-size: 9px;
    font-style: italic;
  }

  .detail-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.6);
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(2px);
  }

  .detail-dialog {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 12px;
    width: 560px;
    max-width: 90vw;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 16px 48px rgba(0,0,0,0.5);
  }

  .detail-header {
    padding: 16px 20px;
    border-bottom: 1px solid #30363d;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .detail-header h3 { color: #d2a8ff; margin: 0; font-size: 16px; font-weight: 600; }
  .detail-header .file { color: #7ee787; font-size: 11px; margin-top: 4px; word-break: break-all; max-width: none; }
  .detail-header .badges { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
  .detail-header .badge { font-size: 10px; padding: 3px 8px; text-transform: none; }

  .detail-close {
    background: none;
    border: none;
    color: #8b949e;
    font-size: 20px;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .detail-close:hover { color: #c9d1d9; }

  .detail-tabs {
    display: flex;
    border-bottom: 1px solid #30363d;
    padding: 0 20px;
    gap: 4px;
  }

  .detail-tab {
    background: none;
    border: none;
    color: #8b949e;
    padding: 10px 12px;
    cursor: pointer;
    font-size: 12px;
    font-family: inherit;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
  }

  .detail-tab:hover { color: #c9d1d9; }
  .detail-tab.active { color: #58a6ff; border-bottom-color: #58a6ff; }

  .detail-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    min-height: 0;
  }

  .detail-content::-webkit-scrollbar { width: 6px; }
  .detail-content::-webkit-scrollbar-track { background: #161b22; }
  .detail-content::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }

  .detail-section { margin-bottom: 16px; }
  .detail-section:last-child { margin-bottom: 0; }
  .detail-section h4 {
    color: #8b949e;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 8px 0;
  }

  .detail-row {
    display: flex;
    padding: 6px 0;
    border-bottom: 1px solid #21262d;
    font-size: 12px;
  }

  .detail-row:last-child { border-bottom: none; }
  .detail-key { color: #79c0ff; min-width: 140px; flex-shrink: 0; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .detail-type { color: #7ee787; font-family: inherit; font-size: 10px; opacity: 0.8; }
  .detail-value { color: #ffa657; flex: 1; font-family: inherit; font-size: 11px; word-break: break-all; }
  .detail-undefined { color: #484f58; font-style: italic; }
  .detail-optional { color: #8b949e; margin-right: 4px; }
  .detail-empty { color: #484f58; font-style: italic; font-size: 12px; }

  .net-row { display: flex; gap: 8px; padding: 8px 0; border-bottom: 1px solid #21262d; font-size: 11px; }
  .net-row:last-child { border-bottom: none; }
  .net-method { color: #d2a8ff; font-weight: 600; min-width: 40px; }
  .net-url { color: #79c0ff; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .net-status { min-width: 30px; }
  .net-status.ok { color: #7ee787; }
  .net-status.err { color: #f85149; }
  .net-time { color: #8b949e; min-width: 50px; text-align: right; }

  .hooks-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .hook-tag { background: #21262d; color: #ffa657; padding: 4px 8px; border-radius: 4px; font-size: 11px; }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px;
    color: #8b949e;
  }

  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #30363d;
    border-top-color: #58a6ff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .loading-text { margin-top: 12px; font-size: 12px; }

  .header-buttons {
    display: flex;
    gap: 6px;
    margin-left: auto;
  }

  .pause-btn, .refresh-btn, .mode-btn, .filter-btn {
    background: #21262d;
    border: 1px solid #30363d;
    color: #c9d1d9;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    font-family: inherit;
  }

  .pause-btn:hover, .refresh-btn:hover, .mode-btn:hover, .filter-btn:hover { background: #30363d; }
  .pause-btn.paused { background: #f0883e; color: #0d1117; border-color: #f0883e; }
  .mode-btn.fiber { background: #238636; border-color: #238636; }
  .mode-btn.static { background: #1f6feb; border-color: #1f6feb; }
  .filter-btn.on { background: #8b5cf6; border-color: #8b5cf6; }
  .filter-btn.off { background: #6e7681; border-color: #6e7681; }
  .refresh-btn { font-size: 14px; padding: 2px 8px; }

  .hidden { display: none !important; }

  .dataflow-graph {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .dataflow-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding: 10px 12px;
    background: #161b22;
    border-radius: 8px;
    font-size: 10px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 5px;
    color: #8b949e;
  }

  .legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dataflow-origins {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .dataflow-origins h4 {
    color: #8b949e;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 8px 0;
  }

  .origin-block {
    background: #161b22;
    border-radius: 6px;
    border-left: 3px solid #30363d;
  }

  .origin-block.has-chain {
    border-left-color: #388bfd;
  }

  .origin-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    font-size: 12px;
  }

  .origin-prop {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 140px;
  }

  .origin-icon {
    font-size: 12px;
    flex-shrink: 0;
  }

  .origin-name {
    color: #ffa657;
    font-weight: 600;
    font-family: 'SF Mono', monospace;
    font-size: 12px;
  }

  .origin-type {
    color: #7ee787;
    font-size: 9px;
    padding: 2px 5px;
    background: #23863622;
    border-radius: 3px;
    font-family: 'SF Mono', monospace;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .origin-optional {
    color: #8b949e;
    font-size: 11px;
  }

  .origin-arrow {
    color: #484f58;
    font-size: 16px;
    flex-shrink: 0;
  }

  .origin-source {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: #21262d;
    border-radius: 6px;
    border-left: 3px solid;
    flex: 1;
    min-width: 0;
  }

  .origin-label {
    color: #c9d1d9;
    font-family: 'SF Mono', monospace;
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .origin-label.query { color: #7ee787; }
  .origin-label.hook { color: #d2a8ff; }
  .origin-label.prop { color: #ffa657; }
  .origin-label.context { color: #f778ba; }
  .origin-label.computed { color: #f0883e; }
  .origin-label.literal { color: #8b949e; }
  .origin-label.unknown { color: #484f58; }

  .origin-chain {
    padding: 10px 12px;
    background: #0d1117;
    border-top: 1px solid #21262d;
  }

  .chain-title {
    color: #6e7681;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
  }

  .chain-flow {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .chain-step {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .chain-link {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    background: #21262d;
    border-radius: 6px;
    border-left: 3px solid;
    font-size: 11px;
  }

  .chain-icon {
    font-size: 11px;
  }

  .chain-comp {
    color: #58a6ff;
    font-weight: 600;
  }

  .chain-detail {
    color: #8b949e;
    font-family: 'SF Mono', monospace;
    font-size: 10px;
  }

  .chain-detail.query { color: #7ee787; }
  .chain-detail.hook { color: #d2a8ff; }
  .chain-detail.prop { color: #ffa657; }

  .chain-arrow {
    color: #484f58;
    font-size: 14px;
  }

  .dataflow-summary {
    display: flex;
    gap: 16px;
    padding: 12px 14px;
    background: #161b22;
    border-radius: 8px;
    flex-wrap: wrap;
  }

  .summary-stat {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #8b949e;
  }

  .summary-stat .stat-icon {
    font-size: 13px;
  }

  .summary-stat .stat-num {
    color: #58a6ff;
    font-weight: 600;
    min-width: 16px;
  }

  .dataflow-actions {
    display: flex;
    gap: 10px;
    padding-top: 12px;
    border-top: 1px solid #21262d;
    margin-top: 4px;
  }

  .copy-llm-btn, .copy-mermaid-btn {
    flex: 1;
    background: #21262d;
    border: 1px solid #30363d;
    color: #c9d1d9;
    padding: 10px 14px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 12px;
    font-family: inherit;
    transition: all 0.15s;
    font-weight: 500;
  }

  .copy-llm-btn:hover, .copy-mermaid-btn:hover {
    background: #30363d;
    border-color: #58a6ff;
  }

  .copy-llm-btn:active, .copy-mermaid-btn:active {
    background: #238636;
    border-color: #238636;
  }
`;

export const HIGHLIGHT_CSS = `
  .overlay-highlight {
    position: fixed;
    pointer-events: none;
    z-index: 2147483645;
    border: 2px dashed #f0883e;
    background: rgba(240, 136, 62, 0.1);
    transition: all 0.1s;
  }

  .overlay-highlight.selected {
    border: 3px solid #58a6ff;
    background: rgba(88, 166, 255, 0.15);
    box-shadow: 0 0 20px rgba(88, 166, 255, 0.3);
    position: absolute;
  }

  .overlay-highlight .label {
    position: absolute;
    top: -22px;
    left: 0;
    background: #f0883e;
    color: white;
    padding: 2px 6px;
    font-size: 10px;
    font-weight: 600;
    border-radius: 3px;
    white-space: nowrap;
    font-family: 'SF Mono', monospace;
  }

  .overlay-highlight.selected .label { background: #58a6ff; }
`;
