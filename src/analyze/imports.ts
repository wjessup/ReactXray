import { Project, SourceFile } from "ts-morph";
import path from "path";

export function getFileImports(sourceFile: SourceFile, targetPath: string): string[] {
  const imports: string[] = [];

  for (const decl of sourceFile.getImportDeclarations()) {
    const specifier = decl.getModuleSpecifierValue();
    if (specifier.startsWith(".") || specifier.startsWith("@/")) {
      const resolved = decl.getModuleSpecifierSourceFile();
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
  targetPath: string
): { visited: Set<string>; graph: Map<string, string[]> } {
  const visited = new Set<string>();
  const graph = new Map<string, string[]>();

  const processFile = (filePath: string) => {
    if (visited.has(filePath)) return;
    visited.add(filePath);

    let sourceFile = project.getSourceFile(filePath);
    if (!sourceFile) {
      const ext = path.extname(filePath);
      if ([".tsx", ".ts", ".jsx", ".js"].includes(ext)) {
        try {
          sourceFile = project.addSourceFileAtPath(filePath);
        } catch {
          return;
        }
      }
    }
    if (!sourceFile) return;

    const imports = getFileImports(sourceFile, targetPath);
    graph.set(path.relative(targetPath, filePath), imports.map((i) => path.relative(targetPath, i)));

    for (const imp of imports) {
      processFile(imp);
    }
  };

  for (const entry of entryPaths) {
    processFile(entry);
  }

  return { visited, graph };
}
