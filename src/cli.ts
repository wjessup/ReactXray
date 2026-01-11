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

program.parse();
