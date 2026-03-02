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

  .minified-warn {
    cursor: help;
    font-size: 14px;
    margin-left: 4px;
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

  .ai-section {
    border-bottom: 1px solid #30363d;
    flex-shrink: 0;
  }

  .ai-header-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 6px 12px;
    background: none;
    border: none;
    color: #c9d1d9;
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
    text-align: left;
  }

  .ai-header-toggle:hover { background: #161b22; }

  .ai-header-icon { font-size: 13px; }
  .ai-header-label { flex: 1; font-weight: 500; }
  .ai-header-chevron { color: #484f58; font-size: 10px; }

  .ai-header-badge {
    background: #58a6ff;
    color: #0d1117;
    font-size: 10px;
    font-weight: 700;
    padding: 0 5px;
    border-radius: 8px;
    min-width: 16px;
    text-align: center;
    line-height: 16px;
  }

  .ai-body { padding: 8px 12px 10px; }

  .ai-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 6px;
  }

  .ai-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    background: #1c2333;
    border: 1px solid #30363d;
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 10px;
    color: #58a6ff;
    max-width: 100%;
  }

  .ai-chip-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ai-chip-remove {
    background: none;
    border: none;
    color: #484f58;
    cursor: pointer;
    font-size: 12px;
    padding: 0 2px;
    line-height: 1;
  }

  .ai-chip-remove:hover { color: #f85149; }

  .ai-textarea {
    width: 100%;
    min-height: 54px;
    max-height: 120px;
    resize: vertical;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #c9d1d9;
    font-family: inherit;
    font-size: 11px;
    padding: 8px 10px;
    line-height: 1.4;
  }

  .ai-textarea:focus { outline: none; border-color: #58a6ff; }
  .ai-textarea::placeholder { color: #484f58; }

  .ai-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 6px;
  }

  .ai-hint {
    color: #484f58;
    font-size: 10px;
  }

  .ai-send-btn {
    background: #238636;
    color: #fff;
    border: none;
    border-radius: 4px;
    padding: 4px 12px;
    font-family: inherit;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
  }

  .ai-send-btn:hover { background: #2ea043; }
  .ai-send-btn.sending { opacity: 0.6; pointer-events: none; }

  .ai-add-btn {
    cursor: pointer;
    opacity: 0.3;
    font-size: 10px;
    margin-left: 2px;
  }

  .ai-add-btn:hover { opacity: 1; }

  .file-btn, .usage-btn {
    cursor: pointer;
    opacity: 0.3;
    font-size: 10px;
    margin-left: 2px;
  }

  .file-btn:hover, .usage-btn:hover { opacity: 1; }

  .ai-result-body { padding: 8px 12px 10px; }

  .ai-result-prompt {
    width: 100%;
    min-height: 180px;
    max-height: 320px;
    resize: vertical;
    background: #0d1117;
    color: #c9d1d9;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 8px;
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 11px;
    line-height: 1.5;
    box-sizing: border-box;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .ai-result-prompt:focus { outline: none; border-color: #58a6ff; }

  .ai-result-actions {
    display: flex;
    gap: 6px;
    margin-top: 8px;
    flex-wrap: wrap;
  }

  .ai-copy-btn,
  .ai-cursor-btn,
  .ai-new-btn {
    padding: 4px 10px;
    border: 1px solid #30363d;
    border-radius: 6px;
    font-size: 11px;
    cursor: pointer;
    color: #c9d1d9;
    background: #21262d;
  }

  .ai-copy-btn:hover { background: #30363d; }

  .ai-cursor-btn {
    background: #1f6feb;
    border-color: #1f6feb;
    color: #fff;
  }
  .ai-cursor-btn:hover { background: #388bfd; }

  .ai-new-btn { color: #8b949e; }
  .ai-new-btn:hover { color: #c9d1d9; background: #30363d; }

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

  .toggle { color: #484f58; font-size: 11px; width: 11px; flex-shrink: 0; }
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
  .badge.condition-true { background: #f59e0b33; color: #fbbf24; border: 1px solid #f59e0b44; font-family: monospace; font-size: 9px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge.condition-true:hover { background: #f59e0b55; max-width: none; }
  .badge.condition-false { background: #f5910b33; color: #fb923c; border: 1px dashed #f59e0b44; font-family: monospace; font-size: 9px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge.condition-false:hover { background: #f5910b55; max-width: none; }
  .badge.condition-active { background: #22c55e; color: #0d1117; font-weight: 700; border: 1px solid #22c55e; }
  .badge.condition-active:hover { background: #4ade80; }
  .badge.condition-inactive { opacity: 0.4; }
  .badge.nextjs:hover { background: #8b5cf655; }
  .badge.instance-count { background: #ffa65722; color: #ffa657; border: 1px solid #ffa65744; cursor: pointer; text-transform: none; }
  .badge.instance-count:hover { background: #ffa65744; }

  .node.server-only > .node-header { border-left: 2px solid #7ee787; padding-left: 4px; }
  .node.bridge > .node-header { border-left: 2px solid #58a6ff; padding-left: 4px; }
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

  .instance-list {
    padding-left: 12px;
    border-left: 2px dashed #ffa657;
    margin: 4px 0 4px 6px;
  }

  .instance-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    cursor: pointer;
    border-radius: 3px;
    font-size: 11px;
    color: #8b949e;
    transition: background 0.1s;
  }

  .instance-row:hover { background: #21262d; color: #c9d1d9; }
  .instance-row.selected { background: #388bfd33; outline: 1px solid #58a6ff; color: #58a6ff; }
  .instance-row.capped { color: #6e7681; font-style: italic; cursor: default; }
  .instance-row.capped:hover { background: transparent; color: #6e7681; }

  .instance-label { font-family: inherit; }
  
  .children-slot {
    border-left: 2px dashed #484f58;
    margin: 2px 0 2px 8px;
    padding-left: 8px;
    position: relative;
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
    color: #c9d1d9;
    border: 1px solid #30363d;
    border-radius: 12px;
    width: 900px;
    height: 80vh;
    max-width: 90vw;
    max-height: 90vh;
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
    // flex-direction: column;
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

  .detail-content.tab-source {
    padding: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* Specific styles when inside tab-source to fill space */
  .detail-content.tab-source .source-container {
    height: 100%;
    border-radius: 0;
  }

  .detail-content.tab-source .source-header {
    border-radius: 0;
    border-left: none;
    border-right: none;
    border-top: none;
  }

  .detail-content.tab-source .source-code {
    border-radius: 0;
    border: none;
    max-height: none;
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

  .arch-section {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid #30363d;
  }

  .arch-section:last-child {
    border-bottom: none;
    margin-bottom: 0;
  }

  .arch-section-title {
    font-size: 12px;
    font-weight: 600;
    color: #8b949e;
    margin: 0 0 10px 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .arch-stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 0;
    font-size: 12px;
  }

  .arch-stat-label {
    color: #8b949e;
  }

  .arch-stat-value {
    color: #c9d1d9;
    font-weight: 500;
  }

  .arch-pages {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 8px;
  }

  .arch-page-badge {
    background: #21262d;
    border: 1px solid #30363d;
    color: #8b949e;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
  }

  .arch-similar-item {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 8px 10px;
    margin-bottom: 6px;
  }

  .arch-similar-name {
    color: #58a6ff;
    font-weight: 500;
    font-size: 13px;
  }

  .arch-similar-pct {
    float: right;
    color: #8b949e;
    font-size: 11px;
    background: #21262d;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .arch-similar-props {
    color: #8b949e;
    font-size: 11px;
    margin-top: 4px;
  }

  .arch-smell {
    background: #161b22;
    border-left: 3px solid #f0883e;
    padding: 10px 12px;
    margin-bottom: 8px;
    border-radius: 0 6px 6px 0;
  }

  .arch-smell.smell-error {
    border-left-color: #f85149;
    background: rgba(248, 81, 73, 0.1);
  }

  .arch-smell.smell-warning {
    border-left-color: #f0883e;
    background: rgba(240, 136, 62, 0.1);
  }

  .arch-smell.smell-info {
    border-left-color: #58a6ff;
    background: rgba(88, 166, 255, 0.1);
  }

  .arch-smell-type {
    font-size: 11px;
    font-weight: 600;
    color: #f0883e;
    margin-bottom: 4px;
  }

  .smell-error .arch-smell-type { color: #f85149; }
  .smell-info .arch-smell-type { color: #58a6ff; }

  .arch-smell-msg {
    color: #c9d1d9;
    font-size: 12px;
    line-height: 1.4;
    margin-bottom: 6px;
  }

  .arch-smell-suggestion {
    color: #7ee787;
    font-size: 11px;
    font-style: italic;
  }

  .arch-passthrough {
    margin-top: 8px;
  }

  .arch-passthrough-bar {
    height: 8px;
    background: #21262d;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 6px;
  }

  .arch-passthrough-fill {
    height: 100%;
    background: linear-gradient(90deg, #f0883e, #f85149);
    border-radius: 4px;
    transition: width 0.3s;
  }

  .arch-passthrough-label {
    font-size: 11px;
    color: #8b949e;
    text-align: center;
  }

  /* Prop Flow Styles */
  .selected-prop-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #30363d;
  }

  .selected-prop-header h3 {
    margin: 0;
    font-size: 14px;
    color: #c9d1d9;
    flex: 1;
  }

  .selected-prop-header code {
    color: #79c0ff;
    font-family: 'SF Mono', monospace;
    background: rgba(88, 166, 255, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
  }

  .back-to-props {
    font-size: 11px !important;
    padding: 4px 8px !important;
    border: 1px solid #30363d !important;
    border-radius: 4px !important;
    background: #21262d !important;
  }

  .back-to-props:hover {
    border-color: #8b949e !important;
    color: #c9d1d9 !important;
  }

  .props-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .prop-row.has-flow {
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.15s;
  }

  .prop-row.has-flow:hover {
    background: rgba(88, 166, 255, 0.1);
  }

  .prop-row.has-flow.selected {
    background: rgba(88, 166, 255, 0.15);
    border-left: 3px solid #58a6ff;
    padding-left: 5px;
    margin-left: -8px;
  }

  .flow-indicator {
    font-size: 10px;
    color: #58a6ff;
    margin-left: 6px;
    padding: 1px 5px;
    background: rgba(88, 166, 255, 0.15);
    border-radius: 10px;
    font-weight: 500;
  }

  .prop-flow-graph {
    background: #161b22;
    border-radius: 6px;
    padding: 12px;
    margin: 8px 0 4px 0;
    border: 1px solid #30363d;
  }

  .prop-flow-title {
    font-size: 12px;
    color: #8b949e;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #30363d;
  }

  .prop-flow-title strong {
    color: #58a6ff;
  }

  .prop-flow-node {
    position: relative;
  }

  .prop-flow-connector {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 6px 0;
    color: #484f58;
  }

  .prop-flow-arrow {
    font-size: 14px;
    color: #484f58;
  }

  .prop-flow-transform-badge {
    font-size: 9px;
    padding: 2px 6px;
    background: #3d1d00;
    color: #f0883e;
    border-radius: 10px;
    margin-bottom: 2px;
    font-weight: 600;
  }

  .prop-flow-component {
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .prop-flow-node.origin .prop-flow-component {
    border-color: #238636;
    background: linear-gradient(135deg, #21262d 0%, #0d1f0d 100%);
  }

  .prop-flow-node.transformed .prop-flow-component {
    border-color: #f0883e;
  }

  .prop-flow-comp-name {
    font-weight: 600;
    color: #7ee787;
    font-size: 12px;
  }

  .prop-flow-prop-name {
    font-family: 'SF Mono', monospace;
    font-size: 11px;
    color: #c9d1d9;
  }

  .prop-flow-original {
    color: #8b949e;
    text-decoration: line-through;
  }

  .prop-flow-renamed {
    color: #f0883e;
    font-weight: 500;
  }

  .prop-flow-source {
    font-size: 10px;
    color: #8b949e;
  }

  .prop-flow-file {
    font-size: 10px;
    color: #484f58;
    font-style: italic;
  }

  .prop-flow-summary {
    margin-top: 12px;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 11px;
  }

  .prop-flow-summary.warning {
    background: #3d1d00;
    color: #f0883e;
    border: 1px solid #f0883e40;
  }

  .prop-flow-empty {
    color: #8b949e;
    font-size: 11px;
    text-align: center;
    padding: 12px;
  }

  .prop-flow-origin {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: linear-gradient(135deg, #0d1f0d 0%, #21262d 100%);
    border: 1px solid #238636;
    border-radius: 6px;
    margin-bottom: 4px;
  }

  .prop-flow-origin-label {
    color: #8b949e;
    font-size: 11px;
  }

  .prop-flow-origin-value {
    color: #7ee787;
    font-weight: 600;
    font-family: 'SF Mono', monospace;
    font-size: 12px;
  }

  .prop-flow-origin-type {
    font-size: 9px;
    padding: 2px 6px;
    background: #238636;
    color: white;
    border-radius: 10px;
    margin-left: auto;
  }

  .prop-tree-node {
    font-size: 12px;
  }

  .prop-tree-header {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 8px;
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 4px;
    margin: 2px 0;
  }

  .prop-tree-comp {
    color: #7ee787;
    font-weight: 500;
  }

  .prop-tree-dot {
    color: #484f58;
  }

  .prop-tree-prop {
    color: #79c0ff;
    font-family: 'SF Mono', monospace;
  }

  .prop-tree-access {
    color: #8b949e;
    font-size: 10px;
    margin-left: 8px;
    font-family: 'SF Mono', monospace;
  }

  .prop-tree-rename {
    color: #f0883e;
    font-size: 10px;
    margin-left: 8px;
  }

  .prop-tree-children {
    border-left: 1px solid #30363d;
    margin-left: 12px;
    padding-left: 8px;
  }

  .prop-tree-branch {
    display: flex;
    align-items: flex-start;
    gap: 4px;
  }

  .prop-tree-line {
    color: #30363d;
    font-family: monospace;
    flex-shrink: 0;
    margin-top: 6px;
  }

  .prop-tree-header.clickable {
    cursor: pointer;
    transition: all 0.15s;
  }

  .prop-tree-header.clickable:hover {
    background: #30363d;
    border-color: #58a6ff;
  }

  .prop-tree-goto {
    margin-left: auto;
    color: #58a6ff;
    font-size: 11px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .prop-tree-header.clickable:hover .prop-tree-goto {
    opacity: 1;
  }

  .prop-upward-section {
    margin-bottom: 8px;
  }

  .prop-downward-section {
    margin-top: 8px;
  }

  .prop-section-label {
    font-size: 10px;
    font-weight: 600;
    color: #8b949e;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid #30363d;
  }

  .prop-upward-path {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 8px;
    background: linear-gradient(135deg, #0d1f0d 0%, #161b22 100%);
    border: 1px solid #238636;
    border-radius: 6px;
    margin-bottom: 4px;
  }

  .prop-upstream-node {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    background: #21262d;
    border-radius: 4px;
    font-size: 11px;
    width: 100%;
  }

  .prop-upstream-node.terminal {
    background: linear-gradient(135deg, #21262d 0%, #0d1f0d 100%);
    border: 1px solid #238636;
  }

  .prop-upstream-node.terminal.hook {
    border-color: #d2a8ff;
    background: linear-gradient(135deg, #21262d 0%, #1d0d2d 100%);
  }

  .prop-upstream-node.terminal.query {
    border-color: #7ee787;
    background: linear-gradient(135deg, #21262d 0%, #0d1f0d 100%);
  }

  .prop-upstream-node.terminal.context {
    border-color: #f778ba;
    background: linear-gradient(135deg, #21262d 0%, #2d0d1d 100%);
  }

  .prop-upstream-comp {
    color: #58a6ff;
    font-weight: 600;
  }

  .prop-upstream-via {
    color: #79c0ff;
    font-family: 'SF Mono', monospace;
    font-size: 10px;
  }

  .prop-upstream-source {
    color: #8b949e;
    font-family: 'SF Mono', monospace;
    font-size: 10px;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .prop-upstream-terminal-badge {
    font-size: 8px;
    padding: 2px 6px;
    border-radius: 10px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .prop-upstream-terminal-badge.hook {
    background: #d2a8ff;
    color: #0d1117;
  }

  .prop-upstream-terminal-badge.query {
    background: #7ee787;
    color: #0d1117;
  }

  .prop-upstream-terminal-badge.context {
    background: #f778ba;
    color: #0d1117;
  }

  .prop-upstream-terminal-badge.literal {
    background: #8b949e;
    color: #0d1117;
  }

  .prop-upstream-arrow {
    color: #484f58;
    font-size: 12px;
    padding-left: 20px;
  }

  .source-lines {
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 12px;
    line-height: 1.5;
  }

  .source-line {
    display: flex;
    min-height: 18px;
  }

  .source-line:hover {
    background: rgba(88, 166, 255, 0.1);
  }

  .source-line.highlighted {
    background: rgba(240, 136, 62, 0.3);
    animation: highlight-fade 2s ease-out;
  }

  @keyframes highlight-fade {
    0% { background: rgba(240, 136, 62, 0.5); }
    100% { background: transparent; }
  }

  .source-line-num {
    flex-shrink: 0;
    width: 40px;
    text-align: right;
    padding-right: 12px;
    color: #484f58;
    user-select: none;
    border-right: 1px solid #21262d;
    margin-right: 12px;
  }

  .source-line-code {
    white-space: pre;
    overflow-x: auto;
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
