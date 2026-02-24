import fs from "fs/promises";
import path from "path";
import type { RouteEntryFiles } from "../types.js";

interface RoutePath {
  dirs: string[];
  page: string | null;
}

export async function resolveRouteFiles(
  targetPath: string,
  segments: string[]
): Promise<RouteEntryFiles> {
  const appDirs = ["app", "src/app"];
  let appDir: string | null = null;

  for (const dir of appDirs) {
    if (await fileExists(path.join(targetPath, dir))) {
      appDir = path.join(targetPath, dir);
      break;
    }
  }

  if (!appDir) {
    // Not a Next.js project — try to find a Vite/CRA-style entry point
    return resolveGenericReactEntry(targetPath);
  }

  const validPaths = await findAllRoutePaths(appDir, segments);
  const pathWithPage = validPaths.find((p) => p.page !== null);

  if (!pathWithPage) {
    const rootLayout = await findConventionFile(appDir, "layout");
    return {
      layouts: rootLayout ? [rootLayout] : [],
      page: null,
      loading: null,
      error: await findConventionFile(appDir, "error"),
      template: null,
      notFound: await findConventionFile(appDir, "not-found"),
    };
  }

  const layouts: string[] = [];
  for (const dir of pathWithPage.dirs) {
    const layout = await findConventionFile(dir, "layout");
    if (layout && !layouts.includes(layout)) layouts.push(layout);
  }

  const finalDir = pathWithPage.dirs[pathWithPage.dirs.length - 1];

  return {
    layouts,
    page: pathWithPage.page,
    loading: await findConventionFile(finalDir, "loading"),
    error:
      (await findConventionFile(finalDir, "error")) ||
      (await findConventionFile(appDir, "error")),
    template: await findConventionFile(finalDir, "template"),
    notFound:
      (await findConventionFile(finalDir, "not-found")) ||
      (await findConventionFile(appDir, "not-found")),
  };
}

async function findAllRoutePaths(
  appDir: string,
  segments: string[]
): Promise<RoutePath[]> {
  const results: RoutePath[] = [];

  async function search(
    currentDir: string,
    remaining: string[],
    pathSoFar: string[]
  ): Promise<void> {
    const currentPath = [...pathSoFar, currentDir];

    if (remaining.length === 0) {
      results.push({
        dirs: currentPath,
        page: await findConventionFile(currentDir, "page"),
      });

      for (const group of await findRouteGroups(currentDir)) {
        const groupPage = await findConventionFile(group, "page");
        if (groupPage)
          results.push({ dirs: [...currentPath, group], page: groupPage });
      }
      return;
    }

    const [next, ...rest] = remaining;
    const variants = [next, `[${next}]`, `[...${next}]`, `[[...${next}]]`];

    for (const variant of variants) {
      const testPath = path.join(currentDir, variant);
      if (await fileExists(testPath)) await search(testPath, rest, currentPath);
    }

    const entries = await fs
      .readdir(currentDir, { withFileTypes: true })
      .catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const entryPath = path.join(currentDir, entry.name);

      if (entry.name.startsWith("(") && entry.name.endsWith(")")) {
        await search(entryPath, remaining, currentPath);
      } else if (entry.name.startsWith("[") && !variants.includes(entry.name)) {
        await search(entryPath, rest, currentPath);
      }
    }
  }

  await search(appDir, segments, []);
  return results;
}

async function findRouteGroups(dir: string): Promise<string[]> {
  const entries = await fs
    .readdir(dir, { withFileTypes: true })
    .catch(() => []);
  return entries
    .filter(
      (e) => e.isDirectory() && e.name.startsWith("(") && e.name.endsWith(")")
    )
    .map((e) => path.join(dir, e.name));
}

async function findConventionFile(
  dir: string,
  name: string
): Promise<string | null> {
  for (const ext of [".tsx", ".jsx", ".ts", ".js"]) {
    const filePath = path.join(dir, `${name}${ext}`);
    if (await fileExists(filePath)) return filePath;
  }
  return null;
}

async function resolveGenericReactEntry(
  targetPath: string
): Promise<RouteEntryFiles> {
  // Common entry point patterns for Vite, CRA, and other React setups
  const entryPatterns = [
    "src/App.tsx",
    "src/App.jsx",
    "src/App.ts",
    "src/App.js",
    "src/app.tsx",
    "src/app.jsx",
    "App.tsx",
    "App.jsx",
  ];

  let entryFile: string | null = null;
  for (const pattern of entryPatterns) {
    const fullPath = path.join(targetPath, pattern);
    if (await fileExists(fullPath)) {
      entryFile = fullPath;
      break;
    }
  }

  if (!entryFile) {
    // Try to find the entry from main.tsx/index.tsx by looking for a root render call
    const mainPatterns = [
      "src/main.tsx",
      "src/main.jsx",
      "src/index.tsx",
      "src/index.jsx",
      "index.tsx",
      "index.jsx",
    ];

    for (const pattern of mainPatterns) {
      const fullPath = path.join(targetPath, pattern);
      if (await fileExists(fullPath)) {
        // Read the main file and look for the App component import
        try {
          const content = await fs.readFile(fullPath, "utf-8");
          // Look for import of a component: import App from './App' or './components/App.tsx'
          const appImportMatch = content.match(
            /import\s+(\w+)\s+from\s+['"](\.\/[^'"]+)['"]/
          );
          if (appImportMatch) {
            const importPath = appImportMatch[2];
            const baseDir = path.dirname(fullPath);
            // Try the import path as-is first (e.g. './components/App.tsx')
            const directPath = path.join(baseDir, importPath);
            if (await fileExists(directPath)) {
              entryFile = directPath;
            } else {
              // Try adding extensions
              for (const ext of [".tsx", ".jsx", ".ts", ".js"]) {
                const appPath = path.join(baseDir, `${importPath}${ext}`);
                if (await fileExists(appPath)) {
                  entryFile = appPath;
                  break;
                }
              }
              // Try as directory with index file
              if (!entryFile) {
                for (const ext of [".tsx", ".jsx", ".ts", ".js"]) {
                  const indexPath = path.join(baseDir, importPath, `index${ext}`);
                  if (await fileExists(indexPath)) {
                    entryFile = indexPath;
                    break;
                  }
                }
              }
            }
          }
          if (!entryFile) {
            // If we can't find the App, use the main file itself
            entryFile = fullPath;
          }
        } catch {
          // Ignore read errors
        }
        break;
      }
    }
  }

  return {
    layouts: [],
    page: entryFile,
    loading: null,
    error: null,
    template: null,
    notFound: null,
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
