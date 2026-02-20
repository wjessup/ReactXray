import { state } from './state';

export function createHoverHighlight() {
    if (state.hoverHighlight) return state.hoverHighlight;
    const el = document.createElement('div');
    el.className = 'overlay-highlight';
    el.innerHTML = '<span class="label"></span>';
    document.body.appendChild(el);
    state.hoverHighlight = el;
    return el;
}

export function showHoverHighlight(el: any, label: string) {
    if (!el) return;
    const hl = createHoverHighlight();
    const rect = el.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0 || !isFinite(rect.top)) {
        hl.style.display = 'none';
        return;
    }
    hl.style.cssText = `
      position:fixed;top:${rect.top}px;left:${rect.left}px;
      width:${rect.width}px;height:${rect.height}px;display:block;
    `;
    const labelEl = hl.querySelector('.label');
    if (labelEl) labelEl.textContent = label;
}

export function hideHoverHighlight() {
    if (state.hoverHighlight) state.hoverHighlight.style.display = 'none';
}

export function createSelectedHighlight() {
    if (state.selectedHighlight) return state.selectedHighlight;
    const el = document.createElement('div');
    el.className = 'overlay-highlight selected';
    el.innerHTML = '<span class="label"></span>';
    document.body.appendChild(el);
    state.selectedHighlight = el;
    return el;
}

export function showSelectedHighlight(el: any, label: string) {
    if (!el) return;
    const hl = createSelectedHighlight();
    const rect = el.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0 || !isFinite(rect.top)) {
        hl.style.display = 'none';
        return;
    }
    hl.style.cssText = `
      position:absolute;top:${rect.top + window.scrollY}px;left:${rect.left + window.scrollX}px;
      width:${rect.width}px;height:${rect.height}px;display:block;
    `;
    const labelEl = hl.querySelector('.label');
    if (labelEl) labelEl.textContent = label;
}

export function hideSelectedHighlight() {
    if (state.selectedHighlight) state.selectedHighlight.style.display = 'none';
}
