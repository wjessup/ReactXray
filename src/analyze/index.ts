import { Project, SourceFile, Node } from "ts-morph";
import { glob } from "glob";
import path from "path";
import fs from "fs/promises";
import type {
  RouteAnalysis,
  ComponentTreeNode,
  ComponentInfo,
  FileTreeAnalysis,
  FileNode,
  ApiRouteAnalysis,
  RouteInfo,
  ProjectAnalysis,
  ProjectJsxExports,
  InferredJsxUsage,
  ArchitectureAnalysis,
  ArchitectureSmell,
  PropFlowTree,
  PropFlowNode,
  PropOriginInfo,
  ScreenDepsAnalysis,
  ScreenDeps,
  ScreenComponentRef,
  SharedComponentEntry,
} from "../types.js";
import {
  extractComponentFromFile,
  extractAllComponentsFromFile,
  findHooks,
  extractJsxChildren,
  extractJsxUsage,
  JsxUsage,
  extractJsxExports,
  extractInferredJsx,
} from "./ast.js";
import { buildImportGraph, resolveJsxImports } from "./imports.js";
import { resolveRouteFiles } from "./routes.js";
import {
  detectNoOpFunctions,
  extractPropPassing,
  analyzePassThroughComponents,
  detectArchitectureSmells,
  PropPassingInfo,
  buildPropUpwardFlows,
} from "./ast/prop-lineage.js";
import {
  buildComponentUsageMap,
  buildProjectWideUsageMap,
  findSimilarComponents,
  generateComponentContextSummary,
} from "./ast/usage-context.js";

export interface EnhancedJsxUsage extends JsxUsage {
  inferredInComponent: Map<string, string[]>;
}

export async function getProjectComponentNames(
  targetPath: string,
): Promise<Set<string>> {
  const files = await glob("**/*.{tsx,jsx}", {
    cwd: targetPath,
    ignore: ["node_modules/**", ".next/**", "dist/**", "build/**"],
    absolute: true,
  });

  const tsConfigPath = path.join(targetPath, "tsconfig.json");
  const hasTsConfig = await fileExists(tsConfigPath);

  const project = new Project({
    tsConfigFilePath: hasTsConfig ? tsConfigPath : undefined,
    compilerOptions: { allowJs: true, jsx: 2 },
    skipAddingFilesFromTsConfig: true,
  });

  for (const file of files) {
    try {
      project.addSourceFileAtPath(file);
    } catch {}
  }

  const componentNames = new Set<string>();

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    if (filePath.includes("node_modules")) continue;

    for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
      if (name === "default") continue;

      for (const decl of declarations) {
        if (isImplementedComponent(decl, name)) {
          componentNames.add(name);
        }
      }
    }

    const defaultExport = sourceFile.getDefaultExportSymbol();
    if (defaultExport) {
      for (const decl of defaultExport.getDeclarations()) {
        const name = getComponentNameFromNode(decl);
        if (name && isImplementedComponent(decl, name)) {
          componentNames.add(name);
        }
      }
    }
  }

  return componentNames;
}

function isImplementedComponent(node: Node, name: string): boolean {
  if (!name || !/^[A-Z]/.test(name)) return false;
  if (Node.isExportSpecifier(node)) return false;

  const hasJsx = (text: string) =>
    text.includes("<") ||
    text.includes("jsx") ||
    text.includes("createElement");

  if (Node.isFunctionDeclaration(node)) {
    const body = node.getBody();
    if (body) return hasJsx(body.getText());
  }

  if (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) {
    return hasJsx(node.getText());
  }

  if (Node.isVariableDeclaration(node)) {
    const init = node.getInitializer();
    if (
      init &&
      (Node.isArrowFunction(init) || Node.isFunctionExpression(init))
    ) {
      return hasJsx(init.getText());
    }
  }

  return false;
}

function getComponentNameFromNode(node: Node): string | null {
  if (Node.isFunctionDeclaration(node)) {
    return node.getName() || null;
  }
  if (Node.isVariableDeclaration(node)) {
    return node.getName();
  }
  return null;
}

export interface CrossFileDebugInfo {
  projectJsxExports: {
    file: string;
    exports: {
      name: string;
      jsxReturned: string[];
      jsxInProps: Record<string, string[]>;
    }[];
  }[];
  enhancedUsage: {
    file: string;
    identifiersInComponent: Record<string, string[]>;
    inferredInComponent: Record<string, string[]>;
  }[];
}

function buildProjectJsxExports(
  project: Project,
  visited: Set<string>,
  targetPath: string,
): ProjectJsxExports {
  const byFile = new Map();

  for (const absPath of visited) {
    if (!absPath.endsWith(".tsx") && !absPath.endsWith(".jsx")) continue;

    const sourceFile = project.getSourceFile(absPath);
    if (!sourceFile) continue;

    const relPath = path.relative(targetPath, absPath);
    const jsxExports = extractJsxExports(sourceFile);

    if (jsxExports.length > 0) {
      byFile.set(relPath, jsxExports);
    }
  }

  return { byFile };
}

function computeInferredJsxForFile(
  sourceFile: SourceFile,
  projectJsxExports: ProjectJsxExports,
  targetPath: string,
): InferredJsxUsage[] {
  const resolvedImports = resolveJsxImports(
    sourceFile,
    projectJsxExports,
    targetPath,
  );
  return extractInferredJsx(sourceFile, resolvedImports);
}

function buildEnhancedJsxUsage(
  jsxUsage: JsxUsage,
  inferredJsx: InferredJsxUsage[],
): EnhancedJsxUsage {
  const inferredInComponent = new Map<string, string[]>();

  for (const [parentName, identifiers] of jsxUsage.identifiersInComponent) {
    for (const identifierName of identifiers) {
      const inference = inferredJsx.find(
        (i) => i.variableName === identifierName && i.propertyPath === null,
      );
      if (inference && inference.inferredComponents.length > 0) {
        const existing = inferredInComponent.get(parentName) || [];
        inferredInComponent.set(parentName, [
          ...new Set([...existing, ...inference.inferredComponents]),
        ]);
      }
    }
  }

  return {
    ...jsxUsage,
    inferredInComponent,
  };
}

export async function analyzeRoute(
  targetPath: string,
  route: string,
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
    targetPath,
  );

  const componentMap = new Map<string, ComponentInfo>();
  const componentByName = new Map<string, ComponentInfo>();
  const jsxUsageMap = new Map<string, JsxUsage>();
  const enhancedJsxUsageMap = new Map<string, EnhancedJsxUsage>();
  const nameToFileMap = new Map<string, string>();

  for (const absPath of visited) {
    if (absPath.endsWith(".tsx") || absPath.endsWith(".jsx")) {
      const sourceFile = project.getSourceFile(absPath);
      if (sourceFile) {
        const relPath = path.relative(targetPath, absPath);
        const allInfos = extractAllComponentsFromFile(sourceFile, relPath);
        if (allInfos.length > 0) {
          // Primary component for the file (used for componentMap, architecture analysis)
          componentMap.set(relPath, allInfos[0]);
          // All components indexed by name (for tree node lookup)
          for (const info of allInfos) {
            nameToFileMap.set(info.name, relPath);
            componentByName.set(info.name, info);
          }
        }
        const jsxUsage = extractJsxUsage(sourceFile);
        jsxUsageMap.set(relPath, jsxUsage);
      }
    }
  }

  const projectJsxExports = buildProjectJsxExports(
    project,
    visited,
    targetPath,
  );

  for (const absPath of visited) {
    if (absPath.endsWith(".tsx") || absPath.endsWith(".jsx")) {
      const sourceFile = project.getSourceFile(absPath);
      if (sourceFile) {
        const relPath = path.relative(targetPath, absPath);
        const jsxUsage = jsxUsageMap.get(relPath);
        if (jsxUsage) {
          const inferredJsx = computeInferredJsxForFile(
            sourceFile,
            projectJsxExports,
            targetPath,
          );
          const enhanced = buildEnhancedJsxUsage(jsxUsage, inferredJsx);
          enhancedJsxUsageMap.set(relPath, enhanced);
        }
      }
    }
  }

  const componentTree = buildComponentTree(
    entryFiles,
    targetPath,
    enhancedJsxUsageMap,
    nameToFileMap,
    componentMap,
    componentByName,
  );
  const allComponents = Array.from(componentByName.values());

  const architectureAnalysis = await buildArchitectureAnalysis(
    project,
    visited,
    componentMap,
    nameToFileMap,
    targetPath,
  );

  return {
    route: normalizedRoute,
    entryFiles,
    componentTree,
    allComponents,
    architectureAnalysis,
    stats: {
      totalComponents: allComponents.length,
      clientComponents: allComponents.filter((c) => c.isClientComponent).length,
      serverComponents: allComponents.filter((c) => c.isServerComponent).length,
      uniqueHooks: [...new Set(allComponents.flatMap((c) => c.hooks))],
    },
  };
}

async function buildArchitectureAnalysis(
  project: Project,
  visited: Set<string>,
  componentMap: Map<string, ComponentInfo>,
  nameToFileMap: Map<string, string>,
  targetPath: string,
): Promise<ArchitectureAnalysis> {
  const propPassingByFile = new Map<string, PropPassingInfo[]>();
  const noOpFunctions: ArchitectureAnalysis["noOpFunctions"] = [];
  const componentPropsMap = new Map<
    string,
    { name: string; file: string; props: string[] }
  >();

  for (const absPath of visited) {
    if (!absPath.endsWith(".tsx") && !absPath.endsWith(".jsx")) continue;

    const sourceFile = project.getSourceFile(absPath);
    if (!sourceFile) continue;

    const relPath = path.relative(targetPath, absPath);

    const propPassing = extractPropPassing(sourceFile);
    propPassingByFile.set(relPath, propPassing);

    const noOps = detectNoOpFunctions(sourceFile);
    for (const noOp of noOps) {
      noOpFunctions.push({
        name: noOp.name,
        file: path.relative(targetPath, noOp.file),
        renames: noOp.renames,
      });
    }

    const comp = componentMap.get(relPath);
    if (comp) {
      componentPropsMap.set(relPath, {
        name: comp.name,
        file: relPath,
        props: comp.props.map((p) => p.name),
      });
    }
  }

  const passThroughComponents = analyzePassThroughComponents(
    componentPropsMap,
    propPassingByFile,
  );

  const componentFiles = new Map<string, string>();
  for (const [file, comp] of componentMap) {
    componentFiles.set(comp.name, file);
  }

  const usageMap = buildComponentUsageMap(project, componentFiles, targetPath);
  const similarMap = findSimilarComponents(componentPropsMap);

  const projectWideUsageMap = await buildProjectWideUsageMap(
    targetPath,
    componentFiles,
  );

  const componentUsages: ArchitectureAnalysis["componentUsages"] = [];
  for (const [name, usage] of projectWideUsageMap) {
    componentUsages.push({
      componentName: name,
      file: usage.componentFile,
      usedInFiles: [...new Set(usage.usedIn.map((u) => u.file))],
      usedInComponents: [...new Set(usage.usedIn.map((u) => u.componentName))],
      pageContexts: usage.pageContexts,
      totalUsages: usage.totalUsageCount,
    });
  }

  const similarComponents: Record<
    string,
    ArchitectureAnalysis["similarComponents"][string]
  > = {};
  for (const [name, similar] of similarMap) {
    similarComponents[name] = similar.map((s) => ({
      name: s.name,
      file: s.file,
      similarity: s.similarity,
      sharedProps: s.sharedProps,
      reason: s.reason,
    }));
  }

  const smells: ArchitectureSmell[] = [];

  for (const passThrough of passThroughComponents) {
    smells.push({
      type: "pass-through",
      severity: "warning",
      message: `${passThrough.name} passes through ${passThrough.propsPassedThrough} of ${passThrough.propsReceived} props (${Math.round(passThrough.passThroughRatio * 100)}%)`,
      suggestion:
        "This component adds complexity without value. Consider removing from hierarchy or consolidating.",
      location: { file: passThrough.file },
      details: {
        propsReceived: passThrough.propsReceived,
        propsPassedThrough: passThrough.propsPassedThrough,
      },
    });
  }

  for (const noOp of noOpFunctions) {
    const renameStr = Object.entries(noOp.renames)
      .map(([from, to]) => `${from}→${to}`)
      .join(", ");
    smells.push({
      type: "no-op-function",
      severity: "warning",
      message: `${noOp.name}() only renames fields: ${renameStr}`,
      suggestion: "Delete this function and use the original field names",
      location: { file: noOp.file },
      details: { renames: noOp.renames },
    });
  }

  for (const [name, similar] of similarMap) {
    if (similar.length > 0 && similar[0].similarity > 0.7) {
      smells.push({
        type: "similar-components",
        severity: "info",
        message: `${name} is similar to ${similar.map((s) => s.name).join(", ")}`,
        suggestion: "Consider unifying these components to reduce duplication",
        location: { file: componentFiles.get(name) || "" },
        details: {
          similarComponents: similar.map((s) => ({
            name: s.name,
            similarity: s.similarity,
          })),
        },
      });
    }
  }

  const propFlows = buildPropFlows(
    componentMap,
    propPassingByFile,
    nameToFileMap,
  );
  const propUpwardFlows = buildPropUpwardFlows(
    componentMap,
    projectWideUsageMap,
    propPassingByFile,
  );

  return {
    smells,
    propLineages: [],
    componentUsages,
    similarComponents,
    propFlows,
    propUpwardFlows,
    passThroughComponents: passThroughComponents.map((p) => ({
      name: p.name,
      file: p.file,
      propsReceived: p.propsReceived,
      propsPassedThrough: p.propsPassedThrough,
      ratio: p.passThroughRatio,
    })),
    noOpFunctions,
  };
}

function buildPropFlows(
  componentMap: Map<string, ComponentInfo>,
  propPassingByFile: Map<string, PropPassingInfo[]>,
  nameToFileMap: Map<string, string>,
): Record<string, PropFlowTree[]> {
  const result: Record<string, PropFlowTree[]> = {};

  for (const [file, comp] of componentMap) {
    const flows: PropFlowTree[] = [];
    const propPassing = propPassingByFile.get(file) || [];

    for (const propInfo of comp.props) {
      const propName = propInfo.name;

      const origin = detectPropOrigin(
        comp,
        propName,
        propPassingByFile,
        nameToFileMap,
        componentMap,
      );

      const rootNode: PropFlowNode = {
        id: `${comp.name}.${propName}`,
        componentName: comp.name,
        file,
        propName,
        fullPath: propName,
        children: [],
      };

      buildPropTree(
        rootNode,
        propName,
        propPassing,
        propPassingByFile,
        nameToFileMap,
        file,
        0,
      );

      if (rootNode.children.length > 0 || origin.type !== "prop") {
        flows.push({
          propName,
          componentName: comp.name,
          origin,
          root: rootNode,
        });
      }
    }

    if (flows.length > 0) {
      result[comp.name] = flows;
    }
  }

  return result;
}

function buildPropTree(
  node: PropFlowNode,
  sourcePropName: string,
  propPassing: PropPassingInfo[],
  propPassingByFile: Map<string, PropPassingInfo[]>,
  nameToFileMap: Map<string, string>,
  parentFile: string,
  depth: number,
): void {
  if (depth > 3) return;

  const childPasses = propPassing.filter((p) => {
    if (p.sourceType !== "prop" && p.sourceType !== "destructure") return false;

    const source = p.sourcePropName || p.sourceExpression;
    const rootProp = source.split(".")[0];
    return rootProp === sourcePropName;
  });

  for (const childPass of childPasses) {
    const childFile = nameToFileMap.get(childPass.componentName);
    const source = childPass.sourcePropName || childPass.sourceExpression;
    const isPropertyAccess = source.includes(".");

    const childNode: PropFlowNode = {
      id: `${childPass.componentName}.${childPass.propName}`,
      componentName: childPass.componentName,
      file: childFile || "",
      propName: childPass.propName,
      fullPath: isPropertyAccess
        ? source
        : source !== childPass.propName
          ? `${source} → ${childPass.propName}`
          : source,
      line: childPass.line,
      parentFile,
      children: [],
    };

    node.children.push(childNode);

    if (childFile && depth < 3) {
      const grandchildPassing = propPassingByFile.get(childFile) || [];
      buildPropTree(
        childNode,
        childPass.propName,
        grandchildPassing,
        propPassingByFile,
        nameToFileMap,
        childFile,
        depth + 1,
      );
    }
  }
}

function detectPropOrigin(
  comp: ComponentInfo,
  propName: string,
  propPassingByFile: Map<string, PropPassingInfo[]>,
  nameToFileMap: Map<string, string>,
  componentMap: Map<string, ComponentInfo>,
): PropOriginInfo {
  if (comp.serverQueries && comp.serverQueries.length > 0) {
    for (const query of comp.serverQueries) {
      if (query.toLowerCase().includes(propName.toLowerCase())) {
        return { type: "query", name: query, detail: "Server query" };
      }
    }
  }

  if (comp.hooks && comp.hooks.length > 0) {
    for (const hook of comp.hooks) {
      if (hook.toLowerCase().includes(propName.toLowerCase())) {
        return { type: "hook", name: hook };
      }
    }
  }

  for (const [parentFile, parentComp] of componentMap) {
    const parentPassing = propPassingByFile.get(parentFile) || [];
    for (const pass of parentPassing) {
      if (pass.componentName === comp.name && pass.propName === propName) {
        const source = pass.sourcePropName || pass.sourceExpression;
        if (pass.sourceType === "hook") {
          return { type: "hook", name: pass.sourceHookName || source };
        }
        if (pass.sourceType === "prop") {
          return { type: "prop", name: `${parentComp.name}.${source}` };
        }
        if (pass.sourceType === "literal") {
          return { type: "literal", name: source };
        }
        return { type: "computed", name: source };
      }
    }
  }

  return { type: "prop", name: "parent" };
}

function buildComponentTree(
  entryFiles: RouteAnalysis["entryFiles"],
  targetPath: string,
  jsxUsageMap: Map<string, EnhancedJsxUsage>,
  nameToFileMap: Map<string, string>,
  componentMap: Map<string, ComponentInfo>,
  componentByName: Map<string, ComponentInfo>,
): ComponentTreeNode[] {
  function getDirectJsxFromFile(file: string): string[] {
    const jsxUsage = jsxUsageMap.get(file);
    if (!jsxUsage) return [];
    return jsxUsage.directChildren;
  }

  function getAllProjectComponentsFromFile(file: string): string[] {
    const jsxUsage = jsxUsageMap.get(file);
    if (!jsxUsage) return [];

    const allComponents = new Set<string>();

    for (const name of jsxUsage.directChildren) {
      if (nameToFileMap.has(name)) {
        allComponents.add(name);
      }
    }

    // For project components nested under non-project wrappers (e.g. <Route element={<Index />}>),
    // walk through the nesting hierarchy and collect them.
    // We only skip if the immediate parent is already a collected project component.
    const collected = new Set<string>(allComponents);

    function collectFromNonProjectParent(parentName: string) {
      const nested = jsxUsage!.nestedInComponent.get(parentName);
      if (!nested) return;
      for (const childName of nested) {
        if (nameToFileMap.has(childName)) {
          if (!collected.has(childName)) {
            allComponents.add(childName);
            collected.add(childName);
          }
        } else {
          // Recurse through non-project wrapper components
          collectFromNonProjectParent(childName);
        }
      }
    }

    for (const [parentName] of jsxUsage.nestedInComponent) {
      if (!nameToFileMap.has(parentName) && !collected.has(parentName)) {
        collectFromNonProjectParent(parentName);
      }
    }

    return Array.from(allComponents);
  }

  function getInferredChildrenForComponent(
    file: string,
    componentName: string,
  ): string[] {
    const jsxUsage = jsxUsageMap.get(file);
    if (!jsxUsage) return [];
    return jsxUsage.inferredInComponent.get(componentName) || [];
  }

  function getRenderCondition(
    file: string,
    parentComponentName: string | null,
    childName: string,
  ): ComponentTreeNode["renderCondition"] {
    const jsxUsage = jsxUsageMap.get(file);
    if (!jsxUsage?.conditionalChildren) return undefined;
    
    const key = parentComponentName || "__direct__";
    const conditions = jsxUsage.conditionalChildren.get(key);
    if (!conditions) return undefined;
    
    const match = conditions.find((c) => c.component === childName);
    if (!match) return undefined;
    
    return { expression: match.expression, branch: match.branch };
  }

  // Circular detection uses component names (not file paths) because
  // multiple components can be exported from the same file (e.g. shadcn UI).
  function isCircular(childName: string, childFile: string, visited: Set<string>): boolean {
    // Use "componentName@file" as the key to detect true circular references
    const key = `${childName}@${childFile}`;
    return visited.has(key);
  }

  function addToPath(name: string | null, file: string, visited: Set<string>): Set<string> {
    const next = new Set(visited);
    if (name) next.add(`${name}@${file}`);
    // Also add the bare file for entry-point files (no component name)
    else next.add(`@${file}`);
    return next;
  }

  function buildFromFile(
    file: string,
    callerJsxUsage: EnhancedJsxUsage | null,
    fromComponentName: string | null,
    ancestorPath: Set<string>,
  ): ComponentTreeNode {
    const myKey = fromComponentName ? `${fromComponentName}@${file}` : `@${file}`;
    if (ancestorPath.has(myKey)) {
      return {
        file: `${file} (circular)`,
        component: componentMap.get(file) || null,
        children: [],
      };
    }
    const currentPath = addToPath(fromComponentName, file, ancestorPath);

    const children: ComponentTreeNode[] = [];
    const fileJsxUsage = jsxUsageMap.get(file);

    const passedAsChildren =
      fromComponentName && callerJsxUsage
        ? callerJsxUsage.nestedInComponent.get(fromComponentName) || []
        : [];

    for (const childName of passedAsChildren) {
      const childFile = nameToFileMap.get(childName);
      if (childFile && !isCircular(childName, childFile, currentPath)) {
        const nestedInChild =
          callerJsxUsage?.nestedInComponent.get(childName) || [];
        children.push(
          buildWithPassedChildren(
            childFile,
            childName,
            nestedInChild,
            callerJsxUsage,
            currentPath,
          ),
        );
      }
    }

    if (fromComponentName && callerJsxUsage) {
      const inferredChildren =
        callerJsxUsage.inferredInComponent.get(fromComponentName) || [];
      for (const childName of inferredChildren) {
        const childFile = nameToFileMap.get(childName);
        if (childFile && !isCircular(childName, childFile, currentPath)) {
          children.push(
            buildFromFile(
              childFile,
              fileJsxUsage || null,
              childName,
              currentPath,
            ),
          );
        }
      }
    }

    const allProjectComponents = getAllProjectComponentsFromFile(file);
    for (const childName of allProjectComponents) {
      const alreadyAdded = children.some(
        (c) => c.component?.name === childName || c.file.includes(childName),
      );
      if (alreadyAdded) continue;

      const childFile = nameToFileMap.get(childName);
      if (childFile && !isCircular(childName, childFile, currentPath)) {
        const childNode = buildFromFile(
          childFile,
          fileJsxUsage || null,
          childName,
          currentPath,
        );

        const condition = getRenderCondition(file, null, childName);
        if (condition) {
          childNode.renderCondition = condition;
        }

        children.push(childNode);
      }
    }

    const comp = fromComponentName
      ? componentByName.get(fromComponentName) || componentMap.get(file) || null
      : componentMap.get(file) || null;
    return { file, component: comp, children };
  }

  function buildWithPassedChildren(
    file: string,
    componentName: string,
    passedChildren: string[],
    callerJsxUsage: EnhancedJsxUsage | null,
    ancestorPath: Set<string>,
  ): ComponentTreeNode {
    const myKey = `${componentName}@${file}`;
    if (ancestorPath.has(myKey)) {
      return {
        file: `${file} (circular)`,
        component: componentMap.get(file) || null,
        children: [],
      };
    }
    const currentPath = addToPath(componentName, file, ancestorPath);

    const children: ComponentTreeNode[] = [];
    const fileJsxUsage = jsxUsageMap.get(file);

    for (const childName of passedChildren) {
      const childFile = nameToFileMap.get(childName);
      if (childFile && !isCircular(childName, childFile, currentPath)) {
        const nestedInChild =
          callerJsxUsage?.nestedInComponent.get(childName) || [];
        children.push(
          buildWithPassedChildren(
            childFile,
            childName,
            nestedInChild,
            callerJsxUsage,
            currentPath,
          ),
        );
      }
    }

    if (callerJsxUsage) {
      const inferredChildren =
        callerJsxUsage.inferredInComponent.get(componentName) || [];
      for (const childName of inferredChildren) {
        const childFile = nameToFileMap.get(childName);
        if (childFile && !isCircular(childName, childFile, currentPath)) {
          children.push(
            buildFromFile(
              childFile,
              fileJsxUsage || null,
              childName,
              currentPath,
            ),
          );
        }
      }
    }

    const allProjectComponents = getAllProjectComponentsFromFile(file);
    for (const childName of allProjectComponents) {
      const alreadyAdded = children.some(
        (c) => c.component?.name === childName || c.file.includes(childName),
      );
      if (alreadyAdded) continue;

      const childFile = nameToFileMap.get(childName);
      if (childFile && !isCircular(childName, childFile, currentPath)) {
        const childNode = buildFromFile(
          childFile,
          fileJsxUsage || null,
          childName,
          currentPath,
        );

        const condition = getRenderCondition(file, null, childName);
        if (condition) {
          childNode.renderCondition = condition;
        }

        children.push(childNode);
      }
    }

    const comp = componentByName.get(componentName) || componentMap.get(file) || null;
    return { file, component: comp, children };
  }

  const buildNode = (
    absPath: string,
    childSlot: ComponentTreeNode | null,
    ancestorPath: Set<string>,
  ): ComponentTreeNode => {
    const file = path.relative(targetPath, absPath);
    const node = buildFromFile(file, null, null, ancestorPath);

    if (childSlot) {
      node.children.push({
        file: "{children}",
        component: null,
        children: [childSlot],
      });
    }

    return node;
  };

  let innermost: ComponentTreeNode | null = null;
  const rootPath = new Set<string>();

  if (entryFiles.page) innermost = buildNode(entryFiles.page, null, rootPath);
  for (let i = entryFiles.layouts.length - 1; i >= 0; i--) {
    innermost = buildNode(entryFiles.layouts[i], innermost, rootPath);
  }

  const result: ComponentTreeNode[] = [];
  if (innermost) result.push(innermost);
  if (entryFiles.loading)
    result.push(buildNode(entryFiles.loading, null, rootPath));
  if (entryFiles.error)
    result.push(buildNode(entryFiles.error, null, rootPath));
  if (entryFiles.notFound)
    result.push(buildNode(entryFiles.notFound, null, rootPath));

  return result;
}

export async function analyzeFileTree(
  targetPath: string,
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
    relativeTo: string,
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
        : a.name.localeCompare(b.name),
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
  targetPath: string,
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
  targetPath: string,
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

export async function analyzeScreenDeps(
  targetPath: string,
): Promise<ScreenDepsAnalysis> {
  const appDirs = ["app", "src/app"];
  let appDir: string | null = null;

  for (const dir of appDirs) {
    const fullDir = path.join(targetPath, dir);
    if (await fileExists(fullDir)) {
      appDir = fullDir;
      break;
    }
  }

  if (!appDir) {
    return {
      screens: [],
      sharedComponents: [],
      stats: {
        totalScreens: 0,
        totalUniqueComponents: 0,
        totalSharedComponents: 0,
      },
    };
  }

  const pageFiles = await glob("**/page.{tsx,jsx,ts,js}", {
    cwd: appDir,
    ignore: ["node_modules/**", ".next/**"],
    absolute: false,
  });

  const tsConfigPath = path.join(targetPath, "tsconfig.json");
  const hasTsConfig = await fileExists(tsConfigPath);

  const project = new Project({
    tsConfigFilePath: hasTsConfig ? tsConfigPath : undefined,
    compilerOptions: { allowJs: true, jsx: 2 },
    skipAddingFilesFromTsConfig: true,
  });

  const screenRoute = (pagePath: string): string => {
    const route = pagePath
      .replace(/\/page\.(tsx|jsx|ts|js)$/, "")
      .replace(/\([\w-]+\)\//g, "");
    return `/${route}` || "/";
  };

  const componentToScreens = new Map<string, Set<string>>();
  const componentFileMap = new Map<string, string>();
  const screens: ScreenDeps[] = [];

  for (const pageFile of pageFiles) {
    const absPagePath = path.join(appDir, pageFile);
    const route = screenRoute(pageFile);

    project.addSourceFileAtPath(absPagePath);

    const { visited } = buildImportGraph(project, [absPagePath], targetPath);

    const screenComponents: ScreenComponentRef[] = [];

    for (const absPath of visited) {
      if (!absPath.endsWith(".tsx") && !absPath.endsWith(".jsx")) continue;

      const sourceFile = project.getSourceFile(absPath);
      if (!sourceFile) continue;

      const relPath = path.relative(targetPath, absPath);
      const info = extractComponentFromFile(sourceFile, relPath);
      if (!info) continue;

      screenComponents.push({ name: info.name, filePath: relPath });

      if (!componentFileMap.has(info.name)) {
        componentFileMap.set(info.name, relPath);
      }

      const existing = componentToScreens.get(info.name) ?? new Set<string>();
      existing.add(route);
      componentToScreens.set(info.name, existing);
    }

    screens.push({
      screen: route,
      pagePath: path.relative(targetPath, absPagePath),
      components: screenComponents,
    });
  }

  const sharedComponents: SharedComponentEntry[] = [];
  for (const [name, screenSet] of componentToScreens) {
    if (screenSet.size < 2) continue;

    const filePath = componentFileMap.get(name) ?? "";
    const usedByScreens = [...screenSet].sort();

    sharedComponents.push({
      name,
      filePath,
      usedByScreens,
      usageCount: usedByScreens.length,
    });
  }

  sharedComponents.sort((a, b) => b.usageCount - a.usageCount);

  return {
    screens: screens.sort((a, b) => a.screen.localeCompare(b.screen)),
    sharedComponents,
    stats: {
      totalScreens: screens.length,
      totalUniqueComponents: componentFileMap.size,
      totalSharedComponents: sharedComponents.length,
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
