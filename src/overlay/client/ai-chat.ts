import { state } from './state';
import { h } from './utils';

export function addComponentToAiContext(name: string, file: string, line: number, ancestry: string[] = [], usageFile?: string, usageLine?: number) {
    const already = state.aiContext.some(c => c.name === name && c.file === file && c.ancestry.join('>') === ancestry.join('>'));
    if (already) return;
    state.aiContext.push({ name, file, line, ancestry, usageFile, usageLine });
    renderAiSection();
}

export function removeComponentFromAiContext(index: number) {
    state.aiContext.splice(index, 1);
    renderAiSection();
}

export function toggleAiPanel() {
    state.aiOpen = !state.aiOpen;
    renderAiSection();
}

function buildPayload(): { message: string; context: typeof state.aiContext } {
    return {
        message: state.aiMessage,
        context: state.aiContext.map(c => ({ ...c })),
    };
}

async function handleSend() {
    if (!state.aiMessage.trim() && state.aiContext.length === 0) return;

    const payload = buildPayload();
    state.aiSending = true;
    renderAiSection();

    try {
        const res = await fetch('/__ai_chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            console.warn('[AI Chat] Server responded with', res.status);
        } else {
            const data = await res.json();
            state.aiResult = data;
        }
    } catch (err) {
        console.warn('[AI Chat] Failed to send:', err);
    }

    state.aiSending = false;
    renderAiSection();
}

function handleNewMessage() {
    state.aiResult = null;
    state.aiMessage = '';
    state.aiContext = [];
    renderAiSection();
}

async function handleCopyPrompt() {
    if (!state.aiResult) return;
    try {
        await navigator.clipboard.writeText(state.aiResult.prompt);
    } catch {
        const ta = document.createElement('textarea');
        ta.value = state.aiResult.prompt;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }
    const btn = state.shadow?.querySelector('.ai-copy-btn') as HTMLElement | null;
    if (btn) {
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy Prompt'; }, 1500);
    }
}

function handleOpenInCursor() {
    if (!state.aiResult) return;
    for (const link of state.aiResult.cursorLinks) {
        window.open(link, '_blank');
    }
}

function renderResultView(): HTMLElement {
    const result = state.aiResult!;

    const textarea = h('textarea', {
        className: 'ai-result-prompt',
        readonly: '',
    });
    textarea.textContent = result.prompt;

    const copyBtn = h('button', {
        className: 'ai-copy-btn',
        onClick: (e: Event) => { e.stopPropagation(); handleCopyPrompt(); },
    }, 'Copy Prompt');

    const cursorBtn = h('button', {
        className: 'ai-cursor-btn',
        onClick: (e: Event) => { e.stopPropagation(); handleOpenInCursor(); },
    }, 'Open File in Cursor');

    const newBtn = h('button', {
        className: 'ai-new-btn',
        onClick: (e: Event) => { e.stopPropagation(); handleNewMessage(); },
    }, 'New Message');

    return h('div', { className: 'ai-body ai-result-body' },
        textarea,
        h('div', { className: 'ai-result-actions' },
            copyBtn,
            cursorBtn,
            newBtn,
        ),
    );
}

function renderContextChips(): HTMLElement {
    const chips = state.aiContext.map((ctx, i) => {
        const fileName = ctx.file.split('/').pop() || ctx.file;
        const ancestryPrefix = ctx.ancestry.length > 0 ? ctx.ancestry.join(' > ') + ' > ' : '';
        let label = ancestryPrefix + ctx.name + ' (' + fileName + ')';
        if (ctx.usageFile) {
            const usageShort = ctx.usageFile.split('/').pop() || ctx.usageFile;
            label += ' 📍' + usageShort + ':' + ctx.usageLine;
        }

        return h('div', { className: 'ai-chip' },
            h('span', { className: 'ai-chip-label' }, label),
            h('button', {
                className: 'ai-chip-remove',
                title: 'Remove',
                onClick: (e: Event) => { e.stopPropagation(); removeComponentFromAiContext(i); },
            }, '×'),
        );
    });

    return h('div', { className: 'ai-chips' }, ...chips);
}

function renderAiBody(): HTMLElement {
    const textarea = h('textarea', {
        className: 'ai-textarea',
        placeholder: 'e.g. "Change the color of this button to blue"',
        value: state.aiMessage,
    });

    textarea.addEventListener('input', e => {
        state.aiMessage = (e.target as HTMLTextAreaElement).value;
    });

    textarea.addEventListener('keydown', e => {
        if ((e as KeyboardEvent).key === 'Enter' && (e as KeyboardEvent).ctrlKey) {
            e.preventDefault();
            handleSend();
        }
    });

    const sendBtn = h('button', {
        className: 'ai-send-btn' + (state.aiSending ? ' sending' : ''),
        onClick: (e: Event) => { e.stopPropagation(); handleSend(); },
    }, state.aiSending ? 'Generating...' : 'Generate prompt  ⌘↵');

    const hint = h('div', { className: 'ai-hint' }, 'Click ℹ on a tree node to add it as context');

    return h('div', { className: 'ai-body' },
        renderContextChips(),
        textarea,
        h('div', { className: 'ai-actions' },
            hint,
            sendBtn,
        ),
    );
}

export function renderAiSection() {
    const container = state.shadow?.querySelector('.ai-section') as HTMLElement | null;
    if (!container) return;

    container.innerHTML = '';

    const headerBtn = h('button', {
        className: 'ai-header-toggle',
        onClick: (e: Event) => { e.stopPropagation(); toggleAiPanel(); },
    },
        h('span', { className: 'ai-header-icon' }, '✨'),
        h('span', { className: 'ai-header-label' }, 'AI Chat'),
        state.aiContext.length > 0
            ? h('span', { className: 'ai-header-badge' }, String(state.aiContext.length))
            : null as any,
        h('span', { className: 'ai-header-chevron' }, state.aiOpen ? '▾' : '▸'),
    );

    container.appendChild(headerBtn);

    if (state.aiOpen) {
        container.appendChild(state.aiResult ? renderResultView() : renderAiBody());
    }
}
