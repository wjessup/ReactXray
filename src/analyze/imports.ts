import { Project, SourceFile, Node } from "ts-morph";
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
    // Skip explicit type-only imports
    if (decl.isTypeOnly()) continue;

    const namedImports = decl.getNamedImports();
    const defaultImport = decl.getDefaultImport();
    const namespaceImport = decl.getNamespaceImport();

    // Strategy: If every imported item resolves to a Type/Interface, treat the whole import as type-only.
    // This handles cases like `import { ManageRouter }` where ManageRouter is an `export type`.
    
    // We only apply this check if there are no side-effect imports (which have no named/default/namespace).
    // If namedImports is empty and no default/namespace, it might be `import "side-effect"`.
    const isSideEffect = namedImports.length === 0 && !defaultImport && !namespaceImport;

    if (!isSideEffect) {
      let allAreTypes = true;
      const resolvedSourceFile = decl.getModuleSpecifierSourceFile();

      if (resolvedSourceFile) {
        // Check named imports
        if (namedImports.length > 0) {
          for (const named of namedImports) {
            if (named.isTypeOnly()) continue;

            const importText = named.getText();
            const exportName = importText.includes(" as ") 
              ? importText.split(" as ")[0].trim() 
              : named.getNameNode().getText();
            const exportedDecls = resolvedSourceFile.getExportedDeclarations().get(exportName);
            
            if (!exportedDecls || exportedDecls.length === 0) {
              // Can't find export, safe default to "value"
              allAreTypes = false;
              break;
            }

            const isType = exportedDecls.every(d => 
              Node.isTypeAliasDeclaration(d) || 
              Node.isInterfaceDeclaration(d)
            );

            if (!isType) {
              allAreTypes = false;
              break;
            }
          }
        }

        // Check default import
        if (allAreTypes && defaultImport) {
             const exportedDecls = resolvedSourceFile.getExportedDeclarations().get("default");
             if (!exportedDecls || exportedDecls.length === 0) {
               allAreTypes = false;
             } else {
               const isType = exportedDecls.every(d => 
                 Node.isTypeAliasDeclaration(d) || 
                 Node.isInterfaceDeclaration(d)
               );
               if (!isType) allAreTypes = false;
             }
        }
        
        // Namespace import (import * as ns) is generally used for values, but could be for types.
        // It's harder to check because `ns` contains everything.
        // We'll assume namespace import is a value dependency for now unless it's `import type *`.
        if (namespaceImport && !decl.isTypeOnly()) {
            allAreTypes = false;
        }

      } else {
        // Could not resolve source file -> assume value dependency
        allAreTypes = false;
      }

      if (allAreTypes) continue;
    }

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
