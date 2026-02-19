import { callbacks, state } from './state';
import { escapeHtml } from './utils';

let detailOverlay: HTMLElement | null = null;
let currentDetailNode: any = null;

export function showDetailDialog(node: any, domEl: any) {
    currentDetailNode = node;
    
    if (!detailOverlay) {
        detailOverlay = document.createElement('div');
        detailOverlay.className = 'detail-overlay';
        detailOverlay.style.display = 'none';
        
        detailOverlay.addEventListener('click', e => {
             // @ts-ignore
             if (e.target === detailOverlay || e.target.classList.contains('detail-close')) {
                 hideDetailDialog();
             }
        });
        
        if (state.shadow) state.shadow.appendChild(detailOverlay);
    }
    
    renderDetailContent();
    detailOverlay.style.display = 'flex';
}

export function hideDetailDialog() {
    if (detailOverlay) detailOverlay.style.display = 'none';
    currentDetailNode = null;
}

function renderDetailContent() {
    if (!detailOverlay || !currentDetailNode) return;
    const comp = currentDetailNode.component;
    const compName = comp?.name || 'Unknown';
    const file = currentDetailNode.file || 'unknown';
    
    // Placeholder for full logic
    detailOverlay.innerHTML = `
        <div class="detail-dialog">
            <div class="detail-header">
                <div>
                    <h3>${escapeHtml(compName)}</h3>
                    <div class="file">${escapeHtml(file)}</div>
                </div>
                <button class="detail-close">×</button>
            </div>
            <div class="detail-content">
                <div style="padding: 10px; overflow: auto; max-height: 400px; font-family: monospace; font-size: 12px; white-space: pre-wrap;">
                    ${escapeHtml(JSON.stringify(currentDetailNode, null, 2))}
                </div>
            </div>
        </div>
    `;
}

// Assign to callbacks
callbacks.showDetail = showDetailDialog;
