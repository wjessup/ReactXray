import fs from "fs/promises";
import path from "path";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  extension?: string;
  children?: FileNode[];
}

interface FileTreeAnalysis {
  root: FileNode;
  stats: {
    totalFiles: number;
    totalDirectories: number;
    totalSize: number;
    byExtension: Record<string, number>;
  };
}

const IGNORE_PATTERNS = [
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

async function buildTree(
  dirPath: string,
  relativeTo: string,
  stats: FileTreeAnalysis["stats"]
): Promise<FileNode> {
  const name = path.basename(dirPath);
  const relativePath = path.relative(relativeTo, dirPath) || ".";
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  const children: FileNode[] = [];

  for (const entry of entries) {
    if (IGNORE_PATTERNS.includes(entry.name) || entry.name.startsWith(".")) {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.relative(relativeTo, fullPath);

    if (entry.isDirectory()) {
      stats.totalDirectories++;
      const childNode = await buildTree(fullPath, relativeTo, stats);
      children.push(childNode);
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

  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return {
    name,
    path: relativePath,
    type: "directory",
    children,
  };
}

export async function analyzeFileTree(targetPath: string): Promise<FileTreeAnalysis> {
  const stats: FileTreeAnalysis["stats"] = {
    totalFiles: 0,
    totalDirectories: 0,
    totalSize: 0,
    byExtension: {},
  };

  const root = await buildTree(targetPath, targetPath, stats);

  return { root, stats };
}
