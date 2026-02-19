import { mount } from './OverlayApp';

// Check if data is already injected (e.g. by local-overlay serving static file)
const data = (window as any).__REPO_DATA__;

if (data) {
    console.log('[Overlay] Found injected data, mounting...');
    mount(data);
} else {
    console.log('[Overlay] No injected data, checking for API...');
    // Try to fetch data from the server (dynamic mode or served json)
    // pass undefined to mount(), which will trigger refreshAnalysis() inside OverlayApp
    mount();
}
