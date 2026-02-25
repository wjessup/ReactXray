import path from "path";
import { analyzeRoute } from "./analyze/index.js";
import type { ComponentTreeNode } from "./types.js";

function printTree(nodes: ComponentTreeNode[], indent = 0): void {
  const pad = "  ".repeat(indent);
  for (const node of nodes) {
    const name = node.component?.name || path.basename(node.file, path.extname(node.file));
    const isClient = node.component?.isClientComponent ? " [client]" : "";
    const condition = node.renderCondition
      ? ` (if ${node.renderCondition.expression} === ${node.renderCondition.branch})`
      : "";
    const usage = node.usageLine ? ` @ line ${node.usageLine}` : "";
    const filePath = node.component?.filePath || node.file;
    console.log(`${pad}├─ ${name}${isClient}${condition}${usage}  (${filePath})`);
    if (node.children.length > 0) {
      printTree(node.children, indent + 1);
    }
  }
}

async function debugTree(targetPath: string, route: string) {
  const resolvedPath = path.resolve(targetPath);
  console.log("\n=== DEBUG TREE ANALYSIS ===\n");
  console.log(`Target: ${resolvedPath}`);
  console.log(`Route:  ${route}\n`);

  const result = await analyzeRoute(resolvedPath, route);

  console.log(`Route:      ${result.route}`);
  console.log(`Components: ${result.stats.totalComponents}`);
  console.log(`Tree nodes: ${countNodes(result.componentTree)}\n`);

  console.log("=== COMPONENT TREE ===\n");
  printTree(result.componentTree);

  console.log("\n=== ALL COMPONENTS ===\n");
  for (const comp of result.allComponents) {
    const client = comp.isClientComponent ? " [client]" : " [server]";
    console.log(`  ${comp.name}${client}  ${comp.filePath}`);
    if (comp.props && comp.props.length > 0) {
      console.log(`    props: ${comp.props.map((p) => p.name + (p.optional ? "?" : "")).join(", ")}`);
    }
  }

  console.log("\n=== DUPLICATE COMPONENT NAMES IN TREE ===\n");
  const nameCount = new Map<string, { paths: string[] }>();
  collectNamePaths(result.componentTree, [], nameCount);
  for (const [name, info] of nameCount) {
    if (info.paths.length > 1) {
      console.log(`  ${name} (x${info.paths.length}):`);
      for (const p of info.paths) {
        console.log(`    └─ ${p}`);
      }
    }
  }

  if (result.architectureAnalysis) {
    console.log("\n=== ARCHITECTURE ===\n");
    if (result.architectureAnalysis.smells.length > 0) {
      console.log("  Smells:");
      for (const s of result.architectureAnalysis.smells) {
        console.log(`    ⚠ [${s.severity}] ${s.type}: ${s.message} (${s.location.file})`);
      }
    }
    if (result.architectureAnalysis.passThroughComponents.length > 0) {
      console.log("  Pass-through components:");
      for (const pt of result.architectureAnalysis.passThroughComponents) {
        console.log(`    ${pt.name}  ${pt.propsPassedThrough}/${pt.propsReceived} props passed through (${(pt.ratio * 100).toFixed(0)}%)`);
      }
    }
  }
}

function countNodes(nodes: ComponentTreeNode[]): number {
  let count = nodes.length;
  for (const n of nodes) count += countNodes(n.children);
  return count;
}

function collectNamePaths(
  nodes: ComponentTreeNode[],
  ancestry: string[],
  result: Map<string, { paths: string[] }>,
): void {
  for (const node of nodes) {
    const name = node.component?.name;
    if (name) {
      const fullPath = [...ancestry, name].join(" > ");
      if (!result.has(name)) result.set(name, { paths: [] });
      result.get(name)!.paths.push(fullPath);
    }
    collectNamePaths(node.children, [...ancestry, name || "?"], result);
  }
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log("Usage: npx tsx src/debug-tree.ts <project-path> <route>");
  console.log("Example: npx tsx src/debug-tree.ts ~/code/my-app /");
  process.exit(1);
}

debugTree(args[0], args[1]).catch(console.error);
