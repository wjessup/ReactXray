import { Node } from "ts-morph";
import path from "path";
import type { NextjsFileType } from "../../types.js";
import { NEXTJS_FILE_CONVENTIONS, NEXTJS_SPECIAL_EXPORTS } from "./constants.js";

export function detectNextjsFileType(filePath: string): NextjsFileType {
  const basename = path.basename(filePath);
  const nameWithoutExt = basename.replace(/\.(tsx?|jsx?)$/, "");
  return NEXTJS_FILE_CONVENTIONS[nameWithoutExt] || null;
}

export function simplifyType(typeStr: string): string {
  return typeStr
    .replace(/import\([^)]+\)\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function looksLikeComponent(node: Node, name?: string): boolean {
  if (name && NEXTJS_SPECIAL_EXPORTS.includes(name)) return false;
  if (name && name.startsWith("get") && name.endsWith("Metadata")) return false;
  if (!name || !/^[A-Z]/.test(name)) return false;
  const text = node.getText();
  const hasJsx = text.includes("<") || text.includes("jsx");
  const returnsNull = /return\s+null\s*[;\n}]/.test(text);
  const hasReturn = text.includes("return");
  // Arrow functions with implicit return (no block body) don't contain "return"
  const hasImplicitReturn =
    (Node.isArrowFunction(node) && !Node.isBlock(node.getBody()));
  return (hasReturn || hasImplicitReturn) && (hasJsx || returnsNull);
}

export function getJsxTagName(node: Node): string | null {
  if (Node.isJsxElement(node)) {
    const tagName = node.getOpeningElement().getTagNameNode().getText();
    if (/^[A-Z]/.test(tagName) && tagName !== "Fragment") return tagName;
  } else if (Node.isJsxSelfClosingElement(node)) {
    const tagName = node.getTagNameNode().getText();
    if (/^[A-Z]/.test(tagName) && tagName !== "Fragment") return tagName;
  }
  return null;
}
