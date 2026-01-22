import { Node, SourceFile, SyntaxKind } from "ts-morph";
import type { PropUpwardFlow, PropUsageSite, PropUpstreamNode, PropValueSource, ComponentInfo } from "../../types.js";
import type { ComponentUsage, PropValueAtUsage } from "./usage-context.js";

export interface PropTransformation {
  file: string;
  fromName: string;
  toName: string;
  type: "rename" | "destructure" | "reconstruct" | "spread" | "compute";
  hasComputation: boolean;
  line: number;
}

export interface PropLineage {
  currentName: string;
  origin: {
    file: string;
    expression: string;
    line: number;
    source: "api" | "hook" | "prop" | "literal" | "computed" | "context";
  };
  transformations: PropTransformation[];
  endsWithSameName: boolean;
  totalRenames: number;
  computationCount: number;
}

export interface PassThroughComponent {
  name: string;
  file: string;
  propsReceived: number;
  propsPassedThrough: number;
  propsUsedLocally: number;
  passThroughRatio: number;
}

export interface NoOpFunction {
  name: string;
  file: string;
  line: number;
  renames: Record<string, string>;
}

export interface PropLineageAnalysis {
  lineages: PropLineage[];
  passThroughComponents: PassThroughComponent[];
  noOpFunctions: NoOpFunction[];
  smells: ArchitectureSmell[];
}

export interface ArchitectureSmell {
  type: "excessive-renaming" | "circular-naming" | "pass-through" | "no-op-function" | "prop-drilling";
  severity: "warning" | "error";
  message: string;
  suggestion: string;
  location: { file: string; line?: number };
  details?: Record<string, unknown>;
}

export function detectNoOpFunctions(sourceFile: SourceFile): NoOpFunction[] {
  const results: NoOpFunction[] = [];
  const filePath = sourceFile.getFilePath();

  sourceFile.forEachDescendant((node) => {
    if (!Node.isFunctionDeclaration(node) && 
        !Node.isArrowFunction(node) && 
        !Node.isFunctionExpression(node)) {
      return;
    }

    let funcName = "anonymous";
    if (Node.isFunctionDeclaration(node)) {
      funcName = node.getName() || "anonymous";
    } else {
      const parent = node.getParent();
      if (Node.isVariableDeclaration(parent)) {
        funcName = parent.getName();
      }
    }

    const params = node.getParameters();
    if (params.length !== 1) return;

    const paramNode = params[0].getNameNode();
    if (!Node.isObjectBindingPattern(paramNode) && !Node.isIdentifier(paramNode)) return;

    const body = node.getBody();
    if (!body) return;

    let returnExpr: Node | undefined;

    if (Node.isBlock(body)) {
      const statements = body.getStatements();
      if (statements.length !== 1) return;
      const stmt = statements[0];
      if (!Node.isReturnStatement(stmt)) return;
      returnExpr = stmt.getExpression();
    } else {
      returnExpr = body;
    }

    if (!returnExpr || !Node.isObjectLiteralExpression(returnExpr)) return;

    const renames: Record<string, string> = {};
    let isNoOp = true;

    for (const prop of returnExpr.getProperties()) {
      if (!Node.isPropertyAssignment(prop)) {
        isNoOp = false;
        break;
      }

      const keyNode = prop.getNameNode();
      const valueNode = prop.getInitializer();

      if (!keyNode || !valueNode) {
        isNoOp = false;
        break;
      }

      const keyName = keyNode.getText();

      if (Node.isIdentifier(valueNode)) {
        renames[valueNode.getText()] = keyName;
      } else if (Node.isPropertyAccessExpression(valueNode)) {
        const propName = valueNode.getName();
        renames[propName] = keyName;
      } else {
        isNoOp = false;
        break;
      }
    }

    if (isNoOp && Object.keys(renames).length > 0) {
      const hasAnyRename = Object.entries(renames).some(([from, to]) => from !== to);
      if (hasAnyRename) {
        results.push({
          name: funcName,
          file: filePath,
          line: node.getStartLineNumber(),
          renames,
        });
      }
    }
  });

  return results;
}

export interface PropPassingInfo {
  componentName: string;
  propName: string;
  sourceExpression: string;
  sourceType: "prop" | "hook" | "computed" | "literal" | "destructure";
  sourcePropName?: string;
  sourceHookName?: string;
  line: number;
}

export function extractPropPassing(sourceFile: SourceFile): PropPassingInfo[] {
  const results: PropPassingInfo[] = [];
  const filePath = sourceFile.getFilePath();

  const propVars = new Map<string, string>();
  const hookVars = new Map<string, string>();
  const destructuredFromProp = new Map<string, string>();

  sourceFile.forEachDescendant((node) => {
    if (Node.isFunctionDeclaration(node) || 
        Node.isArrowFunction(node) || 
        Node.isFunctionExpression(node)) {
      
      const params = node.getParameters();
      if (params.length > 0) {
        const firstParam = params[0];
        const nameNode = firstParam.getNameNode();
        
        if (Node.isObjectBindingPattern(nameNode)) {
          for (const element of nameNode.getElements()) {
            const propName = element.getNameNode().getText();
            const propertyName = element.getPropertyNameNode()?.getText();
            propVars.set(propName, propertyName || propName);
          }
        } else if (Node.isIdentifier(nameNode)) {
          propVars.set(nameNode.getText(), nameNode.getText());
        }
      }
    }

    if (Node.isVariableDeclaration(node)) {
      const init = node.getInitializer();
      if (!init) return;

      const nameNode = node.getNameNode();

      if (Node.isCallExpression(init)) {
        const callText = init.getExpression().getText();
        if (callText.startsWith("use") && /^use[A-Z]/.test(callText)) {
          if (Node.isIdentifier(nameNode)) {
            hookVars.set(nameNode.getText(), callText);
          } else if (Node.isObjectBindingPattern(nameNode)) {
            for (const element of nameNode.getElements()) {
              hookVars.set(element.getNameNode().getText(), callText);
            }
          }
        }
      }

      if (Node.isObjectBindingPattern(nameNode) && Node.isIdentifier(init)) {
        const sourceName = init.getText();
        if (propVars.has(sourceName)) {
          for (const element of nameNode.getElements()) {
            const destructuredName = element.getNameNode().getText();
            destructuredFromProp.set(destructuredName, sourceName);
          }
        }
      }
    }

    if (Node.isJsxElement(node) || Node.isJsxSelfClosingElement(node)) {
      const tagNode = Node.isJsxElement(node)
        ? node.getOpeningElement().getTagNameNode()
        : node.getTagNameNode();

      const tagName = tagNode.getText();
      if (!/^[A-Z]/.test(tagName)) return;

      const attributes = Node.isJsxElement(node)
        ? node.getOpeningElement().getAttributes()
        : node.getAttributes();

      for (const attr of attributes) {
        if (!Node.isJsxAttribute(attr)) continue;

        const propName = attr.getNameNode().getText();
        const initializer = attr.getInitializer();
        const line = attr.getStartLineNumber();

        if (!initializer) {
          results.push({
            componentName: tagName,
            propName,
            sourceExpression: propName,
            sourceType: "literal",
            line,
          });
          continue;
        }

        if (Node.isStringLiteral(initializer)) {
          results.push({
            componentName: tagName,
            propName,
            sourceExpression: initializer.getText(),
            sourceType: "literal",
            line,
          });
          continue;
        }

        if (Node.isJsxExpression(initializer)) {
          const expr = initializer.getExpression();
          if (!expr) continue;

          const exprText = expr.getText();

          if (Node.isIdentifier(expr)) {
            if (propVars.has(exprText)) {
              results.push({
                componentName: tagName,
                propName,
                sourceExpression: exprText,
                sourceType: "prop",
                sourcePropName: propVars.get(exprText),
                line,
              });
            } else if (hookVars.has(exprText)) {
              results.push({
                componentName: tagName,
                propName,
                sourceExpression: exprText,
                sourceType: "hook",
                sourceHookName: hookVars.get(exprText),
                line,
              });
            } else if (destructuredFromProp.has(exprText)) {
              results.push({
                componentName: tagName,
                propName,
                sourceExpression: exprText,
                sourceType: "destructure",
                sourcePropName: destructuredFromProp.get(exprText),
                line,
              });
            } else {
              results.push({
                componentName: tagName,
                propName,
                sourceExpression: exprText,
                sourceType: "computed",
                line,
              });
            }
          } else if (Node.isPropertyAccessExpression(expr)) {
            const objText = expr.getExpression().getText();
            const propAccess = expr.getName();

            if (propVars.has(objText)) {
              results.push({
                componentName: tagName,
                propName,
                sourceExpression: exprText,
                sourceType: "prop",
                sourcePropName: `${propVars.get(objText)}.${propAccess}`,
                line,
              });
            } else if (hookVars.has(objText)) {
              results.push({
                componentName: tagName,
                propName,
                sourceExpression: exprText,
                sourceType: "hook",
                sourceHookName: `${hookVars.get(objText)}.${propAccess}`,
                line,
              });
            } else {
              results.push({
                componentName: tagName,
                propName,
                sourceExpression: exprText,
                sourceType: "computed",
                line,
              });
            }
          } else {
            results.push({
              componentName: tagName,
              propName,
              sourceExpression: exprText,
              sourceType: "computed",
              line,
            });
          }
        }
      }
    }
  });

  return results;
}

export function analyzePassThroughComponents(
  componentMap: Map<string, { name: string; file: string; props: string[] }>,
  propPassingByFile: Map<string, PropPassingInfo[]>
): PassThroughComponent[] {
  const results: PassThroughComponent[] = [];

  for (const [file, component] of componentMap) {
    const propPassing = propPassingByFile.get(file) || [];
    const propsReceived = component.props.length;
    
    if (propsReceived === 0) continue;

    const receivedPropNames = new Set(component.props);
    const forwardedPropNames = new Set<string>();

    for (const p of propPassing) {
      if (p.sourceType !== "prop" && p.sourceType !== "destructure") continue;
      
      const sourceName = p.sourcePropName?.split(".")[0] || p.sourceExpression;
      if (receivedPropNames.has(sourceName)) {
        forwardedPropNames.add(sourceName);
      }
    }

    const propsPassedThrough = forwardedPropNames.size;
    
    if (propsPassedThrough === 0) continue;

    const passThroughRatio = propsPassedThrough / propsReceived;
    const propsUsedLocally = propsReceived - propsPassedThrough;

    if (passThroughRatio >= 0.5 && propsReceived >= 3) {
      results.push({
        name: component.name,
        file,
        propsReceived,
        propsPassedThrough,
        propsUsedLocally,
        passThroughRatio,
      });
    }
  }

  return results;
}

export function detectArchitectureSmells(
  lineages: PropLineage[],
  passThroughComponents: PassThroughComponent[],
  noOpFunctions: NoOpFunction[]
): ArchitectureSmell[] {
  const smells: ArchitectureSmell[] = [];

  for (const lineage of lineages) {
    if (lineage.totalRenames >= 3 && lineage.computationCount === 0) {
      smells.push({
        type: "excessive-renaming",
        severity: "warning",
        message: `'${lineage.origin.expression}' is renamed ${lineage.totalRenames} times with no transformation`,
        suggestion: "Pass the original object directly and let the leaf component extract what it needs",
        location: { file: lineage.origin.file, line: lineage.origin.line },
        details: {
          transformations: lineage.transformations.map(t => `${t.fromName} → ${t.toName}`),
        },
      });
    }

    if (lineage.endsWithSameName && lineage.totalRenames >= 2) {
      smells.push({
        type: "circular-naming",
        severity: "warning",
        message: `'${lineage.currentName}' goes through ${lineage.totalRenames} renames to end up with the same name`,
        suggestion: "Remove intermediate renames - use consistent naming throughout the chain",
        location: { file: lineage.origin.file, line: lineage.origin.line },
      });
    }

    if (lineage.transformations.length >= 5) {
      smells.push({
        type: "prop-drilling",
        severity: "warning",
        message: `Prop passes through ${lineage.transformations.length} components`,
        suggestion: "Consider using React Context or moving data fetching closer to where it's used",
        location: { file: lineage.origin.file },
        details: {
          chain: lineage.transformations.map(t => t.file),
        },
      });
    }
  }

  for (const comp of passThroughComponents) {
    smells.push({
      type: "pass-through",
      severity: "warning",
      message: `${comp.name} passes through ${comp.propsPassedThrough} of ${comp.propsReceived} props (${Math.round(comp.passThroughRatio * 100)}%)`,
      suggestion: "This component adds complexity without value. Consider removing it from the hierarchy.",
      location: { file: comp.file },
      details: {
        propsReceived: comp.propsReceived,
        propsPassedThrough: comp.propsPassedThrough,
        propsUsedLocally: comp.propsUsedLocally,
      },
    });
  }

  for (const fn of noOpFunctions) {
    smells.push({
      type: "no-op-function",
      severity: "warning",
      message: `${fn.name}() only renames fields: ${Object.entries(fn.renames).map(([f, t]) => `${f}→${t}`).join(", ")}`,
      suggestion: "Delete this function and use the original field names",
      location: { file: fn.file, line: fn.line },
      details: { renames: fn.renames },
    });
  }

  return smells;
}

export interface PropChainNode {
  file: string;
  componentName: string;
  propName: string;
  sourcePropName?: string;
  sourceType: string;
}

export function buildPropChain(
  targetComponent: string,
  targetProp: string,
  propPassingByFile: Map<string, PropPassingInfo[]>,
  componentToFile: Map<string, string>,
  maxDepth: number = 10
): PropChainNode[] {
  const chain: PropChainNode[] = [];
  let currentComponent = targetComponent;
  let currentProp = targetProp;
  let depth = 0;

  while (depth < maxDepth) {
    const file = componentToFile.get(currentComponent);
    if (!file) break;

    const propPassing = propPassingByFile.get(file) || [];
    const passingInfo = propPassing.find(
      (p) => p.componentName === currentComponent && p.propName === currentProp
    );

    if (!passingInfo) break;

    chain.push({
      file,
      componentName: currentComponent,
      propName: currentProp,
      sourcePropName: passingInfo.sourcePropName,
      sourceType: passingInfo.sourceType,
    });

    if (passingInfo.sourceType !== "prop" && passingInfo.sourceType !== "destructure") {
      break;
    }

    if (!passingInfo.sourcePropName) break;

    const parts = passingInfo.sourcePropName.split(".");
    currentProp = parts[parts.length - 1];

    depth++;
  }

  return chain.reverse();
}

export function buildPropUpwardFlows(
  componentMap: Map<string, ComponentInfo>,
  usageMap: Map<string, ComponentUsage>,
  propPassingByFile: Map<string, PropPassingInfo[]>,
  maxDepth: number = 10
): Record<string, PropUpwardFlow[]> {
  const result: Record<string, PropUpwardFlow[]> = {};

  for (const [file, comp] of componentMap) {
    const flows: PropUpwardFlow[] = [];
    const usage = usageMap.get(comp.name);
    
    if (!usage || usage.usedIn.length === 0) continue;

    for (const propInfo of comp.props) {
      const propName = propInfo.name;
      const usages: PropUsageSite[] = [];

      for (const location of usage.usedIn) {
        const propAtUsage = location.propsAtUsage?.find(p => p.propName === propName);
        
        if (!propAtUsage) continue;

        const valueSource: PropValueSource = {
          type: propAtUsage.sourceType,
          expression: propAtUsage.sourceExpression,
          sourceName: propAtUsage.sourcePropName || propAtUsage.sourceHookName,
        };

        const upstreamChain = traceUpstream(
          location.componentName,
          location.file,
          propAtUsage,
          usageMap,
          componentMap,
          propPassingByFile,
          new Set(),
          maxDepth
        );

        usages.push({
          parentComponent: location.componentName,
          parentFile: location.file,
          line: location.line,
          valueSource,
          upstreamChain,
        });
      }

      if (usages.length > 0) {
        flows.push({
          componentName: comp.name,
          propName,
          usages,
        });
      }
    }

    if (flows.length > 0) {
      result[comp.name] = flows;
    }
  }

  return result;
}

function traceUpstream(
  componentName: string,
  file: string,
  propAtUsage: PropValueAtUsage,
  usageMap: Map<string, ComponentUsage>,
  componentMap: Map<string, ComponentInfo>,
  propPassingByFile: Map<string, PropPassingInfo[]>,
  visited: Set<string>,
  maxDepth: number
): PropUpstreamNode[] {
  const chain: PropUpstreamNode[] = [];
  
  const visitKey = `${componentName}:${propAtUsage.propName}`;
  if (visited.has(visitKey) || visited.size >= maxDepth) {
    return chain;
  }
  visited.add(visitKey);

  const isTerminal = propAtUsage.sourceType === "hook" || 
                     propAtUsage.sourceType === "query" || 
                     propAtUsage.sourceType === "context" || 
                     propAtUsage.sourceType === "literal";

  chain.push({
    componentName,
    file,
    propName: propAtUsage.propName,
    sourceType: propAtUsage.sourceType === "unknown" ? "computed" : propAtUsage.sourceType,
    sourceName: propAtUsage.sourceExpression,
    isTerminal,
  });

  if (isTerminal) {
    return chain;
  }

  if (propAtUsage.sourceType === "prop" && propAtUsage.sourcePropName) {
    const parentUsage = usageMap.get(componentName);
    if (parentUsage && parentUsage.usedIn.length > 0) {
      const parentLocation = parentUsage.usedIn[0];
      const sourcePropRoot = propAtUsage.sourcePropName.split(".")[0];
      const parentPropAtUsage = parentLocation.propsAtUsage?.find(p => p.propName === sourcePropRoot);
      
      if (parentPropAtUsage) {
        const upstream = traceUpstream(
          parentLocation.componentName,
          parentLocation.file,
          parentPropAtUsage,
          usageMap,
          componentMap,
          propPassingByFile,
          visited,
          maxDepth
        );
        chain.push(...upstream);
      }
    }
  }

  return chain;
}
