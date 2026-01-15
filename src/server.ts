import { createServer, request as httpRequest, IncomingMessage, ServerResponse } from "http";
import { request as httpsRequest } from "https";
import fs from "fs/promises";
import path from "path";
import { analyzeRoute } from "./analyze/index.js";
import { generateOverlayScript } from "./overlay/index.js";
import type { ComponentTreeNode } from "./types.js";

function countTreeNodes(nodes: ComponentTreeNode[]): number {
  let count = nodes.length;
  for (const node of nodes) {
    count += countTreeNodes(node.children);
  }
  return count;
}

interface ServerOptions {
  port: number;
  outputPath: string;
  proxyTarget?: string;
  projectPath?: string;
  staticOverlay?: string;
}

export function startServer(options: ServerOptions): void {
  const { port, outputPath, proxyTarget, projectPath, staticOverlay } = options;

  const overlayCache = new Map<string, { script: string; time: number }>();
  const CACHE_TTL = 5000;

  async function getOverlayForRoute(route: string): Promise<string | null> {
    if (!projectPath) return null;

    const cached = overlayCache.get(route);
    if (cached && Date.now() - cached.time < CACHE_TTL) return cached.script;

    try {
      console.log(`  Analyzing route: ${route}`);
      const result = await analyzeRoute(projectPath, route);
      const script = generateOverlayScript(result);
      overlayCache.set(route, { script, time: Date.now() });
      console.log(`  ✓ Generated overlay (${result.stats.totalComponents} components, ${countTreeNodes(result.componentTree)} tree nodes)`);
      return script;
    } catch (err) {
      console.error(`  ✗ Failed to analyze route ${route}:`, (err as Error).message);
      return null;
    }
  }

  if (proxyTarget) {
    startProxyServer(port, proxyTarget, outputPath, projectPath, staticOverlay, getOverlayForRoute);
  } else {
    startStaticServer(port, outputPath);
  }
}

function startProxyServer(
  port: number,
  proxyTarget: string,
  outputPath: string,
  projectPath: string | undefined,
  staticOverlay: string | undefined,
  getOverlayForRoute: (route: string) => Promise<string | null>
): void {
  const targetUrl = new URL(proxyTarget);
  const isHttps = targetUrl.protocol === "https:";
  const makeRequest = isHttps ? httpsRequest : httpRequest;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url?.startsWith("/__overlay/")) {
      const file = req.url.slice(11);
      try {
        const content = await fs.readFile(path.join(outputPath, file), "utf-8");
        res.setHeader("Content-Type", "application/javascript");
        res.setHeader("Cache-Control", "no-cache");
        res.end(content);
      } catch {
        res.statusCode = 404;
        res.end("Not found");
      }
      return;
    }

    if (req.url?.startsWith("/__overlay_dynamic.js")) {
      const referer = req.headers.referer;
      let route = "/";
      if (referer) {
        try {
          route = new URL(referer).pathname;
        } catch {}
      }
      const script = await getOverlayForRoute(route);
      res.setHeader("Content-Type", "application/javascript");
      res.setHeader("Cache-Control", "no-cache");
      res.end(script || "console.log('No overlay for this route');");
      return;
    }

    if (req.url?.startsWith("/__overlay_data.json")) {
      const url = new URL(req.url, `http://localhost:${port}`);
      const route = url.searchParams.get("route") || "/";
      console.log(`  Fetching data for route: ${route}`);
      try {
        const result = await analyzeRoute(projectPath!, route);
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.end(JSON.stringify({
          route: result.route,
          componentTree: result.componentTree,
          stats: result.stats,
        }));
        console.log(`  ✓ Data ready (${result.stats.totalComponents} components, ${countTreeNodes(result.componentTree)} tree nodes)`);
      } catch (err) {
        console.error(`  ✗ Failed:`, (err as Error).message);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
      return;
    }

    const reqHeaders = { ...req.headers, host: targetUrl.host };
    delete reqHeaders["accept-encoding"];

    const proxyReq = makeRequest(
      {
        hostname: targetUrl.hostname,
        port: targetUrl.port || (isHttps ? 443 : 80),
        path: req.url,
        method: req.method,
        headers: reqHeaders,
      },
      (proxyRes) => {
        const headers = { ...proxyRes.headers };
        delete headers["content-security-policy"];
        delete headers["content-security-policy-report-only"];
        delete headers["x-content-security-policy"];

        const contentType = headers["content-type"] || "";
        const isHtml = contentType.includes("text/html");
        const shouldInject = projectPath || staticOverlay;

        if (isHtml && shouldInject) {
          delete headers["content-length"];
          delete headers["content-encoding"];
          res.writeHead(proxyRes.statusCode || 200, headers);

          const chunks: Buffer[] = [];
          proxyRes.on("data", (chunk) => chunks.push(chunk));
          proxyRes.on("end", () => {
            let html = Buffer.concat(chunks).toString("utf-8");
            const hasBody = html.includes("</body>");

            const scriptTag = projectPath
              ? `<script src="/__overlay_dynamic.js?t=${Date.now()}"></script>`
              : `<script src="/__overlay/${staticOverlay}"></script>`;

            if (hasBody) {
              html = html.replace("</body>", `${scriptTag}</body>`);
            } else {
              html += scriptTag;
            }
            res.end(html);
          });
        } else {
          res.writeHead(proxyRes.statusCode || 200, headers);
          proxyRes.pipe(res);
        }
      }
    );

    proxyReq.on("error", (err) => {
      console.error("Proxy error:", err.message);
      res.statusCode = 502;
      res.end("Proxy error");
    });

    req.pipe(proxyReq);
  });

  server.listen(port, () => {
    console.log(`\n🚀 Proxy server running at http://localhost:${port}`);
    console.log(`   Proxying: ${proxyTarget}`);
    console.log(`   CSP headers: stripped`);
    if (projectPath) {
      console.log(`   Dynamic analysis: ${projectPath}`);
    } else if (staticOverlay) {
      console.log(`   Static overlay: ${staticOverlay}`);
    }
    console.log(`\n   Open http://localhost:${port} in your browser\n`);
  });
}

function startStaticServer(port: number, outputPath: string): void {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");

    if (req.url === "/" || req.url === "/index.html") {
      const files = await fs.readdir(outputPath);
      const overlays = files.filter((f) => f.endsWith("-overlay.js"));

      res.setHeader("Content-Type", "text/html");
      res.end(`<!DOCTYPE html><html><head><title>Overlay Server</title></head>
<body style="font-family:monospace;background:#0d1117;color:#c9d1d9;padding:24px;">
<h2 style="color:#58a6ff;">Available Overlays</h2>
<ul>${overlays.map((f) => `<li><a href="/${f}" style="color:#7ee787;">${f}</a></li>`).join("")}</ul>
<h3 style="color:#58a6ff;margin-top:24px;">Quick Inject</h3>
<p>Paste in browser console:</p>
${overlays.map((f) => `<pre style="background:#161b22;padding:12px;border-radius:6px;color:#ffa657;">fetch('http://localhost:${port}/${f}').then(r=>r.text()).then(eval)</pre>`).join("")}
</body></html>`);
      return;
    }

    const file = req.url?.slice(1);
    if (!file) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    try {
      const content = await fs.readFile(path.join(outputPath, file), "utf-8");
      res.setHeader("Content-Type", "application/javascript");
      res.end(content);
    } catch {
      res.statusCode = 404;
      res.end("Not found");
    }
  });

  server.listen(port, () => {
    console.log(`\n🚀 Overlay server running at http://localhost:${port}`);
    console.log(`   Serving from: ${outputPath}\n`);
  });
}
