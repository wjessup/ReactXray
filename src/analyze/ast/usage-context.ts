import { Project, SourceFile, Node } from "ts-morph";
import path from "path";
import { glob } from "glob";

export interface ComponentUsage {
  componentName: string;
  componentFile: string;
  usedIn: UsageLocation[];
  pageContexts: string[];
  totalUsageCount: number;
}

export interface PropValueAtUsage {
  propName: string;
  sourceExpression: string;
  sourceType: "prop" | "hook" | "query" | "context" | "literal" | "computed" | "unknown";
  sourcePropName?: string;
  sourceHookName?: string;
}

export interface UsageLocation {
  file: string;
  componentName: string;
  line: number;
  isDirectImport: boolean;
  propsAtUsage: PropValueAtUsage[];
}

export interface SimilarComponent {
  name: string;
  file: string;
  similarity: number;
  sharedProps: string[];
  uniqueProps: string[];
  reason: string;
}

export interface TypeSimilarity {
  typeName: string;
  file: string;
  fields: string[];
}

export interface UsageContextAnalysis {
  componentUsages: Map<string, ComponentUsage>;
  similarComponents: Map<string, SimilarComponent[]>;
  typeSimilarities: TypeSimilarity[][];
}

export function buildComponentUsageMap(
  project: Project,
  componentFiles: Map<string, string>,
  targetPath: string
): Map<string, ComponentUsage> {
  const usageMap = new Map<string, ComponentUsage>();

  for (const [name, file] of componentFiles) {
    usageMap.set(name, {
      componentName: name,
      componentFile: file,
      usedIn: [],
      pageContexts: [],
      totalUsageCount: 0,
    });
  }

  const sourceFiles = project.getSourceFiles();
  
  for (const sourceFile of sourceFiles) {
    const absPath = sourceFile.getFilePath();
    const filePath = path.relative(targetPath, absPath);
    if (filePath.includes("node_modules") || filePath.startsWith("..")) continue;

    const importedComponents = new Set<string>();

    for (const importDecl of sourceFile.getImportDeclarations()) {
      for (const namedImport of importDecl.getNamedImports()) {
        const importName = namedImport.getName();
        if (componentFiles.has(importName)) {
          importedComponents.add(importName);
        }
      }

      const defaultImport = importDecl.getDefaultImport();
      if (defaultImport) {
        const defaultName = defaultImport.getText();
        if (componentFiles.has(defaultName)) {
          importedComponents.add(defaultName);
        }
      }
    }

    if (importedComponents.size === 0) continue;

    const parentComponentName = getComponentNameFromFile(sourceFile);

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
              destructuredFromProp.set(element.getNameNode().getText(), sourceName);
            }
          }
        }
      }
    });

    sourceFile.forEachDescendant((node) => {
      if (Node.isJsxElement(node) || Node.isJsxSelfClosingElement(node)) {
        const tagNode = Node.isJsxElement(node)
          ? node.getOpeningElement().getTagNameNode()
          : node.getTagNameNode();

        const tagName = tagNode.getText();

        if (importedComponents.has(tagName)) {
          const usage = usageMap.get(tagName);
          if (usage) {
            const alreadyRecorded = usage.usedIn.some(
              u => u.file === filePath && u.line === node.getStartLineNumber()
            );
            if (!alreadyRecorded) {
              const propsAtUsage = extractPropsFromJsx(node, propVars, hookVars, destructuredFromProp);
              usage.usedIn.push({
                file: filePath,
                componentName: parentComponentName || filePath,
                line: node.getStartLineNumber(),
                isDirectImport: true,
                propsAtUsage,
              });
              usage.totalUsageCount++;

              if (isPageFile(filePath)) {
                const pageContext = extractPageContext(filePath);
                if (!usage.pageContexts.includes(pageContext)) {
                  usage.pageContexts.push(pageContext);
                }
              }
            }
          }
        }
      }
    });
  }

  propagatePageContexts(usageMap, project, targetPath);

  return usageMap;
}

function getComponentNameFromFile(sourceFile: SourceFile): string | null {
  const defaultExport = sourceFile.getDefaultExportSymbol();
  if (defaultExport) {
    const name = defaultExport.getName();
    if (name !== "default") return name;

    for (const decl of defaultExport.getDeclarations()) {
      if (Node.isFunctionDeclaration(decl)) {
        return decl.getName() || null;
      }
      if (Node.isVariableDeclaration(decl)) {
        return decl.getName();
      }
    }
  }

  for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
    if (name !== "default" && /^[A-Z]/.test(name)) {
      return name;
    }
  }

  return null;
}

function isPageFile(filePath: string): boolean {
  return (
    filePath.includes("/app/") && 
    (filePath.endsWith("page.tsx") || 
     filePath.endsWith("page.jsx") ||
     filePath.endsWith("page.ts") ||
     filePath.endsWith("page.js"))
  );
}

function extractPageContext(filePath: string): string {
  const match = filePath.match(/app\/(.+?)\/page\./);
  if (match) {
    return match[1].replace(/\//g, " > ");
  }
  return filePath;
}

function propagatePageContexts(
  usageMap: Map<string, ComponentUsage>,
  project: Project,
  targetPath: string
): void {
  const componentToFile = new Map<string, string>();
  for (const [name, usage] of usageMap) {
    componentToFile.set(name, usage.componentFile);
  }

  let changed = true;
  let iterations = 0;
  const maxIterations = 10;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    for (const [name, usage] of usageMap) {
      for (const location of usage.usedIn) {
        const parentUsage = findUsageByFile(usageMap, location.file);
        if (parentUsage) {
          for (const ctx of parentUsage.pageContexts) {
            if (!usage.pageContexts.includes(ctx)) {
              usage.pageContexts.push(ctx);
              changed = true;
            }
          }
        }
      }
    }
  }
}

function findUsageByFile(
  usageMap: Map<string, ComponentUsage>,
  file: string
): ComponentUsage | null {
  for (const usage of usageMap.values()) {
    if (usage.componentFile === file) {
      return usage;
    }
  }
  return null;
}

export function findSimilarComponents(
  componentMap: Map<string, { name: string; file: string; props: string[] }>,
  threshold: number = 0.5
): Map<string, SimilarComponent[]> {
  const similarities = new Map<string, SimilarComponent[]>();

  const components = Array.from(componentMap.values());

  for (let i = 0; i < components.length; i++) {
    const compA = components[i];
    const similar: SimilarComponent[] = [];

    const filteredPropsA = filterSignificantProps(compA.props);
    if (filteredPropsA.length < 2) continue;

    for (let j = 0; j < components.length; j++) {
      if (i === j) continue;

      const compB = components[j];

      const filteredPropsB = filterSignificantProps(compB.props);
      if (filteredPropsB.length < 2) continue;

      const nameSimilarity = calculateNameSimilarity(compA.name, compB.name);
      const propSimilarity = calculatePropSimilarity(compA.props, compB.props);
      const combinedSimilarity = (nameSimilarity * 0.3) + (propSimilarity * 0.7);

      if (combinedSimilarity >= threshold) {
        const setBFiltered = new Set(filteredPropsB);
        const sharedProps = filteredPropsA.filter(p => setBFiltered.has(p));
        const uniquePropsA = filteredPropsA.filter(p => !setBFiltered.has(p));

        if (sharedProps.length < 2) continue;

        let reason = "";
        if (nameSimilarity > 0.7) {
          reason = "Similar names";
        } else if (sharedProps.length >= 3) {
          reason = `${sharedProps.length} shared props`;
        } else {
          reason = "Partial overlap";
        }

        similar.push({
          name: compB.name,
          file: compB.file,
          similarity: combinedSimilarity,
          sharedProps,
          uniqueProps: uniquePropsA,
          reason,
        });
      }
    }

    if (similar.length > 0) {
      similar.sort((a, b) => b.similarity - a.similarity);
      similarities.set(compA.name, similar);
    }
  }

  return similarities;
}

function calculateNameSimilarity(nameA: string, nameB: string): number {
  const wordsA = splitCamelCase(nameA);
  const wordsB = splitCamelCase(nameB);

  const commonWords = wordsA.filter(w => wordsB.includes(w));
  const totalWords = new Set([...wordsA, ...wordsB]).size;

  return commonWords.length / totalWords;
}

function splitCamelCase(str: string): string[] {
  return str
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(" ");
}

const INTRINSIC_PROPS = new Set([
  'children', 'className', 'style', 'id', 'key', 'ref',
  'onClick', 'onChange', 'onSubmit', 'onBlur', 'onFocus', 'onInput',
  'onKeyDown', 'onKeyUp', 'onKeyPress', 'onMouseDown', 'onMouseUp',
  'disabled', 'hidden', 'title', 'role', 'tabIndex', 'slot',
  'defaultValue', 'defaultChecked', 'value', 'checked',
  'placeholder', 'name', 'type', 'href', 'src', 'alt',
  'autoFocus', 'autoComplete', 'required', 'readOnly',
  'min', 'max', 'step', 'pattern', 'maxLength', 'minLength',
  'width', 'height', 'loading', 'fetchPriority',
  'target', 'download', 'hrefLang', 'media', 'ping', 'referrerPolicy',
  'form', 'formAction', 'formEncType', 'formMethod', 'formNoValidate', 'formTarget',
  'list', 'multiple', 'accept', 'capture', 'size',
  'rows', 'cols', 'wrap', 'spellCheck', 'autoCapitalize',
  'dir', 'draggable', 'lang', 'translate', 'nonce',
  'contentEditable', 'contextMenu', 'enterKeyHint', 'inputMode',
  'accessKey', 'suppressContentEditableWarning', 'suppressHydrationWarning',
  'about', 'content', 'datatype', 'inlist', 'prefix', 'property',
  'rel', 'resource', 'rev', 'typeof', 'vocab', 'radioGroup',
  'autoCorrect', 'autoSave', 'color', 'itemProp', 'itemScope',
  'itemType', 'itemID', 'itemRef', 'results', 'security', 'unselectable',
  'popover', 'popoverTarget', 'popoverTargetAction', 'inert',
  'is', 'exportparts', 'part', 'tw', 'dangerouslySetInnerHTML',
  'asChild', 'forwardedRef', 'as',
]);

const INTRINSIC_PREFIXES = ['on', 'aria-', 'data-'];

function filterSignificantProps(props: string[]): string[] {
  return props.filter(p => {
    if (INTRINSIC_PROPS.has(p)) return false;
    for (const prefix of INTRINSIC_PREFIXES) {
      if (p.startsWith(prefix)) return false;
    }
    if (p.length <= 2) return false;
    return true;
  });
}

function calculatePropSimilarity(propsA: string[], propsB: string[]): number {
  const filteredA = filterSignificantProps(propsA);
  const filteredB = filterSignificantProps(propsB);

  if (filteredA.length === 0 && filteredB.length === 0) return 0;
  if (filteredA.length < 2 || filteredB.length < 2) return 0;

  const setB = new Set(filteredB);
  const intersection = filteredA.filter(p => setB.has(p)).length;
  
  if (intersection < 2) return 0;
  
  const union = new Set([...filteredA, ...filteredB]).size;

  return intersection / union;
}

export function findTypeSimilarities(
  project: Project,
  targetPath: string,
  threshold: number = 0.6
): TypeSimilarity[][] {
  const types: TypeSimilarity[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = path.relative(targetPath, sourceFile.getFilePath());
    if (filePath.includes("node_modules")) continue;

    for (const typeAlias of sourceFile.getTypeAliases()) {
      const name = typeAlias.getName();
      const fields = extractTypeFields(typeAlias);
      if (fields.length > 0) {
        types.push({ typeName: name, file: filePath, fields });
      }
    }

    for (const iface of sourceFile.getInterfaces()) {
      const name = iface.getName();
      const fields = iface.getProperties().map(p => p.getName());
      if (fields.length > 0) {
        types.push({ typeName: name, file: filePath, fields });
      }
    }
  }

  const groups: TypeSimilarity[][] = [];
  const used = new Set<number>();

  for (let i = 0; i < types.length; i++) {
    if (used.has(i)) continue;

    const group = [types[i]];
    used.add(i);

    for (let j = i + 1; j < types.length; j++) {
      if (used.has(j)) continue;

      const similarity = calculatePropSimilarity(types[i].fields, types[j].fields);
      if (similarity >= threshold) {
        group.push(types[j]);
        used.add(j);
      }
    }

    if (group.length > 1) {
      groups.push(group);
    }
  }

  return groups;
}

function extractTypeFields(typeAlias: Node): string[] {
  const text = typeAlias.getText();
  const fieldMatch = text.match(/\{([^}]+)\}/);
  if (!fieldMatch) return [];

  const fields: string[] = [];
  const fieldRegex = /(\w+)\s*[?:]?\s*:/g;
  let match;
  while ((match = fieldRegex.exec(fieldMatch[1])) !== null) {
    fields.push(match[1]);
  }

  return fields;
}

function extractPropsFromJsx(
  jsxNode: Node,
  propVars: Map<string, string>,
  hookVars: Map<string, string>,
  destructuredFromProp: Map<string, string>
): PropValueAtUsage[] {
  const results: PropValueAtUsage[] = [];

  const attributes = Node.isJsxElement(jsxNode)
    ? jsxNode.getOpeningElement().getAttributes()
    : (jsxNode as any).getAttributes();

  for (const attr of attributes) {
    if (Node.isJsxSpreadAttribute(attr)) {
      const expr = attr.getExpression();
      const exprText = expr.getText();
      results.push({
        propName: "...spread",
        sourceExpression: exprText,
        sourceType: propVars.has(exprText) ? "prop" : hookVars.has(exprText) ? "hook" : "computed",
        sourcePropName: propVars.get(exprText),
        sourceHookName: hookVars.get(exprText),
      });
      continue;
    }

    if (!Node.isJsxAttribute(attr)) continue;

    const propName = attr.getNameNode().getText();
    const initializer = attr.getInitializer();

    if (!initializer) {
      results.push({
        propName,
        sourceExpression: "true",
        sourceType: "literal",
      });
      continue;
    }

    if (Node.isStringLiteral(initializer)) {
      results.push({
        propName,
        sourceExpression: initializer.getText(),
        sourceType: "literal",
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
            propName,
            sourceExpression: exprText,
            sourceType: "prop",
            sourcePropName: propVars.get(exprText),
          });
        } else if (hookVars.has(exprText)) {
          results.push({
            propName,
            sourceExpression: exprText,
            sourceType: "hook",
            sourceHookName: hookVars.get(exprText),
          });
        } else if (destructuredFromProp.has(exprText)) {
          results.push({
            propName,
            sourceExpression: exprText,
            sourceType: "prop",
            sourcePropName: destructuredFromProp.get(exprText) + "." + exprText,
          });
        } else {
          results.push({
            propName,
            sourceExpression: exprText,
            sourceType: "computed",
          });
        }
      } else if (Node.isPropertyAccessExpression(expr)) {
        const objText = expr.getExpression().getText();
        const propAccess = expr.getName();

        if (propVars.has(objText)) {
          results.push({
            propName,
            sourceExpression: exprText,
            sourceType: "prop",
            sourcePropName: `${propVars.get(objText)}.${propAccess}`,
          });
        } else if (hookVars.has(objText)) {
          results.push({
            propName,
            sourceExpression: exprText,
            sourceType: "hook",
            sourceHookName: `${hookVars.get(objText)}.${propAccess}`,
          });
        } else {
          results.push({
            propName,
            sourceExpression: exprText,
            sourceType: "computed",
          });
        }
      } else if (Node.isCallExpression(expr)) {
        const callText = expr.getExpression().getText();
        if (callText.startsWith("use") && /^use[A-Z]/.test(callText)) {
          results.push({
            propName,
            sourceExpression: exprText,
            sourceType: "hook",
            sourceHookName: callText,
          });
        } else if (callText === "await" || exprText.includes("await")) {
          results.push({
            propName,
            sourceExpression: exprText,
            sourceType: "query",
          });
        } else {
          results.push({
            propName,
            sourceExpression: exprText,
            sourceType: "computed",
          });
        }
      } else {
        results.push({
          propName,
          sourceExpression: exprText,
          sourceType: "computed",
        });
      }
    }
  }

  return results;
}

export interface ComponentContextSummary {
  componentName: string;
  file: string;
  directParents: string[];
  pageContexts: string[];
  totalUsages: number;
  similarComponents: SimilarComponent[];
  contextWarnings: string[];
}

export function generateComponentContextSummary(
  componentName: string,
  usageMap: Map<string, ComponentUsage>,
  similarMap: Map<string, SimilarComponent[]>
): ComponentContextSummary | null {
  const usage = usageMap.get(componentName);
  if (!usage) return null;

  const directParents = [...new Set(usage.usedIn.map(u => u.componentName))];
  const similar = similarMap.get(componentName) || [];

  const warnings: string[] = [];

  if (usage.pageContexts.length > 3) {
    warnings.push(`Used in ${usage.pageContexts.length} different page contexts - may be too generic`);
  }

  if (similar.length > 0) {
    const highSimilarity = similar.filter(s => s.similarity > 0.7);
    if (highSimilarity.length > 0) {
      warnings.push(`${highSimilarity.length} similar component(s) found - consider unification`);
    }
  }

  if (directParents.length === 1 && usage.totalUsageCount === 1) {
    warnings.push("Only used in one place - consider inlining if not reused");
  }

  return {
    componentName,
    file: usage.componentFile,
    directParents,
    pageContexts: usage.pageContexts,
    totalUsages: usage.totalUsageCount,
    similarComponents: similar.slice(0, 5),
    contextWarnings: warnings,
  };
}

export async function buildProjectWideUsageMap(
  targetPath: string,
  componentFiles: Map<string, string>
): Promise<Map<string, ComponentUsage>> {
  const usageMap = new Map<string, ComponentUsage>();

  for (const [name, file] of componentFiles) {
    usageMap.set(name, {
      componentName: name,
      componentFile: file,
      usedIn: [],
      pageContexts: [],
      totalUsageCount: 0,
    });
  }

  const files = await glob("**/*.{tsx,jsx}", {
    cwd: targetPath,
    ignore: ["node_modules/**", ".next/**", "dist/**", "build/**"],
    absolute: true,
  });

  const project = new Project({
    compilerOptions: { allowJs: true, jsx: 2 },
    skipAddingFilesFromTsConfig: true,
  });

  for (const file of files) {
    try {
      project.addSourceFileAtPath(file);
    } catch {}
  }

  for (const sourceFile of project.getSourceFiles()) {
    const absPath = sourceFile.getFilePath();
    const filePath = path.relative(targetPath, absPath);
    if (filePath.includes("node_modules") || filePath.startsWith("..")) continue;

    const importedComponents = new Set<string>();

    for (const importDecl of sourceFile.getImportDeclarations()) {
      for (const namedImport of importDecl.getNamedImports()) {
        const importName = namedImport.getName();
        if (componentFiles.has(importName)) {
          importedComponents.add(importName);
        }
      }

      const defaultImport = importDecl.getDefaultImport();
      if (defaultImport) {
        const defaultName = defaultImport.getText();
        if (componentFiles.has(defaultName)) {
          importedComponents.add(defaultName);
        }
      }
    }

    if (importedComponents.size === 0) continue;

    const parentComponentName = getComponentNameFromFile(sourceFile);

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
              destructuredFromProp.set(element.getNameNode().getText(), sourceName);
            }
          }
        }
      }
    });

    sourceFile.forEachDescendant((node) => {
      if (Node.isJsxElement(node) || Node.isJsxSelfClosingElement(node)) {
        const tagNode = Node.isJsxElement(node)
          ? node.getOpeningElement().getTagNameNode()
          : node.getTagNameNode();

        const tagName = tagNode.getText();

        if (importedComponents.has(tagName)) {
          const usage = usageMap.get(tagName);
          if (usage) {
            const alreadyRecorded = usage.usedIn.some(
              u => u.file === filePath && u.line === node.getStartLineNumber()
            );
            if (!alreadyRecorded) {
              const propsAtUsage = extractPropsFromJsx(node, propVars, hookVars, destructuredFromProp);
              usage.usedIn.push({
                file: filePath,
                componentName: parentComponentName || filePath,
                line: node.getStartLineNumber(),
                isDirectImport: true,
                propsAtUsage,
              });
              usage.totalUsageCount++;

              if (isPageFile(filePath)) {
                const pageContext = extractPageContext(filePath);
                if (!usage.pageContexts.includes(pageContext)) {
                  usage.pageContexts.push(pageContext);
                }
              }
            }
          }
        }
      }
    });
  }

  propagatePageContextsForProjectWide(usageMap);

  return usageMap;
}

function propagatePageContextsForProjectWide(
  usageMap: Map<string, ComponentUsage>
): void {
  let changed = true;
  let iterations = 0;
  const maxIterations = 10;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    for (const [name, usage] of usageMap) {
      for (const location of usage.usedIn) {
        const parentUsage = findUsageByComponentName(usageMap, location.componentName);
        if (parentUsage) {
          for (const ctx of parentUsage.pageContexts) {
            if (!usage.pageContexts.includes(ctx)) {
              usage.pageContexts.push(ctx);
              changed = true;
            }
          }
        }
      }
    }
  }
}

function findUsageByComponentName(
  usageMap: Map<string, ComponentUsage>,
  componentName: string
): ComponentUsage | null {
  return usageMap.get(componentName) || null;
}
