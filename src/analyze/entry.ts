import fs from "fs/promises";
import path from "path";
import type { RouteEntryFiles } from "../types.js";
import { fileExists } from "./fs-utils.js";

/**
 * Resolve entry point for Vite, CRA, and other non-Next.js React projects.
 * Looks for App.tsx in common locations, then falls back to parsing
 * main.tsx/index.tsx imports to find the root component.
 */
export async function resolveGenericReactEntry(
  targetPath: string
): Promise<RouteEntryFiles> {
  const entryFile =
    (await findAppFile(targetPath)) ??
    (await findEntryFromMain(targetPath));

  return {
    layouts: [],
    page: entryFile,
    loading: null,
    error: null,
    template: null,
    notFound: null,
  };
}

/** Check common App file locations directly */
async function findAppFile(targetPath: string): Promise<string | null> {
  const patterns = [
    "src/App.tsx",
    "src/App.jsx",
    "src/App.ts",
    "src/App.js",
    "src/app.tsx",
    "src/app.jsx",
    "App.tsx",
    "App.jsx",
  ];

  for (const pattern of patterns) {
    const fullPath = path.join(targetPath, pattern);
    if (await fileExists(fullPath)) return fullPath;
  }
  return null;
}

/** Parse main.tsx/index.tsx to resolve the root component import */
async function findEntryFromMain(targetPath: string): Promise<string | null> {
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
    if (!(await fileExists(fullPath))) continue;

    try {
      const content = await fs.readFile(fullPath, "utf-8");
      const resolved = await resolveRootImport(content, fullPath);
      return resolved ?? fullPath;
    } catch {
      // Ignore read errors
    }
    break;
  }
  return null;
}

/** Extract the first relative import from file content and resolve it to a real file */
async function resolveRootImport(
  content: string,
  mainFile: string
): Promise<string | null> {
  const match = content.match(/import\s+(\w+)\s+from\s+['"](\.\/[^'"]+)['"]/);
  if (!match) return null;

  const importPath = match[2];
  const baseDir = path.dirname(mainFile);

  // Try the import path as-is (e.g. './components/App.tsx')
  const directPath = path.join(baseDir, importPath);
  if (await fileExists(directPath)) return directPath;

  // Try adding extensions
  for (const ext of [".tsx", ".jsx", ".ts", ".js"]) {
    const withExt = path.join(baseDir, `${importPath}${ext}`);
    if (await fileExists(withExt)) return withExt;
  }

  // Try as directory with index file
  for (const ext of [".tsx", ".jsx", ".ts", ".js"]) {
    const indexPath = path.join(baseDir, importPath, `index${ext}`);
    if (await fileExists(indexPath)) return indexPath;
  }

  return null;
}
