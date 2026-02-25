import {
  createServer,
  request as httpRequest,
  IncomingMessage,
  ServerResponse,
} from "http";
import { request as httpsRequest } from "https";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { analyzeRoute, getProjectComponentNames } from "./analyze/index.js";
import type { ComponentTreeNode, RouteAnalysis } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function getOverlayGenerator(): Promise<(data: RouteAnalysis | null) => string> {
  const cacheBuster = Date.now();
  const modulePath = path.resolve(__dirname, "./overlay/index.js");
  const moduleUrl = pathToFileURL(modulePath).href;
  const module = await import(`${moduleUrl}?cb=${cacheBuster}`);
  return module.generateOverlayScript;
}

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

  const analysisCache = new Map<string, { result: RouteAnalysis; time: number }>();
  const CACHE_TTL = 10000;

  let componentAllowlistCache: { names: string[]; time: number } | null = null;
  const ALLOWLIST_CACHE_TTL = 30000;

  async function getComponentAllowlist(): Promise<string[]> {
    if (!projectPath) return [];
    if (
      componentAllowlistCache &&
      Date.now() - componentAllowlistCache.time < ALLOWLIST_CACHE_TTL
    ) {
      return componentAllowlistCache.names;
    }

    try {
      console.log("  Building component allowlist...");
      const names = await getProjectComponentNames(projectPath);
      const nameArray = Array.from(names);
      componentAllowlistCache = { names: nameArray, time: Date.now() };
      console.log(`  ✓ Found ${nameArray.length} project components`);
      return nameArray;
    } catch (err) {
      console.error("  ✗ Failed to build allowlist:", (err as Error).message);
      return [];
    }
  }

  async function getOverlayForRoute(route: string): Promise<string | null> {
    if (!projectPath) return null;

    let result: RouteAnalysis | null = null;
    const cached = analysisCache.get(route);
    
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      result = cached.result;
      console.log(`  Using cached analysis for: ${route}`);
    }

    try {
      const generateOverlayScript = await getOverlayGenerator();
      return generateOverlayScript(result);
    } catch (err) {
      console.error(`  ✗ Failed to generate overlay:`, (err as Error).message);
      return null;
    }
  }

  if (proxyTarget) {
    startProxyServer(
      port,
      proxyTarget,
      outputPath,
      projectPath,
      staticOverlay,
      getOverlayForRoute,
      getComponentAllowlist
    );
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
  getOverlayForRoute: (route: string) => Promise<string | null>,
  getComponentAllowlist: () => Promise<string[]>
): void {
  const targetUrl = new URL(proxyTarget);
  const isHttps = targetUrl.protocol === "https:";
  const makeRequest = isHttps ? httpsRequest : httpRequest;

  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      if (req.url?.startsWith("/__overlay/")) {
        const file = req.url.slice(11);
        try {
          const content = await fs.readFile(
            path.join(outputPath, file),
            "utf-8"
          );
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
          res.end(
            JSON.stringify({
              route: result.route,
              componentTree: result.componentTree,
              allComponents: result.allComponents,
              stats: result.stats,
              architectureAnalysis: result.architectureAnalysis,
            })
          );
          console.log(
            `  ✓ Data ready (${
              result.stats.totalComponents
            } components, ${countTreeNodes(result.componentTree)} tree nodes)`
          );
        } catch (err) {
          console.error(`  ✗ Failed:`, (err as Error).message);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
        return;
      }

      if (req.url?.startsWith("/__overlay_deps.json")) {
        const url = new URL(req.url, `http://localhost:${port}`);
        const route = url.searchParams.get("route") || "/";
        try {
          const result = await analyzeRoute(projectPath!, route);
          const pageAbsPath = result.entryFiles.page;
          if (!pageAbsPath) {
             res.statusCode = 404;
             res.end(JSON.stringify({ error: "No page entry file found" }));
             return;
          }
          const relPagePath = path.relative(projectPath!, pageAbsPath).replace(/\\/g, '/');
          
          const depsIndexPath = path.join(outputPath, 'deps', 'index.json');
          const depsIndexStr = await fs.readFile(depsIndexPath, 'utf-8');
          const depsIndex = JSON.parse(depsIndexStr);
          
          const screen = depsIndex.screens.find((s: any) => s.pagePath.replace(/\\/g, '/') === relPagePath);
          
          if (!screen) {
             res.statusCode = 404;
             res.end(JSON.stringify({ error: "Screen not found in deps index" }));
             return;
          }
          
          const screenFile = path.join(outputPath, 'deps', screen.file);
          const screenData = await fs.readFile(screenFile, 'utf-8');
          
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(screenData);
        } catch(err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
        return;
      }

      if (req.url?.startsWith("/__overlay_allowlist.json")) {
        try {
          const allowlist = await getComponentAllowlist();
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(JSON.stringify({ components: allowlist }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
        return;
      }

      if (req.url?.startsWith("/__source_file")) {
        const url = new URL(req.url, `http://localhost:${port}`);
        const filePath = url.searchParams.get("path");
        if (!filePath || !projectPath) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Missing path parameter" }));
          return;
        }
        
        const normalizedPath = filePath.startsWith("/") ? filePath : path.join(projectPath, filePath);
        if (!normalizedPath.startsWith(projectPath)) {
          res.statusCode = 403;
          res.end(JSON.stringify({ error: "Access denied" }));
          return;
        }
        
        try {
          const content = await fs.readFile(normalizedPath, "utf-8");
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(JSON.stringify({ path: normalizedPath, content }));
        } catch (err) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: "File not found", path: normalizedPath }));
        }
        return;
      }

      if (req.url?.startsWith("/__ai_chat") && req.method === "POST") {
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", async () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
            const message: string = body.message || "";
            const context: Array<{ name: string; file: string; line: number; ancestry?: string[] }> = body.context || [];

            const SNIPPET_RADIUS = 5;
            const files: Array<{ path: string; line: number; snippet: string; ancestry: string[] }> = [];
            const cursorLinks: string[] = [];

            for (const ctx of context) {
              const filePath = ctx.file.startsWith("/")
                ? ctx.file
                : projectPath
                  ? path.join(projectPath, ctx.file)
                  : ctx.file;

              const cursorLink = "cursor://file/" + filePath + ":" + ctx.line;
              cursorLinks.push(cursorLink);

              try {
                const content = await fs.readFile(filePath, "utf-8");
                const lines = content.split("\n");
                const start = Math.max(0, ctx.line - SNIPPET_RADIUS - 1);
                const end = Math.min(lines.length, ctx.line + SNIPPET_RADIUS);
                const snippet = lines.slice(start, end).join("\n");
                files.push({ path: filePath, line: ctx.line, snippet, ancestry: ctx.ancestry || [] });
              } catch {
                files.push({ path: filePath, line: ctx.line, snippet: "// Could not read file", ancestry: ctx.ancestry || [] });
              }
            }

            const ext = (p: string) => p.split(".").pop() || "tsx";
            let prompt = "## Task\n" + message + "\n\n## Components\n";
            for (let i = 0; i < files.length; i++) {
              const f = files[i];
              const shortPath = projectPath ? path.relative(projectPath, f.path) : f.path;
              const ancestryLabel = f.ancestry.length > 0 ? f.ancestry.join(" > ") + " > " + context[i].name : context[i].name;
              prompt += "\n### " + ancestryLabel + " (" + shortPath + ":" + f.line + ")\n";
              prompt += cursorLinks[i] + "\n";
              prompt += "```" + ext(f.path) + "\n" + f.snippet + "\n```\n";
            }

            res.setHeader("Content-Type", "application/json");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(JSON.stringify({ prompt, files, cursorLinks }));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(JSON.stringify({ error: (err as Error).message }));
          }
        });
        return;
      }

      if (req.url?.startsWith("/__ai_chat") && req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.end();
        return;
      }

      if (req.url?.startsWith("/__save_calculated_tree") && req.method === "POST") {
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", async () => {
          try {
            const body = Buffer.concat(chunks).toString("utf-8");
            const debugDir = path.join(process.cwd(), "debug");
            await fs.mkdir(debugDir, { recursive: true });
            await fs.writeFile(path.join(debugDir, "calculated-tree.json"), body);
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end("ok");
          } catch (err) {
            res.statusCode = 500;
            res.end((err as Error).message);
          }
        });
        return;
      }

      if (req.url?.startsWith("/__save_calculated_tree") && req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.end();
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
    }
  );

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
  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET");

      if (req.url === "/" || req.url === "/index.html") {
        const files = await fs.readdir(outputPath);
        const overlays = files.filter((f) => f.endsWith("-overlay.js"));

        res.setHeader("Content-Type", "text/html");
        res.end(`<!DOCTYPE html><html><head><title>Overlay Server</title></head>
<body style="font-family:monospace;background:#0d1117;color:#c9d1d9;padding:24px;">
<h2 style="color:#58a6ff;">Available Overlays</h2>
<ul>${overlays
          .map(
            (f) => `<li><a href="/${f}" style="color:#7ee787;">${f}</a></li>`
          )
          .join("")}</ul>
<h3 style="color:#58a6ff;margin-top:24px;">Quick Inject</h3>
<p>Paste in browser console:</p>
${overlays
  .map(
    (f) =>
      `<pre style="background:#161b22;padding:12px;border-radius:6px;color:#ffa657;">fetch('http://localhost:${port}/${f}').then(r=>r.text()).then(eval)</pre>`
  )
  .join("")}
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
    }
  );

  server.listen(port, () => {
    console.log(`\n🚀 Overlay server running at http://localhost:${port}`);
    console.log(`   Serving from: ${outputPath}\n`);
  });
}
