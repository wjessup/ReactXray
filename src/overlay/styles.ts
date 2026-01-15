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

  .name { color: #d2a8ff; font-weight: 600; font-size: 11px; }

  .file {
    color: #8b949e;
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100px;
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
  .badge.server { background: #238636; color: #7ee787; }
  .badge.nextjs { background: #8b5cf6; color: #fff; }

  .hooks {
    color: #ffa657;
    font-size: 9px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    width: 500px;
    max-width: 90vw;
    max-height: 80vh;
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
  .detail-header .badges { display: flex; gap: 6px; margin-top: 8px; }

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
  }

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
  .detail-key { color: #79c0ff; min-width: 120px; flex-shrink: 0; }
  .detail-type { color: #7ee787; flex: 1; font-family: inherit; font-size: 11px; }
  .detail-value { color: #ffa657; flex: 1; font-family: inherit; font-size: 11px; word-break: break-all; }
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

  .pause-btn {
    background: #21262d;
    border: 1px solid #30363d;
    color: #c9d1d9;
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    font-family: inherit;
    margin-left: auto;
  }

  .pause-btn:hover { background: #30363d; }
  .pause-btn.paused { background: #f0883e; color: #0d1117; border-color: #f0883e; }

  .hidden { display: none !important; }
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
