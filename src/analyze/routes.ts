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
    return {
      layouts: [],
      page: null,
      loading: null,
      error: null,
      template: null,
      notFound: null,
    };
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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
