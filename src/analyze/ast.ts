import { Node, SourceFile } from "ts-morph";
import path from "path";
import type {
  PropInfo,
  ComponentInfo,
  NextjsFileType,
  JsxExport,
  ResolvedJsxImport,
  InferredJsxUsage,
  ChildDataFlow,
  PropSource,
} from "../types.js";

const NEXTJS_FILE_CONVENTIONS: Record<string, NextjsFileType> = {
  page: "page",
  layout: "layout",
  loading: "loading",
  error: "error",
  "not-found": "not-found",
  template: "template",
  route: "route",
  default: "default",
};

function detectNextjsFileType(filePath: string): NextjsFileType {
  const basename = path.basename(filePath);
  const nameWithoutExt = basename.replace(/\.(tsx?|jsx?)$/, "");
  return NEXTJS_FILE_CONVENTIONS[nameWithoutExt] || null;
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

export function extractComponentFromFile(
  sourceFile: SourceFile,
  relativePath: string
): ComponentInfo | null {
  const fileText = sourceFile.getFullText();
  const isClientComponent =
    fileText.includes('"use client"') || fileText.includes("'use client'");
  const isServerComponent =
    fileText.includes('"use server"') || fileText.includes("'use server'");
  const nextjsFileType = detectNextjsFileType(relativePath);

  const defaultExport = sourceFile.getDefaultExportSymbol();
  if (defaultExport) {
    for (const decl of defaultExport.getDeclarations()) {
      const info = extractFromNode(
        decl,
        relativePath,
        isClientComponent,
        isServerComponent,
        nextjsFileType
      );
      if (info) return info;
    }
  }

  for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
    if (name === "default") continue;
    for (const decl of declarations) {
      const info = extractFromNode(
        decl,
        relativePath,
        isClientComponent,
        isServerComponent,
        nextjsFileType
      );
      if (info) {
        info.name = name;
        return info;
      }
    }
  }

  return null;
}

function extractFromNode(
  node: Node,
  filePath: string,
  isClientComponent: boolean,
  isServerComponent: boolean,
  nextjsFileType: NextjsFileType
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

    const childDataFlow = extractChildDataFlow(node);
    return {
      name,
      filePath,
      props: extractProps(node),
      hooks: findHooks(node),
      serverQueries: isClientComponent ? [] : findServerQueries(node),
      childDataFlow: childDataFlow.length > 0 ? childDataFlow : undefined,
      isClientComponent,
      isServerComponent,
      nextjsFileType,
    };
  }

  if (Node.isVariableDeclaration(node)) {
    const init = node.getInitializer();
    if (
      init &&
      (Node.isArrowFunction(init) || Node.isFunctionExpression(init))
    ) {
      const varName = node.getName();
      if (!looksLikeComponent(init, varName)) return null;

      const childDataFlow = extractChildDataFlow(init);
      return {
        name: varName,
        filePath,
        props: extractProps(init),
        hooks: findHooks(init),
        serverQueries: isClientComponent ? [] : findServerQueries(init),
        childDataFlow: childDataFlow.length > 0 ? childDataFlow : undefined,
        isClientComponent,
        isServerComponent,
        nextjsFileType,
      };
    }
  }

  return null;
}

function looksLikeComponent(node: Node, name?: string): boolean {
  if (name && NEXTJS_SPECIAL_EXPORTS.includes(name)) return false;
  if (name && name.startsWith("get") && name.endsWith("Metadata")) return false;
  if (!name || !/^[A-Z]/.test(name)) return false;
  const text = node.getText();
  const hasJsx = text.includes("<") || text.includes("jsx");
  const returnsNull = /return\s+null\s*[;\n}]/.test(text);
  return text.includes("return") && (hasJsx || returnsNull);
}

function extractProps(node: Node): PropInfo[] {
  const props: PropInfo[] = [];

  if (
    !Node.isFunctionDeclaration(node) &&
    !Node.isArrowFunction(node) &&
    !Node.isFunctionExpression(node)
  ) {
    return props;
  }

  const params = node.getParameters();
  if (params.length === 0) return props;

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
    for (const prop of paramType.getProperties()) {
      const decl = prop.getDeclarations()[0];
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

  return props;
}

function simplifyType(typeStr: string): string {
  return typeStr
    .replace(/import\([^)]+\)\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function findHooks(node: Node): string[] {
  const hooks: string[] = [];
  const text = node.getText();

  for (const hook of REACT_HOOKS) {
    if (new RegExp(`\\b${hook}\\s*\\(`).test(text)) {
      hooks.push(hook);
    }
  }

  const customMatches = text.match(/\buse[A-Z]\w*\s*\(/g);
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

export interface JsxUsage {
  directChildren: string[];
  nestedInComponent: Map<string, string[]>;
  identifiersInComponent: Map<string, string[]>;
}

function getJsxTagName(node: Node): string | null {
  if (Node.isJsxElement(node)) {
    const tagName = node.getOpeningElement().getTagNameNode().getText();
    if (/^[A-Z]/.test(tagName) && tagName !== "Fragment") return tagName;
  } else if (Node.isJsxSelfClosingElement(node)) {
    const tagName = node.getTagNameNode().getText();
    if (/^[A-Z]/.test(tagName) && tagName !== "Fragment") return tagName;
  }
  return null;
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

export function extractJsxExports(sourceFile: SourceFile): JsxExport[] {
  const exports: JsxExport[] = [];

  const componentsByPropertyName = new Map<string, Set<string>>();
  const allComponentRefs = new Set<string>();

  function collectComponentRefs(node: Node, propertyPath: string | null) {
    if (Node.isIdentifier(node)) {
      const name = node.getText();
      if (/^[A-Z]/.test(name)) {
        allComponentRefs.add(name);
        if (propertyPath) {
          if (!componentsByPropertyName.has(propertyPath)) {
            componentsByPropertyName.set(propertyPath, new Set());
          }
          componentsByPropertyName.get(propertyPath)!.add(name);
        }
      }
    } else if (Node.isObjectLiteralExpression(node)) {
      for (const prop of node.getProperties()) {
        if (Node.isPropertyAssignment(prop)) {
          const propName = prop.getName();
          const init = prop.getInitializer();
          if (init) {
            collectComponentRefs(init, propName);
          }
        } else if (Node.isShorthandPropertyAssignment(prop)) {
          const propName = prop.getName();
          if (/^[A-Z]/.test(propName)) {
            allComponentRefs.add(propName);
            if (!componentsByPropertyName.has(propName)) {
              componentsByPropertyName.set(propName, new Set());
            }
            componentsByPropertyName.get(propName)!.add(propName);
          }
        }
      }
    } else if (Node.isArrayLiteralExpression(node)) {
      for (const elem of node.getElements()) {
        collectComponentRefs(elem, propertyPath);
      }
    } else if (Node.isConditionalExpression(node)) {
      collectComponentRefs(node.getWhenTrue(), propertyPath);
      collectComponentRefs(node.getWhenFalse(), propertyPath);
    } else {
      node.forEachChild((child) => collectComponentRefs(child, propertyPath));
    }
  }

  sourceFile.forEachDescendant((node) => {
    if (Node.isVariableDeclaration(node)) {
      const init = node.getInitializer();
      if (init) {
        collectComponentRefs(init, null);
      }
    }
  });

  function resolveComponentName(name: string): string[] {
    const resolved = componentsByPropertyName.get(name);
    if (resolved && resolved.size > 0) {
      return Array.from(resolved);
    }
    return [name];
  }

  function collectJsxFromNode(node: Node): string[] {
    const jsxComponents: string[] = [];

    function traverse(n: Node) {
      const tagName = getJsxTagName(n);
      if (tagName) {
        const resolved = resolveComponentName(tagName);
        for (const comp of resolved) {
          if (!jsxComponents.includes(comp)) {
            jsxComponents.push(comp);
          }
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
      } else if (Node.isConditionalExpression(n)) {
        traverse(n.getWhenTrue());
        traverse(n.getWhenFalse());
      } else if (Node.isParenthesizedExpression(n)) {
        traverse(n.getExpression());
      } else if (Node.isBinaryExpression(n)) {
        traverse(n.getRight());
      } else if (Node.isCallExpression(n)) {
        for (const arg of n.getArguments()) {
          traverse(arg);
        }
      } else if (Node.isArrowFunction(n) || Node.isFunctionExpression(n)) {
        const body = n.getBody();
        if (body) traverse(body);
      } else if (Node.isBlock(n)) {
        for (const stmt of n.getStatements()) {
          if (Node.isReturnStatement(stmt)) {
            const expr = stmt.getExpression();
            if (expr) traverse(expr);
          }
        }
      } else {
        n.forEachChild(traverse);
      }
    }

    traverse(node);
    return jsxComponents;
  }

  function extractJsxFromObjectLiteral(objLit: Node): Map<string, string[]> {
    const propsWithJsx = new Map<string, string[]>();

    if (!Node.isObjectLiteralExpression(objLit)) return propsWithJsx;

    for (const prop of objLit.getProperties()) {
      if (Node.isPropertyAssignment(prop)) {
        const propName = prop.getName();
        const init = prop.getInitializer();
        if (init) {
          const jsx = collectJsxFromNode(init);
          if (jsx.length > 0) {
            propsWithJsx.set(propName, jsx);
          }
        }
      } else if (Node.isShorthandPropertyAssignment(prop)) {
        const propName = prop.getName();
        const jsx = collectJsxFromNode(prop);
        if (jsx.length > 0) {
          propsWithJsx.set(propName, jsx);
        }
      }
    }

    return propsWithJsx;
  }

  function analyzeReturnStatements(funcNode: Node): {
    direct: string[];
    inProps: Map<string, string[]>;
  } {
    const directJsx: string[] = [];
    const propsJsx = new Map<string, string[]>();

    funcNode.forEachDescendant((node) => {
      if (!Node.isReturnStatement(node)) return;

      const expr = node.getExpression();
      if (!expr) return;

      let returnExpr = expr;
      if (Node.isParenthesizedExpression(returnExpr)) {
        returnExpr = returnExpr.getExpression();
      }

      if (Node.isObjectLiteralExpression(returnExpr)) {
        const objJsx = extractJsxFromObjectLiteral(returnExpr);
        for (const [key, jsx] of objJsx) {
          const existing = propsJsx.get(key) || [];
          propsJsx.set(key, [...new Set([...existing, ...jsx])]);
        }
        const topLevelJsx = collectJsxFromNode(returnExpr);
        for (const j of topLevelJsx) {
          if (!directJsx.includes(j)) directJsx.push(j);
        }
      } else if (Node.isArrayLiteralExpression(returnExpr)) {
        for (const elem of returnExpr.getElements()) {
          if (Node.isObjectLiteralExpression(elem)) {
            const objJsx = extractJsxFromObjectLiteral(elem);
            for (const [key, jsx] of objJsx) {
              const existing = propsJsx.get(key) || [];
              propsJsx.set(key, [...new Set([...existing, ...jsx])]);
            }
          }
          const jsx = collectJsxFromNode(elem);
          for (const j of jsx) {
            if (!directJsx.includes(j)) directJsx.push(j);
          }
        }
      } else if (Node.isCallExpression(returnExpr)) {
        const callExpr = returnExpr.getExpression();
        if (Node.isPropertyAccessExpression(callExpr)) {
          const methodName = callExpr.getName();
          if (
            methodName === "map" ||
            methodName === "filter" ||
            methodName === "flatMap"
          ) {
            for (const arg of returnExpr.getArguments()) {
              if (Node.isArrowFunction(arg) || Node.isFunctionExpression(arg)) {
                const body = arg.getBody();
                if (body) {
                  if (Node.isObjectLiteralExpression(body)) {
                    const objJsx = extractJsxFromObjectLiteral(body);
                    for (const [key, jsx] of objJsx) {
                      const existing = propsJsx.get(key) || [];
                      propsJsx.set(key, [...new Set([...existing, ...jsx])]);
                    }
                  } else if (Node.isParenthesizedExpression(body)) {
                    const inner = body.getExpression();
                    if (Node.isObjectLiteralExpression(inner)) {
                      const objJsx = extractJsxFromObjectLiteral(inner);
                      for (const [key, jsx] of objJsx) {
                        const existing = propsJsx.get(key) || [];
                        propsJsx.set(key, [...new Set([...existing, ...jsx])]);
                      }
                    }
                  }
                  const jsx = collectJsxFromNode(body);
                  for (const j of jsx) {
                    if (!directJsx.includes(j)) directJsx.push(j);
                  }
                }
              }
            }
          }
        }
        const jsx = collectJsxFromNode(returnExpr);
        for (const j of jsx) {
          if (!directJsx.includes(j)) directJsx.push(j);
        }
      } else {
        const jsx = collectJsxFromNode(returnExpr);
        for (const j of jsx) {
          if (!directJsx.includes(j)) directJsx.push(j);
        }
      }
    });

    if (Node.isArrowFunction(funcNode)) {
      const body = funcNode.getBody();
      if (body && !Node.isBlock(body)) {
        let returnExpr = body;
        if (Node.isParenthesizedExpression(returnExpr)) {
          returnExpr = returnExpr.getExpression();
        }

        if (Node.isObjectLiteralExpression(returnExpr)) {
          const objJsx = extractJsxFromObjectLiteral(returnExpr);
          for (const [key, jsx] of objJsx) {
            const existing = propsJsx.get(key) || [];
            propsJsx.set(key, [...new Set([...existing, ...jsx])]);
          }
        }

        const jsx = collectJsxFromNode(body);
        for (const j of jsx) {
          if (!directJsx.includes(j)) directJsx.push(j);
        }
      }
    }

    return { direct: directJsx, inProps: propsJsx };
  }

  function getFunctionNode(decl: Node): Node | null {
    if (
      Node.isFunctionDeclaration(decl) ||
      Node.isArrowFunction(decl) ||
      Node.isFunctionExpression(decl)
    ) {
      return decl;
    }
    if (Node.isVariableDeclaration(decl)) {
      const init = decl.getInitializer();
      if (
        init &&
        (Node.isArrowFunction(init) || Node.isFunctionExpression(init))
      ) {
        return init;
      }
    }
    return null;
  }

  function determineExportType(
    name: string,
    funcNode: Node
  ): "function" | "variable" | "component" {
    if (/^[A-Z]/.test(name)) return "component";
    if (name.startsWith("use")) return "function";
    const text = funcNode.getText();
    if (
      text.includes("return") &&
      (text.includes("<") || text.includes("jsx"))
    ) {
      if (/^[A-Z]/.test(name)) return "component";
    }
    return "function";
  }

  for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
    if (name === "default") continue;
    if (NEXTJS_SPECIAL_EXPORTS.includes(name)) continue;

    for (const decl of declarations) {
      const funcNode = getFunctionNode(decl);
      if (!funcNode) continue;

      const { direct, inProps } = analyzeReturnStatements(funcNode);

      if (direct.length > 0 || inProps.size > 0) {
        exports.push({
          exportName: name,
          exportType: determineExportType(name, funcNode),
          jsxReturned: direct,
          jsxInProperties: inProps,
        });
      }
    }
  }

  const defaultExport = sourceFile.getDefaultExportSymbol();
  if (defaultExport) {
    for (const decl of defaultExport.getDeclarations()) {
      const funcNode = getFunctionNode(decl);
      if (!funcNode) continue;

      const { direct, inProps } = analyzeReturnStatements(funcNode);

      if (direct.length > 0 || inProps.size > 0) {
        let name = "default";
        if (Node.isFunctionDeclaration(decl) && decl.getName()) {
          name = decl.getName()!;
        }
        exports.push({
          exportName: name,
          exportType: determineExportType(name, funcNode),
          jsxReturned: direct,
          jsxInProperties: inProps,
        });
      }
    }
  }

  return exports;
}

export function extractInferredJsx(
  sourceFile: SourceFile,
  resolvedImports: ResolvedJsxImport[]
): InferredJsxUsage[] {
  if (resolvedImports.length === 0) return [];

  const result: InferredJsxUsage[] = [];
  const jsxSourceByVar = new Map<string, ResolvedJsxImport>();

  for (const imp of resolvedImports) {
    jsxSourceByVar.set(imp.localName, imp);
  }

  sourceFile.forEachDescendant((node) => {
    if (!Node.isVariableDeclaration(node)) return;

    const init = node.getInitializer();
    if (!init || !Node.isCallExpression(init)) return;

    const callExpr = init.getExpression();
    let calledName: string | null = null;

    if (Node.isIdentifier(callExpr)) {
      calledName = callExpr.getText();
    } else if (Node.isPropertyAccessExpression(callExpr)) {
      calledName = callExpr.getText();
    }

    if (!calledName) return;
    const jsxSource = jsxSourceByVar.get(calledName);
    if (!jsxSource) return;

    const nameNode = node.getNameNode();

    if (Node.isIdentifier(nameNode)) {
      const varName = nameNode.getText();

      if (jsxSource.jsxExport.jsxReturned.length > 0) {
        result.push({
          variableName: varName,
          propertyPath: null,
          inferredComponents: [...jsxSource.jsxExport.jsxReturned],
        });
      }

      for (const [propKey, components] of jsxSource.jsxExport.jsxInProperties) {
        result.push({
          variableName: varName,
          propertyPath: propKey,
          inferredComponents: [...components],
        });
      }
    } else if (Node.isObjectBindingPattern(nameNode)) {
      for (const element of nameNode.getElements()) {
        const propNameNode = element.getPropertyNameNode();
        const bindingName = element.getNameNode();

        const propName = propNameNode
          ? Node.isIdentifier(propNameNode)
            ? propNameNode.getText()
            : null
          : Node.isIdentifier(bindingName)
          ? bindingName.getText()
          : null;

        const localName = Node.isIdentifier(bindingName)
          ? bindingName.getText()
          : null;

        if (!propName || !localName) continue;

        const propsJsx = jsxSource.jsxExport.jsxInProperties.get(propName);
        if (propsJsx && propsJsx.length > 0) {
          result.push({
            variableName: localName,
            propertyPath: null,
            inferredComponents: [...propsJsx],
          });
        }
      }
    } else if (Node.isArrayBindingPattern(nameNode)) {
      for (const [propKey, components] of jsxSource.jsxExport.jsxInProperties) {
        result.push({
          variableName: nameNode.getText(),
          propertyPath: propKey,
          inferredComponents: [...components],
        });
      }
    }
  });

  sourceFile.forEachDescendant((node) => {
    if (!Node.isCallExpression(node)) return;

    const callExpr = node.getExpression();
    if (!Node.isPropertyAccessExpression(callExpr)) return;

    const methodName = callExpr.getName();
    if (
      methodName !== "map" &&
      methodName !== "flatMap" &&
      methodName !== "filter"
    )
      return;

    const objExpr = callExpr.getExpression();
    if (!Node.isIdentifier(objExpr)) return;

    const arrayVarName = objExpr.getText();

    const existingInference = result.find(
      (r) => r.variableName === arrayVarName && r.propertyPath !== null
    );
    if (!existingInference) return;

    for (const arg of node.getArguments()) {
      if (!Node.isArrowFunction(arg) && !Node.isFunctionExpression(arg))
        continue;

      const params = arg.getParameters();
      if (params.length === 0) continue;

      const firstParam = params[0];
      const paramNameNode = firstParam.getNameNode();

      if (Node.isObjectBindingPattern(paramNameNode)) {
        for (const element of paramNameNode.getElements()) {
          const propNameNode = element.getPropertyNameNode();
          const bindingName = element.getNameNode();

          const propName = propNameNode
            ? Node.isIdentifier(propNameNode)
              ? propNameNode.getText()
              : null
            : Node.isIdentifier(bindingName)
            ? bindingName.getText()
            : null;

          const localName = Node.isIdentifier(bindingName)
            ? bindingName.getText()
            : null;

          if (!propName || !localName) continue;

          const matchingInference = result.find(
            (r) =>
              r.variableName === arrayVarName && r.propertyPath === propName
          );

          if (matchingInference) {
            result.push({
              variableName: localName,
              propertyPath: null,
              inferredComponents: [...matchingInference.inferredComponents],
            });
          }
        }
      }
    }
  });

  return result;
}

function findServerQueries(node: Node): string[] {
  const queries: string[] = [];
  const text = node.getText();

  const awaitRegex = /await\s+(\w+)\s*\(/g;
  let match;
  while ((match = awaitRegex.exec(text)) !== null) {
    if (match[1] !== "Promise" && !queries.includes(match[1])) {
      queries.push(match[1]);
    }
  }

  const promiseAllRegex = /Promise\.all\s*\(\s*\[([\s\S]*?)\]\s*\)/g;
  while ((match = promiseAllRegex.exec(text)) !== null) {
    const fnRegex = /(\w+)\s*\(/g;
    let fnMatch;
    while ((fnMatch = fnRegex.exec(match[1])) !== null) {
      if (fnMatch[1] !== "await" && !queries.includes(fnMatch[1])) {
        queries.push(fnMatch[1]);
      }
    }
  }

  return queries;
}

export function extractChildDataFlow(node: Node): ChildDataFlow[] {
  const result: ChildDataFlow[] = [];
  const text = node.getText();
  
  const serverQueryVars = new Map<string, string>();
  const hookVars = new Map<string, string>();
  const hookDerivedVars = new Map<string, string>();
  const propVars = new Set<string>();
  const mapIteratorVars = new Map<string, string>();
  
  const awaitAssignRegex = /(?:const|let)\s+(\w+)\s*=\s*await\s+(\w+)\s*\(/g;
  let match;
  while ((match = awaitAssignRegex.exec(text)) !== null) {
    serverQueryVars.set(match[1], match[2]);
  }
  
  const promiseAllRegex = /(?:const|let)\s*\[([^\]]+)\]\s*=\s*await\s+Promise\.all\s*\(\s*\[([\s\S]*?)\]\s*\)/g;
  while ((match = promiseAllRegex.exec(text)) !== null) {
    const varNames = match[1].split(",").map(v => v.trim());
    const calls = match[2];
    const fnRegex = /(\w+)\s*\(/g;
    let fnMatch;
    let idx = 0;
    while ((fnMatch = fnRegex.exec(calls)) !== null) {
      if (fnMatch[1] !== "await" && idx < varNames.length) {
        serverQueryVars.set(varNames[idx], fnMatch[1]);
        idx++;
      }
    }
  }
  
  const hookAssignRegex = /(?:const|let)\s+(\w+)\s*=\s+(use[A-Z]\w*)\s*\(/g;
  while ((match = hookAssignRegex.exec(text)) !== null) {
    hookVars.set(match[1], match[2]);
  }
  
  const hookDestructRegex = /(?:const|let)\s*\{([^}]+)\}\s*=\s+(use[A-Z]\w*)\s*\(/g;
  while ((match = hookDestructRegex.exec(text)) !== null) {
    const vars = match[1].split(",").map(v => v.trim().split(":")[0].trim());
    for (const v of vars) {
      hookDerivedVars.set(v, match[2]);
    }
  }
  
  const varDestructRegex = /(?:const|let)\s*\{([^}]+)\}\s*=\s+(\w+)/g;
  while ((match = varDestructRegex.exec(text)) !== null) {
    const sourceVar = match[2];
    if (hookVars.has(sourceVar)) {
      const vars = match[1].split(",").map(v => v.trim().split(":")[0].trim());
      for (const v of vars) {
        hookDerivedVars.set(v, hookVars.get(sourceVar)!);
      }
    }
  }
  
  const hookCallDerivedRegex = /(?:const|let)\s*\{([^}]+)\}\s*=\s+(use[A-Z]\w*)\s*\([^)]*\)/g;
  while ((match = hookCallDerivedRegex.exec(text)) !== null) {
    const vars = match[1].split(",").map(v => v.trim().split(":")[0].trim());
    for (const v of vars) {
      hookDerivedVars.set(v, match[2]);
    }
  }
  
  if (Node.isFunctionDeclaration(node) || Node.isArrowFunction(node) || Node.isFunctionExpression(node)) {
    const params = node.getParameters();
    if (params.length > 0) {
      const firstParam = params[0];
      const nameNode = firstParam.getNameNode();
      if (Node.isObjectBindingPattern(nameNode)) {
        for (const element of nameNode.getElements()) {
          propVars.add(element.getNameNode().getText());
        }
      }
    }
  }
  
  node.forEachDescendant((child) => {
    if (Node.isCallExpression(child)) {
      const expr = child.getExpression();
      if (Node.isPropertyAccessExpression(expr)) {
        const methodName = expr.getName();
        if (methodName === "map" || methodName === "flatMap" || methodName === "forEach") {
          const objExpr = expr.getExpression();
          let sourceVar: string | null = null;
          
          if (Node.isIdentifier(objExpr)) {
            sourceVar = objExpr.getText();
          } else if (Node.isPropertyAccessExpression(objExpr)) {
            const baseText = objExpr.getText();
            for (const [varName, hookName] of hookDerivedVars) {
              if (baseText.startsWith(varName + ".") || baseText.startsWith(varName + "?.")) {
                sourceVar = varName;
                break;
              }
            }
          }
          
          if (sourceVar && (hookDerivedVars.has(sourceVar) || hookVars.has(sourceVar))) {
            const args = child.getArguments();
            if (args.length > 0) {
              const callback = args[0];
              if (Node.isArrowFunction(callback) || Node.isFunctionExpression(callback)) {
                const cbParams = callback.getParameters();
                if (cbParams.length > 0) {
                  const iteratorName = cbParams[0].getName();
                  const hookName = hookDerivedVars.get(sourceVar) || hookVars.get(sourceVar);
                  if (hookName) {
                    mapIteratorVars.set(iteratorName, hookName);
                  }
                }
              }
            }
          }
        }
      }
    }
  });
  
  node.forEachDescendant((child) => {
    if (Node.isJsxElement(child) || Node.isJsxSelfClosingElement(child)) {
      const tagName = Node.isJsxElement(child) 
        ? child.getOpeningElement().getTagNameNode().getText()
        : child.getTagNameNode().getText();
      
      if (!/^[A-Z]/.test(tagName)) return;
      
      const attributes = Node.isJsxElement(child)
        ? child.getOpeningElement().getAttributes()
        : child.getAttributes();
      
      const props: Record<string, PropSource> = {};
      
      for (const attr of attributes) {
        if (!Node.isJsxAttribute(attr)) continue;
        
        const propName = attr.getNameNode().getText();
        const init = attr.getInitializer();
        
        if (!init) {
          props[propName] = { source: "literal" };
          continue;
        }
        
        if (Node.isStringLiteral(init)) {
          props[propName] = { source: "literal" };
          continue;
        }
        
        if (Node.isJsxExpression(init)) {
          const expr = init.getExpression();
          if (!expr) {
            props[propName] = { source: "literal" };
            continue;
          }
          
          const exprText = expr.getText();
          
          if (serverQueryVars.has(exprText)) {
            props[propName] = { 
              source: "serverQuery", 
              query: serverQueryVars.get(exprText) 
            };
          } else if (mapIteratorVars.has(exprText)) {
            props[propName] = {
              source: "hook",
              hookName: mapIteratorVars.get(exprText)
            };
          } else if (hookDerivedVars.has(exprText)) {
            props[propName] = {
              source: "hook",
              hookName: hookDerivedVars.get(exprText)
            };
          } else if (hookVars.has(exprText)) {
            props[propName] = {
              source: "hook",
              hookName: hookVars.get(exprText)
            };
          } else if (propVars.has(exprText)) {
            props[propName] = { 
              source: "prop", 
              propName: exprText 
            };
          } else {
            let foundHookSource = false;
            for (const [varName, hookName] of hookDerivedVars) {
              if (exprText.startsWith(varName + ".") || exprText.startsWith(varName + "?.")) {
                props[propName] = { source: "hook", hookName };
                foundHookSource = true;
                break;
              }
            }
            for (const [varName, hookName] of hookVars) {
              if (exprText.startsWith(varName + ".") || exprText.startsWith(varName + "?.")) {
                props[propName] = { source: "hook", hookName };
                foundHookSource = true;
                break;
              }
            }
            for (const [varName, hookName] of mapIteratorVars) {
              if (exprText.startsWith(varName + ".") || exprText.startsWith(varName + "?.") || exprText === varName) {
                props[propName] = { source: "hook", hookName };
                foundHookSource = true;
                break;
              }
            }
            
            if (!foundHookSource) {
              for (const propVar of propVars) {
                if (exprText.startsWith(propVar + ".") || exprText.startsWith(propVar + "?.")) {
                  props[propName] = { source: "prop", propName: propVar };
                  foundHookSource = true;
                  break;
                }
              }
            }
            
            if (!foundHookSource) {
              props[propName] = { source: "computed" };
            }
          }
        }
      }
      
      if (Object.keys(props).length > 0) {
        const existing = result.find(r => r.component === tagName);
        if (existing) {
          Object.assign(existing.props, props);
        } else {
          result.push({ component: tagName, props });
        }
      }
    }
  });
  
  return result;
}
