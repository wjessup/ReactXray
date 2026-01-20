import { Node, SourceFile } from "ts-morph";
import type { JsxExport } from "../../types.js";
import { getJsxTagName } from "./helpers.js";
import { NEXTJS_SPECIAL_EXPORTS } from "./constants.js";

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
