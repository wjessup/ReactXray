#!/usr/bin/env node
import { Command } from "commander";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import {
  analyzeRoute,
  analyzeDependencies,
  analyzeFileTree,
  analyzeApiRoutes,
  analyzeProject,
} from "./analyze/index.js";
import { generateOverlayScript, generateBookmarklet } from "./overlay/index.js";
import { generateHtml } from "./visualize.js";
import { startServer } from "./server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const defaultOutput = path.join(projectRoot, "repo-analysis-output");

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
  .option("--only <analyzers>", "Run only specific analyzers (comma-separated: deps,tree,components,routes)")
  .action(async (target: string, options: { out: string; only?: string }) => {
    const targetPath = path.resolve(target);
    const outputPath = path.resolve(options.out);

    if (!(await pathExists(targetPath))) {
      console.error(`Error: Target directory does not exist: ${targetPath}`);
      process.exit(1);
    }

    await fs.mkdir(outputPath, { recursive: true });

    const analyzers = options.only?.split(",") ?? ["deps", "tree", "components", "routes"];

    console.log(`\nAnalyzing: ${targetPath}`);
    console.log(`Output to: ${outputPath}\n`);

    for (const analyzer of analyzers) {
      switch (analyzer.trim()) {
        case "deps":
          console.log("Running dependency analysis...");
          const deps = await analyzeDependencies(targetPath);
          await fs.writeFile(path.join(outputPath, "dependencies.json"), JSON.stringify(deps, null, 2));
          console.log("  ✓ dependencies.json");
          break;

        case "tree":
          console.log("Running file tree analysis...");
          const tree = await analyzeFileTree(targetPath);
          await fs.writeFile(path.join(outputPath, "file-tree.json"), JSON.stringify(tree, null, 2));
          console.log("  ✓ file-tree.json");
          break;

        case "components":
          console.log("Running component analysis...");
          const components = await analyzeProject(targetPath);
          await fs.writeFile(path.join(outputPath, "components.json"), JSON.stringify(components, null, 2));
          console.log("  ✓ components.json");
          break;

        case "routes":
          console.log("Running route analysis...");
          const routes = await analyzeApiRoutes(targetPath);
          await fs.writeFile(path.join(outputPath, "routes.json"), JSON.stringify(routes, null, 2));
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

    if (!(await pathExists(targetPath))) {
      console.error(`Error: Target directory does not exist: ${targetPath}`);
      process.exit(1);
    }

    await fs.mkdir(outputPath, { recursive: true });

    console.log(`\nAnalyzing route: ${route}`);
    console.log(`Project: ${targetPath}`);
    console.log(`Output to: ${outputPath}\n`);

    const result = await analyzeRoute(targetPath, route);
    const baseName = `route-${route.replace(/\//g, "-").replace(/^-/, "")}`;

    await fs.writeFile(path.join(outputPath, `${baseName}.json`), JSON.stringify(result, null, 2));
    console.log(`  ✓ ${baseName}.json`);

    await fs.writeFile(path.join(outputPath, `${baseName}.html`), generateHtml(result));
    console.log(`  ✓ ${baseName}.html`);

    await fs.writeFile(path.join(outputPath, `${baseName}-overlay.js`), generateOverlayScript(result));
    console.log(`  ✓ ${baseName}-overlay.js`);

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
  .action(async (target: string, route: string, options: { out: string; bookmarklet?: boolean }) => {
      const targetPath = path.resolve(target);
      const outputPath = path.resolve(options.out);

    if (!(await pathExists(targetPath))) {
        console.error(`Error: Target directory does not exist: ${targetPath}`);
        process.exit(1);
      }

      await fs.mkdir(outputPath, { recursive: true });

      console.log(`\nGenerating overlay for route: ${route}`);
      console.log(`Project: ${targetPath}`);
      console.log(`Output to: ${outputPath}\n`);

    const result = await analyzeRoute(targetPath, route);
      const baseName = `overlay-${route.replace(/\//g, "-").replace(/^-/, "")}`;

    await fs.writeFile(path.join(outputPath, `${baseName}.js`), generateOverlayScript(result));
    console.log(`  ✓ ${baseName}.js`);

      if (options.bookmarklet) {
      await fs.writeFile(path.join(outputPath, `${baseName}-bookmarklet.txt`), generateBookmarklet(result));
      console.log(`  ✓ ${baseName}-bookmarklet.txt`);
      }

      console.log("\nUsage:");
      console.log("  1. Open your app in browser");
    console.log(`  2. Paste contents of ${baseName}.js into browser console`);
      console.log("  3. Or drag the bookmarklet to your bookmarks bar");
      console.log("\nKeyboard shortcut: Ctrl+Shift+C to toggle overlay");
  });

program
  .command("serve")
  .description("Serve overlay scripts via local HTTP server for easy injection")
  .option("-p, --port <port>", "Port to serve on", "9876")
  .option("--proxy <url>", "Proxy target app and strip CSP (e.g., http://localhost:3000)")
  .option("--project <path>", "Next.js project path for dynamic route analysis")
  .option("--overlay <file>", "Static overlay file to inject (ignored if --project is set)")
  .option("-o, --out <dir>", "Directory containing overlay scripts", defaultOutput)
  .action(async (options: { port: string; out: string; proxy?: string; overlay?: string; project?: string }) => {
    startServer({
      port: parseInt(options.port, 10),
      outputPath: path.resolve(options.out),
      proxyTarget: options.proxy,
      projectPath: options.project ? path.resolve(options.project) : undefined,
      staticOverlay: options.overlay,
    });
  });

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
        } catch {
    return false;
  }
}

program.parse();
