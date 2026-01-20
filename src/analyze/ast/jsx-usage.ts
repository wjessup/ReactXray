import { Node, SourceFile } from "ts-morph";
import { getJsxTagName } from "./helpers.js";

export interface JsxUsage {
  directChildren: string[];
  nestedInComponent: Map<string, string[]>;
  identifiersInComponent: Map<string, string[]>;
}

export function extractJsxUsage(sourceFile: SourceFile): JsxUsage {
  const directChildren = new Set<string>();
  const nestedInComponent = new Map<string, Set<string>>();
  const identifiersInComponent = new Map<string, Set<string>>();
  const processedNodes = new WeakSet<Node>();

  function addChild(parentName: string | null, childName: string) {
    if (parentName) {
      if (!nestedInComponent.has(parentName)) {
        nestedInComponent.set(parentName, new Set());
      }
      nestedInComponent.get(parentName)!.add(childName);
    } else {
      directChildren.add(childName);
    }
  }

  function addIdentifier(parentName: string | null, identifierName: string) {
    if (parentName) {
      if (!identifiersInComponent.has(parentName)) {
        identifiersInComponent.set(parentName, new Set());
      }
      identifiersInComponent.get(parentName)!.add(identifierName);
    }
  }

  function isCustomComponent(name: string | null): boolean {
    if (!name) return false;
    return /^[A-Z]/.test(name);
  }

  function processJsxTree(
    node: Node,
    parentComponentName: string | null,
    nearestCustomComponent: string | null
  ) {
    if (processedNodes.has(node)) return;
    processedNodes.add(node);

    const tagName = getJsxTagName(node);

    if (tagName) {
      addChild(parentComponentName, tagName);

      const newNearestCustom = isCustomComponent(tagName)
        ? tagName
        : nearestCustomComponent;

      if (Node.isJsxElement(node)) {
        const nextParent = isCustomComponent(tagName) ? tagName : parentComponentName;
        for (const child of node.getJsxChildren()) {
          processJsxTree(child, nextParent, newNearestCustom);
        }
      }

      const attributes = Node.isJsxElement(node)
        ? node.getOpeningElement().getAttributes()
        : Node.isJsxSelfClosingElement(node)
        ? node.getAttributes()
        : [];

      for (const attr of attributes) {
        if (Node.isJsxAttribute(attr)) {
          const init = attr.getInitializer();
          if (init) {
            processJsxTree(init, tagName, newNearestCustom);
          }
        }
      }
    } else if (Node.isJsxFragment(node)) {
      for (const child of node.getJsxChildren()) {
        processJsxTree(child, parentComponentName, nearestCustomComponent);
      }
    } else if (Node.isJsxExpression(node)) {
      const expr = node.getExpression();
      if (expr) {
        if (Node.isIdentifier(expr)) {
          const target = isCustomComponent(parentComponentName)
            ? parentComponentName
            : nearestCustomComponent;
          addIdentifier(target, expr.getText());
        }
        processJsxTree(expr, parentComponentName, nearestCustomComponent);
      }
    } else if (Node.isIdentifier(node)) {
      const target = isCustomComponent(parentComponentName)
        ? parentComponentName
        : nearestCustomComponent;
      addIdentifier(target, node.getText());
    } else if (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) {
      const body = Node.isArrowFunction(node) ? node.getBody() : node.getBody();
      if (body) {
        processJsxTree(body, parentComponentName, nearestCustomComponent);
      }
    } else if (Node.isParenthesizedExpression(node)) {
      processJsxTree(node.getExpression(), parentComponentName, nearestCustomComponent);
    } else if (Node.isConditionalExpression(node)) {
      processJsxTree(node.getWhenTrue(), parentComponentName, nearestCustomComponent);
      processJsxTree(node.getWhenFalse(), parentComponentName, nearestCustomComponent);
    } else if (Node.isBinaryExpression(node)) {
      processJsxTree(node.getRight(), parentComponentName, nearestCustomComponent);
    } else if (Node.isCallExpression(node)) {
      for (const arg of node.getArguments()) {
        processJsxTree(arg, parentComponentName, nearestCustomComponent);
      }
    } else if (Node.isBlock(node)) {
      for (const stmt of node.getStatements()) {
        if (Node.isReturnStatement(stmt)) {
          const expr = stmt.getExpression();
          if (expr) {
            processJsxTree(expr, parentComponentName, nearestCustomComponent);
          }
        }
      }
    } else {
      node.forEachChild((child) =>
        processJsxTree(child, parentComponentName, nearestCustomComponent)
      );
    }
  }

  sourceFile.forEachDescendant((node) => {
    if (Node.isReturnStatement(node)) {
      const expr = node.getExpression();
      if (expr) {
        processJsxTree(expr, null, null);
      }
    }

    if (Node.isArrowFunction(node)) {
      const body = node.getBody();
      if (
        body &&
        (Node.isJsxElement(body) ||
          Node.isJsxSelfClosingElement(body) ||
          Node.isJsxFragment(body) ||
          Node.isParenthesizedExpression(body))
      ) {
        processJsxTree(body, null, null);
      }
    }
  });

  const result: JsxUsage = {
    directChildren: Array.from(directChildren),
    nestedInComponent: new Map(),
    identifiersInComponent: new Map(),
  };

  for (const [parent, children] of nestedInComponent) {
    result.nestedInComponent.set(parent, Array.from(children));
  }

  for (const [parent, identifiers] of identifiersInComponent) {
    result.identifiersInComponent.set(parent, Array.from(identifiers));
  }

  return result;
}

export function extractJsxChildren(sourceFile: SourceFile): string[] {
  const children = new Set<string>();
  const text = sourceFile.getFullText();

  const jsxTagRegex = /<([A-Z][a-zA-Z0-9_]*)[\s/>]/g;
  let match;
  while ((match = jsxTagRegex.exec(text)) !== null) {
    const tagName = match[1];
    if (tagName !== "Fragment") {
      children.add(tagName);
    }
  }

  return Array.from(children);
}
