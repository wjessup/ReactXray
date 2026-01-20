import { Node, SourceFile } from "ts-morph";
import type { PropInfo, ComponentInfo, NextjsFileType } from "../../types.js";
import { detectNextjsFileType, simplifyType, looksLikeComponent } from "./helpers.js";
import { findHooks, findServerQueries } from "./hooks.js";
import { extractChildDataFlow } from "./data-flow.js";

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
