import { Node } from "ts-morph";
import type { ChildDataFlow, PropSource } from "../../types.js";

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
            for (const [varName] of hookDerivedVars) {
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
