import type { RouteAnalysis } from "../types.js";
import fs from 'fs';
import path from 'path';

const BUNDLE_PATH = path.resolve(process.cwd(), 'dist', 'overlay.js');

function readBundle(): string {
  try {
    return fs.readFileSync(BUNDLE_PATH, 'utf-8');
  } catch {
    const msg = `[Overlay] Could not read overlay.js bundle at ${BUNDLE_PATH}. Run "npm run build:overlay" first.`;
    console.error(msg);
    return `console.error(${JSON.stringify(msg)});`;
  }
}

export function generateOverlayScript(data: RouteAnalysis | null): string {
  const treeJson = JSON.stringify(data?.componentTree || []);
  const statsJson = JSON.stringify(data?.stats || {});
  const routeJson = JSON.stringify(data?.route || '');
  const archJson = JSON.stringify(data?.architectureAnalysis || null);

  const bundleContent = readBundle();

  return `(function() {
    window.__REPO_DATA__ = {
      STATIC_TREE: ${treeJson},
      STATS: ${statsJson},
      ROUTE: ${routeJson},
      ARCHITECTURE: ${archJson}
    };
    
    ${bundleContent}
  })();`;
}

export function generateBookmarklet(data: RouteAnalysis): string {
  const scriptContent = generateOverlayScript(data);
  const encoded = encodeURIComponent(scriptContent);
  return `javascript:(function(){var s=document.createElement('script');s.text=decodeURIComponent('${encoded}');document.body.appendChild(s);})();`;
}
