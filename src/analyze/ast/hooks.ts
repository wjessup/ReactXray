import { Node } from "ts-morph";
import { REACT_HOOKS } from "./constants.js";

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

export function findServerQueries(node: Node): string[] {
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
