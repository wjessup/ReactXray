#!/usr/bin/env node
import { Command } from "commander";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import { analyzeDependencies } from "./analyzers/dependencies.js";
import { analyzeFileTree } from "./analyzers/file-tree.js";
import { analyzeComponents } from "./analyzers/components.js";
import { analyzeRoutes } from "./analyzers/routes.js";
import { analyzeRouteComponents } from "./analyzers/route-components.js";
import { generateHtml } from "./visualize.js";
import { generateOverlayScript, generateBookmarklet } from "./overlay.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const defaultOutput = path.join(projectRoot, "repo-analysis-output");

interface AnalyzeOptions {
  out: string;
  only?: string;
}

const program = new Command();

program
  .name("repo-analyzer")
  .description("Analyze codebases and generate AI-friendly JSON artifacts")
  .version("1.0.0");

program
  .command("analyze")
  .description("Analyze a target project directory")
  .argument("<target>", "Path to the project to analyze")
  .option("-o, --out <dir>", "Output directory for artifacts", defaultOutput)
  .option(
    "--only <analyzers>",
    "Run only specific analyzers (comma-separated: deps,tree,components,routes)"
  )
  .action(async (target: string, options: AnalyzeOptions) => {
    const targetPath = path.resolve(target);
    const outputPath = path.resolve(options.out);

    try {
      await fs.access(targetPath);
    } catch {
      console.error(`Error: Target directory does not exist: ${targetPath}`);
      process.exit(1);
    }

    await fs.mkdir(outputPath, { recursive: true });

    const analyzers = options.only?.split(",") ?? [
      "deps",
      "tree",
      "components",
      "routes",
    ];

    console.log(`\nAnalyzing: ${targetPath}`);
    console.log(`Output to: ${outputPath}\n`);

    for (const analyzer of analyzers) {
      switch (analyzer.trim()) {
        case "deps":
          console.log("Running dependency analysis...");
          const deps = await analyzeDependencies(targetPath);
          await fs.writeFile(
            path.join(outputPath, "dependencies.json"),
            JSON.stringify(deps, null, 2)
          );
          console.log("  ✓ dependencies.json");
          break;

        case "tree":
          console.log("Running file tree analysis...");
          const tree = await analyzeFileTree(targetPath);
          await fs.writeFile(
            path.join(outputPath, "file-tree.json"),
            JSON.stringify(tree, null, 2)
          );
          console.log("  ✓ file-tree.json");
          break;

        case "components":
          console.log("Running component analysis...");
          const components = await analyzeComponents(targetPath);
          await fs.writeFile(
            path.join(outputPath, "components.json"),
            JSON.stringify(components, null, 2)
          );
          console.log("  ✓ components.json");
          break;

        case "routes":
          console.log("Running route analysis...");
          const routes = await analyzeRoutes(targetPath);
          await fs.writeFile(
            path.join(outputPath, "routes.json"),
            JSON.stringify(routes, null, 2)
          );
          console.log("  ✓ routes.json");
          break;

        default:
          console.warn(`Unknown analyzer: ${analyzer}`);
      }
    }

    console.log("\nAnalysis complete!");
  });

program
  .command("route")
  .description("Analyze components for a specific Next.js route")
  .argument("<target>", "Path to the Next.js project")
  .argument("<route>", "Route to analyze (e.g., /dashboard/settings)")
  .option("-o, --out <dir>", "Output directory for artifacts", defaultOutput)
  .action(async (target: string, route: string, options: { out: string }) => {
    const targetPath = path.resolve(target);
    const outputPath = path.resolve(options.out);

    try {
      await fs.access(targetPath);
    } catch {
      console.error(`Error: Target directory does not exist: ${targetPath}`);
      process.exit(1);
    }

    await fs.mkdir(outputPath, { recursive: true });

    console.log(`\nAnalyzing route: ${route}`);
    console.log(`Project: ${targetPath}`);
    console.log(`Output to: ${outputPath}\n`);

    const result = await analyzeRouteComponents(targetPath, route);
    const baseName = `route-${route.replace(/\//g, "-").replace(/^-/, "")}`;
    const jsonFile = `${baseName}.json`;
    const htmlFile = `${baseName}.html`;

    await fs.writeFile(
      path.join(outputPath, jsonFile),
      JSON.stringify(result, null, 2)
    );
    console.log(`  ✓ ${jsonFile}`);

    const html = generateHtml(result);
    await fs.writeFile(path.join(outputPath, htmlFile), html);
    console.log(`  ✓ ${htmlFile}`);

    const overlayFile = `${baseName}-overlay.js`;
    const overlayScript = generateOverlayScript(result);
    await fs.writeFile(path.join(outputPath, overlayFile), overlayScript);
    console.log(`  ✓ ${overlayFile}`);

    console.log(`\nFound ${result.stats.totalComponents} components`);
    console.log(`  Client: ${result.stats.clientComponents}`);
    console.log(`  Server: ${result.stats.serverComponents}`);
    console.log("\nAnalysis complete!");
  });

program
  .command("overlay")
  .description("Generate an injectable overlay script for a route")
  .argument("<target>", "Path to the Next.js project")
  .argument("<route>", "Route to analyze (e.g., /dashboard/settings)")
  .option("-o, --out <dir>", "Output directory for artifacts", defaultOutput)
  .option("-b, --bookmarklet", "Also generate a bookmarklet file")
  .action(
    async (
      target: string,
      route: string,
      options: { out: string; bookmarklet?: boolean }
    ) => {
      const targetPath = path.resolve(target);
      const outputPath = path.resolve(options.out);

      try {
        await fs.access(targetPath);
      } catch {
        console.error(`Error: Target directory does not exist: ${targetPath}`);
        process.exit(1);
      }

      await fs.mkdir(outputPath, { recursive: true });

      console.log(`\nGenerating overlay for route: ${route}`);
      console.log(`Project: ${targetPath}`);
      console.log(`Output to: ${outputPath}\n`);

      const result = await analyzeRouteComponents(targetPath, route);
      const baseName = `overlay-${route.replace(/\//g, "-").replace(/^-/, "")}`;

      const script = generateOverlayScript(result);
      const scriptFile = `${baseName}.js`;
      await fs.writeFile(path.join(outputPath, scriptFile), script);
      console.log(`  ✓ ${scriptFile}`);

      if (options.bookmarklet) {
        const bookmarklet = generateBookmarklet(result);
        const bookmarkletFile = `${baseName}-bookmarklet.txt`;
        await fs.writeFile(path.join(outputPath, bookmarkletFile), bookmarklet);
        console.log(`  ✓ ${bookmarkletFile}`);
      }

      console.log("\nUsage:");
      console.log("  1. Open your app in browser");
      console.log(`  2. Paste contents of ${scriptFile} into browser console`);
      console.log("  3. Or drag the bookmarklet to your bookmarks bar");
      console.log("\nKeyboard shortcut: Ctrl+Shift+C to toggle overlay");
    }
  );

program
  .command("serve")
  .description("Serve overlay scripts via local HTTP server for easy injection")
  .option("-p, --port <port>", "Port to serve on", "9876")
  .option(
    "--proxy <url>",
    "Proxy target app and strip CSP (e.g., http://localhost:3000)"
  )
  .option("--project <path>", "Next.js project path for dynamic route analysis")
  .option(
    "--overlay <file>",
    "Static overlay file to inject (ignored if --project is set)"
  )
  .option(
    "-o, --out <dir>",
    "Directory containing overlay scripts",
    defaultOutput
  )
  .action(
    async (options: {
      port: string;
      out: string;
      proxy?: string;
      overlay?: string;
      project?: string;
    }) => {
      const { createServer, request: httpRequest } = await import("http");
      const { request: httpsRequest } = await import("https");
      const outputPath = path.resolve(options.out);
      const port = parseInt(options.port, 10);

      const overlayCache = new Map<string, { script: string; time: number }>();
      const CACHE_TTL = 5000;

      async function getOverlayForRoute(route: string): Promise<string | null> {
        if (!options.project) return null;

        const cached = overlayCache.get(route);
        if (cached && Date.now() - cached.time < CACHE_TTL) {
          return cached.script;
        }

        try {
          console.log(`  Analyzing route: ${route}`);
          const result = await analyzeRouteComponents(
            path.resolve(options.project),
            route
          );
          const script = generateOverlayScript(result);
          overlayCache.set(route, { script, time: Date.now() });
          console.log(
            `  ✓ Generated overlay (${result.stats.totalComponents} components)`
          );
          return script;
        } catch (err) {
          console.error(
            `  ✗ Failed to analyze route ${route}:`,
            (err as Error).message
          );
          return null;
        }
      }

      if (options.proxy) {
        const targetUrl = new URL(options.proxy);
        const isHttps = targetUrl.protocol === "https:";
        const makeRequest = isHttps ? httpsRequest : httpRequest;

        const server = createServer(async (req, res) => {
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
                const refUrl = new URL(referer);
                route = refUrl.pathname;
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
              const result = await analyzeRouteComponents(path.resolve(options.project!), route);
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Cache-Control", "no-cache");
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.end(JSON.stringify({
                route: result.route,
                componentTree: result.componentTree,
                stats: result.stats
              }));
              console.log(`  ✓ Data ready (${result.stats.totalComponents} components)`);
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
              const shouldInject = options.project || options.overlay;
              
              if (isHtml || req.url?.startsWith("/__overlay")) {
                console.log(`  [${req.method}] ${req.url} → ${contentType.slice(0, 30)} (inject: ${isHtml && shouldInject})`);
              }

              if (isHtml && shouldInject) {
                delete headers["content-length"];
                delete headers["content-encoding"];
                res.writeHead(proxyRes.statusCode || 200, headers);

                const chunks: Buffer[] = [];
                proxyRes.on("data", (chunk) => chunks.push(chunk));
                proxyRes.on("end", async () => {
                  let html = Buffer.concat(chunks).toString("utf-8");
                  const hasBody = html.includes("</body>");
                  console.log(`  Injecting overlay (has </body>: ${hasBody}, length: ${html.length})`);
                  
                  if (options.project) {
                    const overlayScript = `<script src="/__overlay_dynamic.js?t=${Date.now()}"></script>`;
                    if (hasBody) {
                      html = html.replace("</body>", `${overlayScript}</body>`);
                    } else {
                      html += overlayScript;
                    }
                  } else if (options.overlay) {
                    const overlayScript = `<script src="/__overlay/${options.overlay}"></script>`;
                    if (hasBody) {
                      html = html.replace("</body>", `${overlayScript}</body>`);
                    } else {
                      html += overlayScript;
                    }
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
          console.log(`   Proxying: ${options.proxy}`);
          console.log(`   CSP headers: stripped`);
          if (options.project) {
            console.log(`   Dynamic analysis: ${options.project}`);
            console.log(`   (overlay generated per-route automatically)`);
          } else if (options.overlay) {
            console.log(`   Static overlay: ${options.overlay}`);
          }
          console.log(`\n   Open http://localhost:${port} in your browser\n`);
        });
        return;
      }

      const server = createServer(async (req, res) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET");

        if (req.url === "/" || req.url === "/index.html") {
          const files = await fs.readdir(outputPath);
          const overlays = files.filter((f) => f.endsWith("-overlay.js"));
          res.setHeader("Content-Type", "text/html");
          res.end(`<!DOCTYPE html><html><head><title>Overlay Server</title></head><body style="font-family:monospace;background:#0d1117;color:#c9d1d9;padding:24px;">
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
          const content = await fs.readFile(
            path.join(outputPath, file),
            "utf-8"
          );
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
        console.log(`Quick inject (paste in browser console):`);
        console.log(
          `   fetch('http://localhost:${port}/route-u-tests2-overlay.js').then(r=>r.text()).then(eval)\n`
        );
      });
    }
  );

program.parse();
