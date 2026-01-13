import { Project } from "ts-morph";
import { glob } from "glob";
import path from "path";
import fs from "fs/promises";
import madge from "madge";
import type {
  RouteAnalysis,
  ComponentTreeNode,
  ComponentInfo,
  DependencyAnalysis,
  FileTreeAnalysis,
  FileNode,
  ApiRouteAnalysis,
  RouteInfo,
  ProjectAnalysis,
} from "../types.js";
import { extractComponentFromFile, findHooks } from "./ast.js";
import { buildImportGraph } from "./imports.js";
import { resolveRouteFiles } from "./routes.js";

export async function analyzeRoute(
  targetPath: string,
  route: string
): Promise<RouteAnalysis> {
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  const segments = normalizedRoute.split("/").filter(Boolean);

  const entryFiles = await resolveRouteFiles(targetPath, segments);
  const allEntryPaths = [
    ...entryFiles.layouts,
    entryFiles.page,
    entryFiles.loading,
    entryFiles.error,
    entryFiles.template,
    entryFiles.notFound,
  ].filter((p): p is string => p !== null);

  if (allEntryPaths.length === 0) {
    return {
      route: normalizedRoute,
      entryFiles,
      componentTree: [],
      allComponents: [],
      stats: {
        totalComponents: 0,
        clientComponents: 0,
        serverComponents: 0,
        uniqueHooks: [],
      },
    };
  }

  const tsConfigPath = path.join(targetPath, "tsconfig.json");
  const hasTsConfig = await fileExists(tsConfigPath);

  const project = new Project({
    tsConfigFilePath: hasTsConfig ? tsConfigPath : undefined,
    compilerOptions: { allowJs: true, jsx: 2 },
    skipAddingFilesFromTsConfig: true,
  });

  for (const entry of allEntryPaths) {
    project.addSourceFileAtPath(entry);
  }

  const { visited, graph } = buildImportGraph(
    project,
    allEntryPaths,
    targetPath
  );

  const componentMap = new Map<string, ComponentInfo>();
  for (const absPath of visited) {
    if (absPath.endsWith(".tsx") || absPath.endsWith(".jsx")) {
      const sourceFile = project.getSourceFile(absPath);
      if (sourceFile) {
        const info = extractComponentFromFile(
          sourceFile,
          path.relative(targetPath, absPath)
        );
        if (info) componentMap.set(path.relative(targetPath, absPath), info);
      }
    }
  }

  const componentTree = buildComponentTree(
    entryFiles,
    targetPath,
    graph,
    componentMap
  );
  const allComponents = Array.from(componentMap.values());

  return {
    route: normalizedRoute,
    entryFiles,
    componentTree,
    allComponents,
    stats: {
      totalComponents: allComponents.length,
      clientComponents: allComponents.filter((c) => c.isClientComponent).length,
      serverComponents: allComponents.filter((c) => c.isServerComponent).length,
      uniqueHooks: [...new Set(allComponents.flatMap((c) => c.hooks))],
    },
  };
}

function buildComponentTree(
  entryFiles: RouteAnalysis["entryFiles"],
  targetPath: string,
  graph: Map<string, string[]>,
  componentMap: Map<string, ComponentInfo>
): ComponentTreeNode[] {
  const buildNode = (
    absPath: string,
    childSlot: ComponentTreeNode | null
  ): ComponentTreeNode => {
    const file = path.relative(targetPath, absPath);
    const imports = graph.get(file) || [];
    const children: ComponentTreeNode[] = [];

    for (const imp of imports) {
      if (imp.endsWith(".tsx") || imp.endsWith(".jsx")) {
        children.push(
          buildFromGraph(imp, graph, componentMap, new Set([file]))
        );
      }
    }

    if (childSlot) {
      children.push({
        file: "{children}",
        component: null,
        children: [childSlot],
      });
    }

    return { file, component: componentMap.get(file) || null, children };
  };

  let innermost: ComponentTreeNode | null = null;

  if (entryFiles.page) innermost = buildNode(entryFiles.page, null);
  for (let i = entryFiles.layouts.length - 1; i >= 0; i--) {
    innermost = buildNode(entryFiles.layouts[i], innermost);
  }

  const result: ComponentTreeNode[] = [];
  if (innermost) result.push(innermost);
  if (entryFiles.loading) result.push(buildNode(entryFiles.loading, null));
  if (entryFiles.error) result.push(buildNode(entryFiles.error, null));
  if (entryFiles.notFound) result.push(buildNode(entryFiles.notFound, null));

  return result;
}

function buildFromGraph(
  file: string,
  graph: Map<string, string[]>,
  componentMap: Map<string, ComponentInfo>,
  visited: Set<string>
): ComponentTreeNode {
  if (visited.has(file)) {
    return { file, component: componentMap.get(file) || null, children: [] };
  }
  visited.add(file);

  const children: ComponentTreeNode[] = [];
  for (const imp of graph.get(file) || []) {
    if (imp.endsWith(".tsx") || imp.endsWith(".jsx")) {
      children.push(buildFromGraph(imp, graph, componentMap, new Set(visited)));
    }
  }

  return { file, component: componentMap.get(file) || null, children };
}

export async function analyzeDependencies(
  targetPath: string
): Promise<DependencyAnalysis> {
  const tsConfigPath = path.join(targetPath, "tsconfig.json");
  const hasTsConfig = await fileExists(tsConfigPath);

  const result = await madge(targetPath, {
    fileExtensions: ["ts", "tsx", "js", "jsx"],
    excludeRegExp: [
      /node_modules/,
      /\.test\./,
      /\.spec\./,
      /dist/,
      /build/,
      /\.next/,
    ],
    ...(hasTsConfig && { tsConfig: tsConfigPath }),
  });

  const graphObj = result.obj();
  const graph = Object.entries(graphObj).map(([file, imports]) => ({
    file,
    imports: imports as string[],
  }));

  return {
    graph,
    circular: result.circular(),
    orphans: result.orphans(),
    warnings: Object.values(result.warnings()).flat() as string[],
    stats: {
      totalFiles: graph.length,
      totalImports: graph.reduce((sum, n) => sum + n.imports.length, 0),
      circularCount: result.circular().length,
      orphanCount: result.orphans().length,
    },
  };
}

export async function analyzeFileTree(
  targetPath: string
): Promise<FileTreeAnalysis> {
  const IGNORE = [
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    ".turbo",
    ".vercel",
    "coverage",
    ".cache",
  ];

  const stats = {
    totalFiles: 0,
    totalDirectories: 0,
    totalSize: 0,
    byExtension: {} as Record<string, number>,
  };

  async function buildTree(
    dirPath: string,
    relativeTo: string
  ): Promise<FileNode> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const children: FileNode[] = [];

    for (const entry of entries) {
      if (IGNORE.includes(entry.name) || entry.name.startsWith(".")) continue;

      const fullPath = path.join(dirPath, entry.name);
      const relPath = path.relative(relativeTo, fullPath);

      if (entry.isDirectory()) {
        stats.totalDirectories++;
        children.push(await buildTree(fullPath, relativeTo));
      } else if (entry.isFile()) {
        const fileStat = await fs.stat(fullPath);
        const ext = path.extname(entry.name).toLowerCase() || "(no extension)";

        stats.totalFiles++;
        stats.totalSize += fileStat.size;
        stats.byExtension[ext] = (stats.byExtension[ext] || 0) + 1;

        children.push({
          name: entry.name,
          path: relPath,
          type: "file",
          size: fileStat.size,
          extension: ext,
        });
      }
    }

    children.sort((a, b) =>
      a.type !== b.type
        ? a.type === "directory"
          ? -1
          : 1
        : a.name.localeCompare(b.name)
    );

    return {
      name: path.basename(dirPath),
      path: path.relative(relativeTo, dirPath) || ".",
      type: "directory",
      children,
    };
  }

  return { root: await buildTree(targetPath, targetPath), stats };
}

export async function analyzeApiRoutes(
  targetPath: string
): Promise<ApiRouteAnalysis> {
  const routes: RouteInfo[] = [];
  const byMethod: Record<string, number> = {};
  const HTTP_METHODS = [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
  ];

  const patterns = [
    { glob: "pages/api/**/*.{ts,tsx,js,jsx}", type: "pages-api" as const },
    { glob: "src/pages/api/**/*.{ts,tsx,js,jsx}", type: "pages-api" as const },
    { glob: "app/**/route.{ts,tsx,js,jsx}", type: "app-route" as const },
    { glob: "src/app/**/route.{ts,tsx,js,jsx}", type: "app-route" as const },
  ];

  for (const { glob: pattern, type } of patterns) {
    const files = await glob(pattern, {
      cwd: targetPath,
      ignore: ["node_modules/**"],
      absolute: true,
    });

    for (const file of files) {
      const relativePath = path.relative(targetPath, file);
      const content = await fs.readFile(file, "utf-8");

      let routePath: string;
      let methods: string[];

      if (type === "pages-api") {
        routePath = relativePath
          .replace(/^(src\/)?pages\/api/, "/api")
          .replace(/\.(ts|tsx|js|jsx)$/, "")
          .replace(/\/index$/, "");

        methods = [];
        if (content.includes("req.method")) {
          for (const m of HTTP_METHODS) {
            if (content.includes(`"${m}"`) || content.includes(`'${m}'`))
              methods.push(m);
          }
        }
        if (methods.length === 0) methods = ["ALL"];
      } else {
        routePath = relativePath
          .replace(/^(src\/)?app/, "")
          .replace(/\/route\.(ts|tsx|js|jsx)$/, "");

        const project = new Project({
          compilerOptions: { allowJs: true },
          skipAddingFilesFromTsConfig: true,
        });
        const sourceFile = project.addSourceFileAtPath(file);
        methods = [];

        for (const [name] of sourceFile.getExportedDeclarations()) {
          if (HTTP_METHODS.includes(name.toUpperCase()))
            methods.push(name.toUpperCase());
        }
        if (methods.length === 0) methods = ["GET"];
      }

      const params = [...routePath.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
      routePath = routePath.replace(/\[([^\]]+)\]/g, ":$1");

      routes.push({
        path: routePath || (type === "pages-api" ? "/api" : "/"),
        filePath: relativePath,
        methods,
        routeType: type,
        hasMiddleware: content.includes("middleware"),
        params,
      });

      for (const m of methods) byMethod[m] = (byMethod[m] || 0) + 1;
    }
  }

  return {
    routes,
    stats: {
      total: routes.length,
      pagesApiRoutes: routes.filter((r) => r.routeType === "pages-api").length,
      appRoutes: routes.filter((r) => r.routeType === "app-route").length,
      byMethod,
    },
  };
}

export async function analyzeProject(
  targetPath: string
): Promise<ProjectAnalysis> {
  const files = await glob("**/*.{tsx,jsx}", {
    cwd: targetPath,
    ignore: ["node_modules/**", ".next/**", "dist/**", "build/**"],
    absolute: true,
  });

  const project = new Project({
    compilerOptions: { allowJs: true, jsx: 2 },
    skipAddingFilesFromTsConfig: true,
  });

  for (const file of files) project.addSourceFileAtPath(file);

  const components: ComponentInfo[] = [];
  const hookUsage: Record<string, number> = {};

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = path.relative(targetPath, sourceFile.getFilePath());
    const info = extractComponentFromFile(sourceFile, filePath);

    if (info) {
      for (const hook of info.hooks)
        hookUsage[hook] = (hookUsage[hook] || 0) + 1;
      components.push(info);
    }
  }

  return {
    components,
    stats: {
      total: components.length,
      withProps: components.filter((c) => c.props.length > 0).length,
      clientComponents: components.filter((c) => c.isClientComponent).length,
      serverComponents: components.filter((c) => c.isServerComponent).length,
      hookUsage,
    },
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
