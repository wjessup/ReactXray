import { Project, SourceFile } from "ts-morph";
import path from "path";
import fs from "fs";
import type { ProjectJsxExports, ResolvedJsxImport } from "../types.js";

const EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

function resolveImportPath(specifier: string, fromFile: string, targetPath: string): string | null {
  let basePath: string;
  
  if (specifier.startsWith("@/")) {
    basePath = path.join(targetPath, "src", specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    basePath = path.resolve(path.dirname(fromFile), specifier);
  } else {
    return null;
  }

  if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) {
    return basePath;
  }

  for (const ext of EXTENSIONS) {
    const withExt = basePath + ext;
    if (fs.existsSync(withExt)) return withExt;
  }

  for (const ext of EXTENSIONS) {
    const indexFile = path.join(basePath, `index${ext}`);
    if (fs.existsSync(indexFile)) return indexFile;
  }

  return null;
}

export function getFileImports(sourceFile: SourceFile, targetPath: string): string[] {
  const imports: string[] = [];
  const filePath = sourceFile.getFilePath();

  for (const decl of sourceFile.getImportDeclarations()) {
    const specifier = decl.getModuleSpecifierValue();
    if (specifier.startsWith(".") || specifier.startsWith("@/")) {
      let resolved = decl.getModuleSpecifierSourceFile();
      
      if (!resolved) {
        const manualResolved = resolveImportPath(specifier, filePath, targetPath);
        if (manualResolved) {
          imports.push(manualResolved);
          continue;
        }
      }
      
      if (resolved && !resolved.getFilePath().includes("node_modules")) {
        imports.push(resolved.getFilePath());
      }
    }
  }

  return imports;
}

export function buildImportGraph(
  project: Project,
  entryPaths: string[],
  targetPath: string,
  maxFiles: number = 1000
): { visited: Set<string>; graph: Map<string, string[]> } {
  const visited = new Set<string>();
  const graph = new Map<string, string[]>();
  const queue: string[] = [...entryPaths];

  while (queue.length > 0 && visited.size < maxFiles) {
    const filePath = queue.shift()!;
    if (visited.has(filePath)) continue;
    visited.add(filePath);

    let sourceFile = project.getSourceFile(filePath);
    if (!sourceFile) {
      const ext = path.extname(filePath);
      if ([".tsx", ".ts", ".jsx", ".js"].includes(ext)) {
        try {
          sourceFile = project.addSourceFileAtPath(filePath);
        } catch {
          continue;
        }
      }
    }
    if (!sourceFile) continue;

    const imports = getFileImports(sourceFile, targetPath);
    graph.set(path.relative(targetPath, filePath), imports.map((i) => path.relative(targetPath, i)));

    for (const imp of imports) {
      if (!visited.has(imp)) {
        queue.push(imp);
      }
    }
  }

  return { visited, graph };
}

export function resolveJsxImports(
  sourceFile: SourceFile,
  projectJsxExports: ProjectJsxExports,
  targetPath: string
): ResolvedJsxImport[] {
  const result: ResolvedJsxImport[] = [];
  const filePath = sourceFile.getFilePath();

  for (const decl of sourceFile.getImportDeclarations()) {
    const specifier = decl.getModuleSpecifierValue();
    if (!specifier.startsWith(".") && !specifier.startsWith("@/")) continue;

    let resolvedPath: string | undefined = decl.getModuleSpecifierSourceFile()?.getFilePath();
    if (!resolvedPath) {
      resolvedPath = resolveImportPath(specifier, filePath, targetPath) || undefined;
    }
    if (!resolvedPath || resolvedPath.includes("node_modules")) continue;

    const relPath = path.relative(targetPath, resolvedPath);
    const fileExports = projectJsxExports.byFile.get(relPath);
    if (!fileExports || fileExports.length === 0) continue;

    const namedImports = decl.getNamedImports();
    for (const namedImport of namedImports) {
      const importedName = namedImport.getName();
      const aliasNode = namedImport.getAliasNode();
      const localName = aliasNode ? aliasNode.getText() : importedName;

      const matchingExport = fileExports.find((e) => e.exportName === importedName);
      if (matchingExport) {
        result.push({
          localName,
          sourceFile: relPath,
          jsxExport: matchingExport,
        });
      }
    }

    const defaultImport = decl.getDefaultImport();
    if (defaultImport) {
      const localName = defaultImport.getText();
      const defaultExport = fileExports.find((e) => e.exportName === "default");
      if (defaultExport) {
        result.push({
          localName,
          sourceFile: relPath,
          jsxExport: defaultExport,
        });
      }
    }
  }

  return result;
}
