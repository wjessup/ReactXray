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
    cursor: help;
    transition: transform 0.1s, box-shadow 0.1s;
  }

  .badge:hover {
    transform: scale(1.1);
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }

  .badge.client { background: #388bfd33; color: #58a6ff; border: 1px solid #388bfd44; text-transform: none; }
  .badge.client:hover { background: #388bfd55; }
  .badge.client.bridge { background: #58a6ff; color: #0d1117; font-weight: 700; border: 1px solid #58a6ff; text-transform: none; }
  .badge.client.bridge:hover { background: #79c0ff; }
  .badge.client.inherited { background: #388bfd22; color: #58a6ff; font-style: italic; text-transform: none; border: 1px dashed #388bfd66; }
  .badge.client.inherited:hover { background: #388bfd44; border-style: solid; }
  .badge.server { background: #23863633; color: #7ee787; border: 1px solid #23863644; }
  .badge.server:hover { background: #23863655; }
  .badge.server.rsc { background: #238636; color: #0d1117; font-weight: 700; border: 1px solid #238636; text-transform: none; }
  .badge.server.rsc:hover { background: #2ea043; }
  .badge.nextjs { background: #8b5cf633; color: #d2a8ff; border: 1px solid #8b5cf644; }
  .badge.nextjs:hover { background: #8b5cf655; }

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

  .props-count {
    color: #d2a8ff;
    font-size: 9px;
    cursor: help;
  }

  .data-flow {
    color: #7ee787;
    font-size: 9px;
    cursor: help;
  }

  .info-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 4px;
    background: #21262d;
    border: 1px solid #30363d;
    color: #8b949e;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s;
    margin-left: 2px;
  }

  .info-btn:hover {
    background: #388bfd;
    border-color: #58a6ff;
    color: #fff;
    transform: scale(1.1);
  }
  
  .node-header.selected .info-btn {
    background: #388bfd44;
    border-color: #58a6ff;
    color: #58a6ff;
  }

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

  .settings-overlay {
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

  .settings-dialog {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 12px;
    width: 420px;
    max-width: 90vw;
    display: flex;
    flex-direction: column;
    box-shadow: 0 16px 48px rgba(0,0,0,0.5);
  }

  .settings-header {
    padding: 16px 20px;
    border-bottom: 1px solid #30363d;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .settings-header h3 { color: #c9d1d9; margin: 0; font-size: 15px; font-weight: 600; }

  .settings-close {
    background: none;
    border: none;
    color: #8b949e;
    font-size: 20px;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }
  .settings-close:hover { color: #c9d1d9; }

  .settings-content {
    padding: 16px 20px;
  }

  .settings-section label {
    display: block;
    color: #c9d1d9;
    font-size: 13px;
    font-weight: 500;
    margin-bottom: 6px;
  }

  .settings-hint {
    color: #8b949e;
    font-size: 11px;
    margin: 0 0 10px 0;
    line-height: 1.4;
  }

  .ignored-paths-input {
    width: 100%;
    min-height: 100px;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #c9d1d9;
    font-family: ui-monospace, monospace;
    font-size: 12px;
    padding: 10px;
    resize: vertical;
    box-sizing: border-box;
  }
  .ignored-paths-input:focus {
    outline: none;
    border-color: #58a6ff;
  }
  .ignored-paths-input::placeholder {
    color: #484f58;
  }

  .settings-examples {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    flex-wrap: wrap;
  }

  .settings-example-label {
    color: #8b949e;
    font-size: 11px;
  }

  .settings-preset {
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #8b949e;
    font-size: 11px;
    padding: 4px 8px;
    cursor: pointer;
  }
  .settings-preset:hover {
    background: #30363d;
    color: #c9d1d9;
  }

  .settings-footer {
    padding: 12px 20px;
    border-top: 1px solid #30363d;
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }

  .settings-clear {
    background: none;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #8b949e;
    font-size: 12px;
    padding: 8px 16px;
    cursor: pointer;
  }
  .settings-clear:hover {
    border-color: #f85149;
    color: #f85149;
  }

  .settings-save {
    background: #238636;
    border: none;
    border-radius: 6px;
    color: #fff;
    font-size: 12px;
    font-weight: 500;
    padding: 8px 20px;
    cursor: pointer;
  }
  .settings-save:hover {
    background: #2ea043;
  }

  .settings-btn {
    background: none;
    border: none;
    color: #8b949e;
    font-size: 14px;
    cursor: pointer;
    padding: 0 4px;
  }
  .settings-btn:hover { color: #c9d1d9; }

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
    gap: 12px;
  }

  .dataflow-origins {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .df-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    background: #161b22;
    border-radius: 6px;
    gap: 12px;
  }

  .df-row.traced {
    background: #161b22;
    border-left: 3px solid #388bfd;
    border-radius: 0 6px 6px 0;
  }

  .df-prop {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }

  .df-name {
    color: #c9d1d9;
    font-weight: 600;
    font-family: 'SF Mono', monospace;
    font-size: 12px;
  }

  .df-name.fn {
    color: #d2a8ff;
  }

  .df-opt {
    color: #6e7681;
    font-size: 11px;
  }

  .df-type {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'SF Mono', monospace;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: help;
  }

  .df-type.function { background: #8957e522; color: #d2a8ff; }
  .df-type.boolean { background: #f0883e22; color: #f0883e; }
  .df-type.number { background: #58a6ff22; color: #58a6ff; }
  .df-type.string { background: #7ee78722; color: #7ee787; }
  .df-type.object { background: #f778ba22; color: #f778ba; }
  .df-type.array { background: #ffa65722; color: #ffa657; }
  .df-type.type { background: #21262d; color: #8b949e; }
  .df-type.unknown { background: #21262d; color: #6e7681; }

  .df-source {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    background: #21262d;
    border-radius: 4px;
    border-left: 2px solid var(--src-color, #484f58);
    flex-shrink: 0;
  }

  .df-src-icon {
    font-size: 11px;
  }

  .df-src-label {
    color: #c9d1d9;
    font-family: 'SF Mono', monospace;
    font-size: 10px;
  }

  .df-chain {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px 8px 16px;
    background: #0d1117;
    flex-wrap: wrap;
    font-size: 10px;
    margin-top: -2px;
    border-radius: 0 0 6px 6px;
    border-left: 3px solid #388bfd;
  }

  .df-chain-item {
    display: inline-flex;
    align-items: center;
    padding: 3px 6px;
    background: #161b22;
    border-radius: 4px;
  }

  .df-chain-item.target {
    background: #388bfd22;
    border: 1px solid #388bfd44;
  }

  .df-chain-comp {
    color: #58a6ff;
    font-weight: 500;
  }

  .df-chain-via {
    color: #8b949e;
    font-family: 'SF Mono', monospace;
  }

  .df-chain-via.query { color: #7ee787; }
  .df-chain-via.hook { color: #d2a8ff; }
  .df-chain-via.prop { color: #ffa657; }

  .df-chain-arrow {
    color: #484f58;
    font-size: 11px;
  }

  .df-summary {
    display: flex;
    gap: 12px;
    padding: 10px 12px;
    background: #161b22;
    border-radius: 6px;
    flex-wrap: wrap;
  }

  .df-stat {
    font-size: 11px;
    color: #8b949e;
  }

  .df-stat.traced { color: #58a6ff; }
  .df-stat.fn { color: #d2a8ff; }

  .dataflow-actions {
    display: flex;
    gap: 8px;
  }

  .copy-llm-btn, .copy-mermaid-btn {
    flex: 1;
    background: #21262d;
    border: 1px solid #30363d;
    color: #c9d1d9;
    padding: 8px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 11px;
    font-family: inherit;
    transition: all 0.15s;
  }

  .copy-llm-btn:hover, .copy-mermaid-btn:hover {
    background: #30363d;
    border-color: #58a6ff;
  }

  .copy-llm-btn:active, .copy-mermaid-btn:active {
    background: #238636;
    border-color: #238636;
  }

  .source-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 300px;
  }

  .source-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: #161b22;
    border-bottom: 1px solid #30363d;
    border-radius: 6px 6px 0 0;
  }

  .source-path {
    flex: 1;
    font-size: 11px;
    color: #7ee787;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .source-copy-btn, .source-open-btn {
    background: #21262d;
    border: 1px solid #30363d;
    color: #8b949e;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 10px;
    font-family: inherit;
  }

  .source-copy-btn:hover, .source-open-btn:hover {
    background: #30363d;
    color: #c9d1d9;
  }

  .source-code {
    flex: 1;
    overflow: auto;
    border: 1px solid #30363d;
    border-top: none;
    border-radius: 0 0 6px 6px;
    max-height: 450px;
  }

  .source-code pre {
    margin: 0 !important;
    padding: 16px !important;
    overflow-x: auto;
    background: #282c34 !important;
    border-radius: 0 !important;
  }

  .source-code code {
    font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', Menlo, monospace !important;
    font-size: 13px !important;
    line-height: 1.7 !important;
    background: transparent !important;
    white-space: pre !important;
    display: block !important;
  }

  .source-code code.hljs {
    padding: 0 !important;
    background: transparent !important;
  }

  .source-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px;
    color: #8b949e;
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
