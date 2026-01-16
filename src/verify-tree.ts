import { Project, Node } from "ts-morph";
import * as fs from "fs";
import * as path from "path";

interface TreeNode {
  file: string;
  component?: {
    name: string;
    filePath?: string;
  };
  children?: TreeNode[];
}

interface Discrepancy {
  component: string;
  file: string;
  issue: string;
  expected: string[];
  actual: string[];
}

function getJsxTagName(node: Node): string | null {
  if (Node.isJsxElement(node)) {
    const opening = node.getOpeningElement();
    const tagNameNode = opening.getTagNameNode();
    return tagNameNode.getText();
  }
  if (Node.isJsxSelfClosingElement(node)) {
    return node.getTagNameNode().getText();
  }
  return null;
}

function isCapitalized(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function buildProjectComponentSet(nodes: TreeNode[]): Set<string> {
  const set = new Set<string>();
  function traverse(node: TreeNode) {
    if (node.component?.name) {
      set.add(node.component.name);
    }
    if (node.children) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }
  for (const node of nodes) {
    traverse(node);
  }
  return set;
}

let projectComponents: Set<string> = new Set();

function isProjectComponent(name: string): boolean {
  return projectComponents.has(name);
}

function extractDirectJsxChildren(node: Node): string[] {
  const children: string[] = [];

  function traverse(n: Node) {
    const tagName = getJsxTagName(n);

    if (tagName && isCapitalized(tagName)) {
      if (isProjectComponent(tagName)) {
        children.push(tagName);
        return;
      }
    }

    if (Node.isJsxElement(n)) {
      for (const child of n.getJsxChildren()) {
        traverse(child);
      }
    } else if (Node.isJsxFragment(n)) {
      for (const child of n.getJsxChildren()) {
        traverse(child);
      }
    }

    if (!tagName) {
      n.forEachChild(traverse);
    }
  }

  traverse(node);
  return children;
}

function getComponentJsxChildren(
  project: Project,
  filePath: string,
  componentName: string
): string[] {
  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) return [];

  const children: string[] = [];

  const functions = [
    ...sourceFile.getFunctions(),
    ...sourceFile.getVariableDeclarations(),
  ];

  for (const fn of functions) {
    const name = fn.getName();
    if (name !== componentName && name !== "default") continue;

    let body: Node | undefined;

    if (Node.isFunctionDeclaration(fn) || Node.isFunctionExpression(fn)) {
      body = fn.getBody();
    } else if (Node.isVariableDeclaration(fn)) {
      const init = fn.getInitializer();
      if (Node.isArrowFunction(init) || Node.isFunctionExpression(init)) {
        body = init.getBody();
      }
    }

    if (!body) continue;

    body.forEachDescendant((node) => {
      if (Node.isReturnStatement(node) || Node.isParenthesizedExpression(node)) {
        const jsxChild = node.getFirstDescendant(
          (n) => Node.isJsxElement(n) || Node.isJsxFragment(n) || Node.isJsxSelfClosingElement(n)
        );
        if (jsxChild) {
          children.push(...extractDirectJsxChildren(jsxChild));
        }
      }
    });

    if (Node.isJsxElement(body) || Node.isJsxFragment(body)) {
      children.push(...extractDirectJsxChildren(body));
    }
  }

  const exportDefault = sourceFile.getDefaultExportSymbol();
  if (exportDefault && children.length === 0) {
    const decl = exportDefault.getDeclarations()[0];
    if (decl) {
      decl.forEachDescendant((node) => {
        if (Node.isReturnStatement(node)) {
          const jsxChild = node.getFirstDescendant(
            (n) => Node.isJsxElement(n) || Node.isJsxFragment(n)
          );
          if (jsxChild) {
            children.push(...extractDirectJsxChildren(jsxChild));
          }
        }
      });
    }
  }

  return [...new Set(children)];
}

function getTreeChildren(node: TreeNode): string[] {
  if (!node.children) return [];
  return node.children
    .map((c) => c.component?.name)
    .filter((n): n is string => !!n && n !== "{children}");
}

function verifyNode(
  project: Project,
  projectRoot: string,
  node: TreeNode,
  discrepancies: Discrepancy[]
) {
  if (!node.component?.name || !node.component?.filePath) return;

  const fullPath = path.join(projectRoot, node.component.filePath);
  if (!fs.existsSync(fullPath)) return;

  const expectedChildren = getComponentJsxChildren(
    project,
    fullPath,
    node.component.name
  );
  const actualChildren = getTreeChildren(node);

  const missing = expectedChildren.filter((c) => !actualChildren.includes(c));
  const extra = actualChildren.filter((c) => !expectedChildren.includes(c));

  if (missing.length > 0 || extra.length > 0) {
    discrepancies.push({
      component: node.component.name,
      file: node.component.filePath,
      issue:
        missing.length > 0 && extra.length > 0
          ? "missing and extra children"
          : missing.length > 0
          ? "missing children"
          : "extra children",
      expected: expectedChildren,
      actual: actualChildren,
    });
  }

  if (node.children) {
    for (const child of node.children) {
      verifyNode(project, projectRoot, child, discrepancies);
    }
  }
}

export function verifyTree(
  projectRoot: string,
  treePath: string
): Discrepancy[] {
  const treeJson = fs.readFileSync(treePath, "utf-8");
  const tree: TreeNode[] = JSON.parse(treeJson);

  projectComponents = buildProjectComponentSet(tree);

  const project = new Project({
    tsConfigFilePath: path.join(projectRoot, "tsconfig.json"),
    skipAddingFilesFromTsConfig: true,
  });

  const srcDir = path.join(projectRoot, "src");
  if (fs.existsSync(srcDir)) {
    project.addSourceFilesAtPaths([
      `${srcDir}/**/*.tsx`,
      `${srcDir}/**/*.ts`,
    ]);
  }

  const discrepancies: Discrepancy[] = [];

  for (const node of tree) {
    verifyNode(project, projectRoot, node, discrepancies);
  }

  return discrepancies;
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: tsx src/verify-tree.ts <project-root> <tree-json>");
  process.exit(1);
}

const [projectRoot, treePath] = args;
console.log(`Verifying tree: ${treePath}`);
console.log(`Against project: ${projectRoot}\n`);

const discrepancies = verifyTree(projectRoot, treePath);

if (discrepancies.length === 0) {
  console.log("✓ No discrepancies found!");
} else {
  console.log(`Found ${discrepancies.length} discrepancies:\n`);
  for (const d of discrepancies) {
    console.log(`❌ ${d.component} (${d.file})`);
    console.log(`   Issue: ${d.issue}`);
    console.log(`   Expected: [${d.expected.join(", ")}]`);
    console.log(`   Actual:   [${d.actual.join(", ")}]`);
    const missing = d.expected.filter((c) => !d.actual.includes(c));
    const extra = d.actual.filter((c) => !d.expected.includes(c));
    if (missing.length) console.log(`   Missing:  [${missing.join(", ")}]`);
    if (extra.length) console.log(`   Extra:    [${extra.join(", ")}]`);
    console.log();
  }
}
