import madge from "madge";
import path from "path";
import fs from "fs";

interface DependencyNode {
  file: string;
  imports: string[];
}

interface DependencyAnalysis {
  graph: DependencyNode[];
  circular: string[][];
  orphans: string[];
  warnings: string[];
  stats: {
    totalFiles: number;
    totalImports: number;
    circularCount: number;
    orphanCount: number;
  };
}

export async function analyzeDependencies(
  targetPath: string
): Promise<DependencyAnalysis> {
  const tsConfigPath = path.join(targetPath, "tsconfig.json");
  const hasTsConfig = fs.existsSync(tsConfigPath);

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
  const circular = result.circular();
  const orphans = result.orphans();
  const warnings = result.warnings();

  const graph: DependencyNode[] = Object.entries(graphObj).map(
    ([file, imports]) => ({
      file,
      imports: imports as string[],
    })
  );

  const totalImports = graph.reduce(
    (sum, node) => sum + node.imports.length,
    0
  );

  return {
    graph,
    circular,
    orphans,
    warnings: Object.values(warnings).flat() as string[],
    stats: {
      totalFiles: graph.length,
      totalImports,
      circularCount: circular.length,
      orphanCount: orphans.length,
    },
  };
}
