export const callbacks = {
    render: () => {},
    refresh: async () => {},
    showDetail: (node: any, domEl: any) => {},
    onToggle: (isOpen: boolean) => {},
};

export const state = {
    STATIC_TREE: [] as any[],
    TREE: [] as any[],
    DISPLAY_TREE: [] as any[],
    STATS: {} as any,
    ROUTE: '',
    ARCHITECTURE: null as any,
    DEPS: null as any,
    FIBER_TREE: [] as any[],
    
    viewMode: 'tree' as 'tree' | 'list',
    panelWidth: parseInt(localStorage.getItem('ro-panel-width') || '380', 10),
    isOpen: false,
    isLoading: true,
    isPaused: false,
    searchTerm: '',
    ignoredPaths: JSON.parse(localStorage.getItem('ro-ignored-paths') || '[]') as string[],
    
    host: null as HTMLElement | null,
    shadow: null as ShadowRoot | null,
    container: null as HTMLElement | null,
    hoverHighlight: null as HTMLElement | null,
    selectedHighlight: null as HTMLElement | null,
    
    selectedFiber: null as any,
    selectedElement: null as any,
    renderCounts: new Map<string, number>(),
    totalRenders: 0,

    aiOpen: false,
    aiMessage: '',
    aiContext: [] as Array<{ name: string; file: string; line: number; ancestry: string[]; usageFile?: string; usageLine?: number }>,
    aiSending: false,
    aiResult: null as {
        prompt: string;
        cursorLinks: string[];
    } | null,
};

export function saveState() {
    localStorage.setItem('ro-panel-width', state.panelWidth.toString());
    localStorage.setItem('ro-ignored-paths', JSON.stringify(state.ignoredPaths));
}
