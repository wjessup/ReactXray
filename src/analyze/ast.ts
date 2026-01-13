import { Node, SourceFile } from "ts-morph";
import type { PropInfo, ComponentInfo } from "../types.js";

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

  const defaultExport = sourceFile.getDefaultExportSymbol();
  if (defaultExport) {
    for (const decl of defaultExport.getDeclarations()) {
      const info = extractFromNode(
        decl,
        relativePath,
        isClientComponent,
        isServerComponent
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
        isServerComponent
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
  isServerComponent: boolean
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

    return {
      name,
      filePath,
      props: extractProps(node),
      hooks: findHooks(node),
      serverQueries: isClientComponent ? [] : findServerQueries(node),
      isClientComponent,
      isServerComponent,
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

      return {
        name: varName,
        filePath,
        props: extractProps(init),
        hooks: findHooks(init),
        serverQueries: isClientComponent ? [] : findServerQueries(init),
        isClientComponent,
        isServerComponent,
      };
    }
  }

  return null;
}

function looksLikeComponent(node: Node, name?: string): boolean {
  if (name && NEXTJS_SPECIAL_EXPORTS.includes(name)) return false;
  if (name && name.startsWith("get") && name.endsWith("Metadata")) return false;
  const text = node.getText();
  return (
    text.includes("return") && (text.includes("<") || text.includes("jsx"))
  );
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
