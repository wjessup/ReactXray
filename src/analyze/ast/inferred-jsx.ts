import { Node, SourceFile } from "ts-morph";
import type { ResolvedJsxImport, InferredJsxUsage } from "../../types.js";

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
