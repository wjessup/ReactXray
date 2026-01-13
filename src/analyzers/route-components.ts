import { Project, Node, SourceFile } from "ts-morph";
import path from "path";
import fs from "fs/promises";

interface PropInfo {
  name: string;
  type: string;
  optional: boolean;
}

interface ComponentInfo {
  name: string;
  filePath: string;
  props: PropInfo[];
  hooks: string[];
  serverQueries: string[];
  isClientComponent: boolean;
  isServerComponent: boolean;
}

interface ComponentTreeNode {
  file: string;
  component: ComponentInfo | null;
  children: ComponentTreeNode[];
}

interface RouteEntryFiles {
  layouts: string[];
  page: string | null;
  loading: string | null;
  error: string | null;
  template: string | null;
  notFound: string | null;
}

interface RouteComponentAnalysis {
  route: string;
  entryFiles: RouteEntryFiles;
  componentTree: ComponentTreeNode[];
  allComponents: ComponentInfo[];
  stats: {
    totalComponents: number;
    clientComponents: number;
    serverComponents: number;
    uniqueHooks: string[];
  };
}

const REACT_HOOKS = [
  "useState",
  "useEffect",
  "useContext",
  "useReducer",
  "useCallback",
  "useMemo",
  "useRef",
  "useImperativeHandle",
  "useLayoutEffect",
  "useDebugValue",
  "useDeferredValue",
  "useTransition",
  "useId",
];

const CONVENTION_FILES = [
  "layout",
  "page",
  "loading",
  "error",
  "template",
  "not-found",
  "default",
];

export async function analyzeRouteComponents(
  targetPath: string,
  route: string
): Promise<RouteComponentAnalysis> {
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

  for (const entryPath of allEntryPaths) {
    project.addSourceFileAtPath(entryPath);
  }

  const componentMap = new Map<string, ComponentInfo>();
  const importGraph = new Map<string, string[]>();

  const processFile = (filePath: string, visited: Set<string>) => {
    if (visited.has(filePath)) return;
    visited.add(filePath);

    let sourceFile = project.getSourceFile(filePath);
    if (
      !sourceFile &&
      (filePath.endsWith(".tsx") ||
        filePath.endsWith(".ts") ||
        filePath.endsWith(".jsx") ||
        filePath.endsWith(".js"))
    ) {
      try {
        sourceFile = project.addSourceFileAtPath(filePath);
      } catch {
        return;
      }
    }
    if (!sourceFile) return;

    const imports = getFileImports(sourceFile, targetPath);
    importGraph.set(
      path.relative(targetPath, filePath),
      imports.map((i) => path.relative(targetPath, i))
    );

    for (const imp of imports) {
      processFile(imp, visited);
    }
  };

  const visited = new Set<string>();
  for (const entryPath of allEntryPaths) {
    processFile(entryPath, visited);
  }

  for (const absPath of visited) {
    if (absPath.endsWith(".tsx") || absPath.endsWith(".jsx")) {
      const info = analyzeComponentFromSource(project, absPath, targetPath);
      if (info) {
        componentMap.set(path.relative(targetPath, absPath), info);
      }
    }
  }

  const componentTree = buildNestedLayoutTree(
    entryFiles,
    targetPath,
    importGraph,
    componentMap
  );

  const allComponents = Array.from(componentMap.values());
  const uniqueHooks = [...new Set(allComponents.flatMap((c) => c.hooks))];

  return {
    route: normalizedRoute,
    entryFiles,
    componentTree,
    allComponents,
    stats: {
      totalComponents: allComponents.length,
      clientComponents: allComponents.filter((c) => c.isClientComponent).length,
      serverComponents: allComponents.filter((c) => c.isServerComponent).length,
      uniqueHooks,
    },
  };
}

interface RoutePath {
  dirs: string[];
  page: string | null;
}

async function resolveRouteFiles(
  targetPath: string,
  segments: string[]
): Promise<RouteEntryFiles> {
  const appDirs = ["app", "src/app"];
  let appDir: string | null = null;

  for (const dir of appDirs) {
    const fullPath = path.join(targetPath, dir);
    if (await fileExists(fullPath)) {
      appDir = fullPath;
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
    if (layout && !layouts.includes(layout)) {
      layouts.push(layout);
    }
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
    remainingSegments: string[],
    pathSoFar: string[]
  ): Promise<void> {
    const currentPath = [...pathSoFar, currentDir];

    if (remainingSegments.length === 0) {
      const page = await findConventionFile(currentDir, "page");
      results.push({ dirs: currentPath, page });

      const routeGroups = await findRouteGroups(currentDir);
      for (const group of routeGroups) {
        const groupPage = await findConventionFile(group, "page");
        if (groupPage) {
          results.push({ dirs: [...currentPath, group], page: groupPage });
        }
      }
      return;
    }

    const [nextSegment, ...rest] = remainingSegments;
    const segmentVariants = [
      nextSegment,
      `[${nextSegment}]`,
      `[...${nextSegment}]`,
      `[[...${nextSegment}]]`,
    ];

    for (const variant of segmentVariants) {
      const testPath = path.join(currentDir, variant);
      if (await fileExists(testPath)) {
        await search(testPath, rest, currentPath);
      }
    }

    const entries = await fs
      .readdir(currentDir, { withFileTypes: true })
      .catch(() => []);

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const entryPath = path.join(currentDir, entry.name);
        if (entry.name.startsWith("(") && entry.name.endsWith(")")) {
          await search(entryPath, remainingSegments, currentPath);
        } else if (
          entry.name.startsWith("[") &&
          !segmentVariants.includes(entry.name)
        ) {
          await search(entryPath, rest, currentPath);
        }
      }
    }
  }

  await search(appDir, segments, []);
  return results;
}

async function findRouteGroups(dir: string): Promise<string[]> {
  const groups: string[] = [];
  const entries = await fs
    .readdir(dir, { withFileTypes: true })
    .catch(() => []);
  for (const entry of entries) {
    if (
      entry.isDirectory() &&
      entry.name.startsWith("(") &&
      entry.name.endsWith(")")
    ) {
      groups.push(path.join(dir, entry.name));
    }
  }
  return groups;
}

async function findConventionFile(
  dir: string,
  name: string
): Promise<string | null> {
  const extensions = [".tsx", ".jsx", ".ts", ".js"];
  for (const ext of extensions) {
    const filePath = path.join(dir, `${name}${ext}`);
    if (await fileExists(filePath)) {
      return filePath;
    }
  }
  return null;
}

function getFileImports(sourceFile: SourceFile, targetPath: string): string[] {
  const imports: string[] = [];
  const importDecls = sourceFile.getImportDeclarations();

  for (const decl of importDecls) {
    const moduleSpecifier = decl.getModuleSpecifierValue();
    if (moduleSpecifier.startsWith(".") || moduleSpecifier.startsWith("@/")) {
      const resolved = decl.getModuleSpecifierSourceFile();
      if (resolved) {
        const resolvedPath = resolved.getFilePath();
        if (!resolvedPath.includes("node_modules")) {
          imports.push(resolvedPath);
        }
      }
    }
  }

  return imports;
}

function buildNestedLayoutTree(
  entryFiles: RouteEntryFiles,
  targetPath: string,
  importGraph: Map<string, string[]>,
  componentMap: Map<string, ComponentInfo>
): ComponentTreeNode[] {
  const buildNodeWithImports = (
    absPath: string,
    childrenSlot: ComponentTreeNode | null
  ): ComponentTreeNode => {
    const file = path.relative(targetPath, absPath);
    const imports = importGraph.get(file) || [];
    const children: ComponentTreeNode[] = [];

    for (const imp of imports) {
      if (imp.endsWith(".tsx") || imp.endsWith(".jsx")) {
        children.push(
          buildTreeFromGraph(imp, importGraph, componentMap, new Set([file]))
        );
      }
    }

    if (childrenSlot) {
      children.push({
        file: "{children}",
        component: null,
        children: [childrenSlot],
      });
    }

    return {
      file,
      component: componentMap.get(file) || null,
      children,
    };
  };

  let innermost: ComponentTreeNode | null = null;

  if (entryFiles.page) {
    innermost = buildNodeWithImports(entryFiles.page, null);
  }

  for (let i = entryFiles.layouts.length - 1; i >= 0; i--) {
    innermost = buildNodeWithImports(entryFiles.layouts[i], innermost);
  }

  const result: ComponentTreeNode[] = [];
  if (innermost) result.push(innermost);

  if (entryFiles.loading) {
    result.push(buildNodeWithImports(entryFiles.loading, null));
  }
  if (entryFiles.error) {
    result.push(buildNodeWithImports(entryFiles.error, null));
  }
  if (entryFiles.notFound) {
    result.push(buildNodeWithImports(entryFiles.notFound, null));
  }

  return result;
}

function buildTreeFromGraph(
  file: string,
  graph: Map<string, string[]>,
  componentMap: Map<string, ComponentInfo>,
  visited: Set<string>
): ComponentTreeNode {
  if (visited.has(file)) {
    return { file, component: componentMap.get(file) || null, children: [] };
  }
  visited.add(file);

  const imports = graph.get(file) || [];
  const children: ComponentTreeNode[] = [];

  for (const imp of imports) {
    if (imp.endsWith(".tsx") || imp.endsWith(".jsx")) {
      children.push(
        buildTreeFromGraph(imp, graph, componentMap, new Set(visited))
      );
    }
  }

  return {
    file,
    component: componentMap.get(file) || null,
    children,
  };
}

function analyzeComponentFromSource(
  project: Project,
  filePath: string,
  targetPath: string
): ComponentInfo | null {
  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) return null;

  const relativePath = path.relative(targetPath, filePath);
  const fileText = sourceFile.getFullText();

  const isClientComponent =
    fileText.includes('"use client"') || fileText.includes("'use client'");
  const isServerComponent =
    fileText.includes('"use server"') || fileText.includes("'use server'");

  const defaultExport = sourceFile.getDefaultExportSymbol();
  if (defaultExport) {
    const declarations = defaultExport.getDeclarations();
    for (const decl of declarations) {
      const info = extractComponentInfo(
        decl,
        relativePath,
        isClientComponent,
        isServerComponent
      );
      if (info) {
        info.hooks = findHooksInNode(decl);
        info.serverQueries = !isClientComponent ? findServerQueries(decl) : [];
        return info;
      }
    }
  }

  const namedExports = sourceFile.getExportedDeclarations();
  for (const [exportName, declarations] of namedExports) {
    if (exportName === "default") continue;
    for (const decl of declarations) {
      const info = extractComponentInfo(
        decl,
        relativePath,
        isClientComponent,
        isServerComponent
      );
      if (info) {
        info.name = exportName;
        info.hooks = findHooksInNode(decl);
        info.serverQueries = !isClientComponent ? findServerQueries(decl) : [];
        return info;
      }
    }
  }

  return null;
}

function extractComponentInfo(
  node: Node,
  filePath: string,
  isClientComponent: boolean,
  isServerComponent: boolean
): ComponentInfo | null {
  if (
    Node.isFunctionDeclaration(node) ||
    Node.isArrowFunction(node) ||
    Node.isFunctionExpression(node)
  ) {
    const name = Node.isFunctionDeclaration(node)
      ? node.getName() || "Anonymous"
      : "Anonymous";
    if (!looksLikeComponent(node, name)) return null;

    return {
      name,
      filePath,
      props: extractProps(node),
      hooks: [],
      serverQueries: [],
      isClientComponent,
      isServerComponent,
    };
  }

  if (Node.isVariableDeclaration(node)) {
    const initializer = node.getInitializer();
    if (
      initializer &&
      (Node.isArrowFunction(initializer) ||
        Node.isFunctionExpression(initializer))
    ) {
      const varName = node.getName();
      if (!looksLikeComponent(initializer, varName)) return null;

      return {
        name: varName,
        filePath,
        props: extractProps(initializer),
        hooks: [],
        serverQueries: [],
        isClientComponent,
        isServerComponent,
      };
    }
  }

  return null;
}

const NEXTJS_SPECIAL_EXPORTS = [
  "generateMetadata",
  "generateStaticParams",
  "revalidate",
  "dynamic",
  "dynamicParams",
  "fetchCache",
  "runtime",
  "preferredRegion",
  "maxDuration",
];

function looksLikeComponent(node: Node, name?: string): boolean {
  if (name && NEXTJS_SPECIAL_EXPORTS.includes(name)) {
    return false;
  }
  if (name && name.startsWith("get") && name.endsWith("Metadata")) {
    return false;
  }
  const text = node.getText();
  return (
    text.includes("return") && (text.includes("<") || text.includes("jsx"))
  );
}

function extractProps(node: Node): PropInfo[] {
  const props: PropInfo[] = [];

  if (
    Node.isFunctionDeclaration(node) ||
    Node.isArrowFunction(node) ||
    Node.isFunctionExpression(node)
  ) {
    const params = node.getParameters();
    if (params.length > 0) {
      const firstParam = params[0];
      const typeNode = firstParam.getTypeNode();

      if (typeNode && Node.isTypeLiteral(typeNode)) {
        for (const member of typeNode.getMembers()) {
          if (Node.isPropertySignature(member)) {
            props.push({
              name: member.getName(),
              type: simplifyType(member.getType().getText()),
              optional: member.hasQuestionToken(),
            });
          }
        }
      } else {
        const paramType = firstParam.getType();
        const properties = paramType.getProperties();
        for (const prop of properties) {
          const declarations = prop.getDeclarations();
          const decl = declarations[0];
          if (decl && Node.isPropertySignature(decl)) {
            props.push({
              name: prop.getName(),
              type: simplifyType(decl.getType().getText()),
              optional: decl.hasQuestionToken(),
            });
          } else {
            const propType = prop.getTypeAtLocation(node);
            props.push({
              name: prop.getName(),
              type: simplifyType(propType.getText()),
              optional: propType.isNullable(),
            });
          }
        }
      }
    }
  }

  return props;
}

function simplifyType(typeStr: string): string {
  return typeStr
    .replace(/import\([^)]+\)\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findHooksInNode(node: Node): string[] {
  const hooks: string[] = [];
  const text = node.getText();

  for (const hook of REACT_HOOKS) {
    const regex = new RegExp(`\\b${hook}\\s*\\(`, "g");
    if (regex.test(text)) {
      hooks.push(hook);
    }
  }

  const customHookRegex = /\buse[A-Z]\w*\s*\(/g;
  const customMatches = text.match(customHookRegex);
  if (customMatches) {
    for (const match of customMatches) {
      const hookName = match.replace(/\s*\($/, "");
      if (!REACT_HOOKS.includes(hookName) && !hooks.includes(hookName)) {
        hooks.push(hookName);
      }
    }
  }

  return hooks;
}

function findServerQueries(node: Node): string[] {
  const queries: string[] = [];
  const text = node.getText();

  const awaitCallRegex = /await\s+(\w+)\s*\(/g;
  let match;
  while ((match = awaitCallRegex.exec(text)) !== null) {
    const fnName = match[1];
    if (!queries.includes(fnName) && fnName !== "Promise") {
      queries.push(fnName);
    }
  }

  const promiseAllRegex = /Promise\.all\s*\(\s*\[([\s\S]*?)\]\s*\)/g;
  while ((match = promiseAllRegex.exec(text)) !== null) {
    const content = match[1];
    const fnCallRegex = /(\w+)\s*\(/g;
    let fnMatch;
    while ((fnMatch = fnCallRegex.exec(content)) !== null) {
      const fnName = fnMatch[1];
      if (!queries.includes(fnName) && fnName !== "await") {
        queries.push(fnName);
      }
    }
  }

  return queries;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
