import { state, saveState } from './state';
import { renderPanel } from './ui';

let settingsOverlay: HTMLDivElement | null = null;

function lockPageScroll() {
    // simplified version or copy from existing logic, but maybe we can just restrict scrolling
    // since UI is fixed, let's just do a basic lock
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
}

function unlockPageScroll() {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
}

export function showSettingsDialog() {
    if (!state.shadow) return;

    if (!settingsOverlay) {
        settingsOverlay = document.createElement('div');
        settingsOverlay.className = 'settings-overlay';
        settingsOverlay.style.display = 'none';
        state.shadow.appendChild(settingsOverlay);

        settingsOverlay.addEventListener('click', e => {
            const target = e.target as HTMLElement;

            if (target === settingsOverlay) {
                hideSettingsDialog();
                return;
            }

            if (target.closest('.settings-close')) {
                hideSettingsDialog();
                return;
            }

            if (target.closest('.settings-save')) {
                const textarea = settingsOverlay?.querySelector('.ignored-paths-input') as HTMLTextAreaElement;
                if (textarea) {
                    const paths = textarea.value.split('\n').map(p => p.trim()).filter(p => p);
                    state.ignoredPaths = paths;
                    saveState();
                }
                hideSettingsDialog();
                renderPanel();
                return;
            }

            if (target.closest('.settings-clear')) {
                const textarea = settingsOverlay?.querySelector('.ignored-paths-input') as HTMLTextAreaElement;
                if (textarea) textarea.value = '';
                return;
            }

            const presetBtn = target.closest('.settings-preset') as HTMLElement;
            if (presetBtn) {
                const textarea = settingsOverlay?.querySelector('.ignored-paths-input') as HTMLTextAreaElement;
                if (textarea) {
                    const currentValue = textarea.value.trim();
                    const newPath = presetBtn.dataset.paths;
                    if (currentValue && !currentValue.includes(newPath!)) {
                        textarea.value = currentValue + '\n' + newPath;
                    } else if (!currentValue) {
                        textarea.value = newPath!;
                    }
                }
                return;
            }
        });
    }

    const currentPaths = state.ignoredPaths.join('\n');

    settingsOverlay.innerHTML = `
      <div class="settings-dialog">
        <div class="settings-header">
          <h3>⚙️ Settings</h3>
          <button class="settings-close">×</button>
        </div>
        <div class="settings-content">
          <div class="settings-section">
            <label>Ignored Paths</label>
            <p class="settings-hint">Components with file paths containing these strings will be hidden from the tree. One per line.</p>
            <textarea class="ignored-paths-input" placeholder="components/ui\nshadcn-ui\n@radix-ui">${currentPaths}</textarea>
          </div>
          <div class="settings-examples">
            <span class="settings-example-label">Examples:</span>
            <button class="settings-preset" data-paths="components/ui">shadcn/ui</button>
            <button class="settings-preset" data-paths="@radix-ui">radix-ui</button>
            <button class="settings-preset" data-paths="node_modules">node_modules</button>
          </div>
        </div>
        <div class="settings-footer">
          <button class="settings-clear">Clear All</button>
          <button class="settings-save">Save</button>
        </div>
      </div>
    `;

    const wasOpen = settingsOverlay.style.display === 'flex';
    if (!wasOpen) lockPageScroll();
    settingsOverlay.style.display = 'flex';
}

export function hideSettingsDialog() {
    if (!settingsOverlay) return;
    const wasOpen = settingsOverlay.style.display === 'flex';
    settingsOverlay.style.display = 'none';
    if (wasOpen) unlockPageScroll();
}
