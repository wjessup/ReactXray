import { Node, SourceFile } from "ts-morph";
import type { PropInfo, ComponentInfo, NextjsFileType } from "../../types.js";
import { detectNextjsFileType, simplifyType, looksLikeComponent } from "./helpers.js";
import { findHooks, findServerQueries } from "./hooks.js";
import { extractChildDataFlow } from "./data-flow.js";

/** Known HOC wrappers that take a component function as first argument */
const COMPONENT_WRAPPERS = [
  "forwardRef",
  "memo",
  "React.forwardRef",
  "React.memo",
];

export function extractComponentFromFile(
  sourceFile: SourceFile,
  relativePath: string
): ComponentInfo | null {
  const all = extractAllComponentsFromFile(sourceFile, relativePath);
  return all.length > 0 ? all[0] : null;
}

export function extractAllComponentsFromFile(
  sourceFile: SourceFile,
  relativePath: string
): ComponentInfo[] {
  const fileText = sourceFile.getFullText();
  const isClientComponent =
    fileText.includes('"use client"') || fileText.includes("'use client'");
  const isServerComponent =
    fileText.includes('"use server"') || fileText.includes("'use server'");
  const nextjsFileType = detectNextjsFileType(relativePath);

  const results: ComponentInfo[] = [];
  const seenNames = new Set<string>();

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
      if (info && !seenNames.has(info.name)) {
        seenNames.add(info.name);
        results.push(info);
        break;
      }
    }
  }

  for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
    if (name === "default") continue;
    if (seenNames.has(name)) continue;
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
        if (!seenNames.has(name)) {
          seenNames.add(name);
          results.push(info);
        }
        break;
      }
    }
  }

  return results;
}

function unwrapHocCall(node: Node): Node | null {
  if (!Node.isCallExpression(node)) return null;
  const exprText = node.getExpression().getText();
  if (!COMPONENT_WRAPPERS.some(w => exprText === w || exprText.endsWith("." + w.split(".").pop()))) {
    return null;
  }
  const args = node.getArguments();
  if (args.length === 0) return null;
  const firstArg = args[0];
  if (Node.isArrowFunction(firstArg) || Node.isFunctionExpression(firstArg)) {
    return firstArg;
  }
  // forwardRef can also wrap another call: React.forwardRef(React.memo((...) => ...))
  return unwrapHocCall(firstArg);
}

function extractFromNode(
  node: Node,
  filePath: string,
  isClientComponent: boolean,
  isServerComponent: boolean,
  nextjsFileType: NextjsFileType
): ComponentInfo | null {
  // Handle `export default SomeName` — resolve the identifier to its declaration
  if (Node.isExportAssignment(node)) {
    const expr = node.getExpression();
    if (expr && Node.isIdentifier(expr)) {
      const sym = expr.getSymbol();
      if (sym) {
        for (const decl of sym.getDeclarations()) {
          const info = extractFromNode(
            decl,
            filePath,
            isClientComponent,
            isServerComponent,
            nextjsFileType
          );
          if (info) return info;
        }
      }
    }
    return null;
  }

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
    if (!init) return null;

    // Direct arrow function or function expression
    let funcNode: Node | null = null;
    if (Node.isArrowFunction(init) || Node.isFunctionExpression(init)) {
      funcNode = init;
    } else {
      // Try unwrapping HOC wrappers: React.forwardRef(...), React.memo(...)
      funcNode = unwrapHocCall(init);
    }

    if (funcNode) {
      const varName = node.getName();
      if (!looksLikeComponent(funcNode, varName)) return null;

      const childDataFlow = extractChildDataFlow(funcNode);
      return {
        name: varName,
        filePath,
        props: extractProps(funcNode),
        hooks: findHooks(funcNode),
        serverQueries: isClientComponent ? [] : findServerQueries(funcNode),
        childDataFlow: childDataFlow.length > 0 ? childDataFlow : undefined,
        isClientComponent,
        isServerComponent,
        nextjsFileType,
      };
    }
  }

  return null;
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
