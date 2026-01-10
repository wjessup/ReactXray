import { Project, SyntaxKind, Node } from "ts-morph";
import path from "path";
import { glob } from "glob";

interface ComponentInfo {
  name: string;
  filePath: string;
  exportType: "default" | "named";
  props: PropInfo[];
  hooks: string[];
  isClientComponent: boolean;
  isServerComponent: boolean;
}

interface PropInfo {
  name: string;
  type: string;
  optional: boolean;
}

interface ComponentAnalysis {
  components: ComponentInfo[];
  stats: {
    total: number;
    withProps: number;
    clientComponents: number;
    serverComponents: number;
    hookUsage: Record<string, number>;
  };
}

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

export async function analyzeComponents(targetPath: string): Promise<ComponentAnalysis> {
  const files = await glob("**/*.{tsx,jsx}", {
    cwd: targetPath,
    ignore: ["node_modules/**", ".next/**", "dist/**", "build/**"],
    absolute: true,
  });

  const project = new Project({
    compilerOptions: { allowJs: true, jsx: 2 },
    skipAddingFilesFromTsConfig: true,
  });

  files.forEach((file) => project.addSourceFileAtPath(file));

  const components: ComponentInfo[] = [];
  const hookUsage: Record<string, number> = {};

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = path.relative(targetPath, sourceFile.getFilePath());
    const fileText = sourceFile.getFullText();

    const isClientComponent = fileText.includes('"use client"') || fileText.includes("'use client'");
    const isServerComponent = fileText.includes('"use server"') || fileText.includes("'use server'");

    const defaultExport = sourceFile.getDefaultExportSymbol();
    if (defaultExport) {
      const declarations = defaultExport.getDeclarations();
      for (const decl of declarations) {
        const componentInfo = extractComponentInfo(decl, filePath, "default", isClientComponent, isServerComponent);
        if (componentInfo) {
          componentInfo.hooks = findHooksInNode(decl, hookUsage);
          components.push(componentInfo);
        }
      }
    }

    const namedExports = sourceFile.getExportedDeclarations();
    for (const [exportName, declarations] of namedExports) {
      if (exportName === "default") continue;
      for (const decl of declarations) {
        const componentInfo = extractComponentInfo(decl, filePath, "named", isClientComponent, isServerComponent);
        if (componentInfo) {
          componentInfo.name = exportName;
          componentInfo.hooks = findHooksInNode(decl, hookUsage);
          components.push(componentInfo);
        }
      }
    }
  }

  return {
    components,
    stats: {
      total: components.length,
      withProps: components.filter((c) => c.props.length > 0).length,
      clientComponents: components.filter((c) => c.isClientComponent).length,
      serverComponents: components.filter((c) => c.isServerComponent).length,
      hookUsage,
    },
  };
}

function extractComponentInfo(
  node: Node,
  filePath: string,
  exportType: "default" | "named",
  isClientComponent: boolean,
  isServerComponent: boolean
): ComponentInfo | null {
  if (Node.isFunctionDeclaration(node) || Node.isArrowFunction(node) || Node.isFunctionExpression(node)) {
    const name = Node.isFunctionDeclaration(node) ? node.getName() || "Anonymous" : "Anonymous";

    if (!looksLikeComponent(node)) return null;

    const props = extractProps(node);

    return {
      name,
      filePath,
      exportType,
      props,
      hooks: [],
      isClientComponent,
      isServerComponent,
    };
  }

  if (Node.isVariableDeclaration(node)) {
    const initializer = node.getInitializer();
    if (initializer && (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer))) {
      if (!looksLikeComponent(initializer)) return null;

      const props = extractProps(initializer);

      return {
        name: node.getName(),
        filePath,
        exportType,
        props,
        hooks: [],
        isClientComponent,
        isServerComponent,
      };
    }
  }

  return null;
}

function looksLikeComponent(node: Node): boolean {
  const text = node.getText();
  return text.includes("return") && (text.includes("<") || text.includes("jsx"));
}

function extractProps(node: Node): PropInfo[] {
  const props: PropInfo[] = [];

  if (Node.isFunctionDeclaration(node) || Node.isArrowFunction(node) || Node.isFunctionExpression(node)) {
    const params = node.getParameters();
    if (params.length > 0) {
      const firstParam = params[0];
      const typeNode = firstParam.getTypeNode();

      if (typeNode && Node.isTypeLiteral(typeNode)) {
        for (const member of typeNode.getMembers()) {
          if (Node.isPropertySignature(member)) {
            props.push({
              name: member.getName(),
              type: member.getType().getText(),
              optional: member.hasQuestionToken(),
            });
          }
        }
      }
    }
  }

  return props;
}

function findHooksInNode(node: Node, hookUsage: Record<string, number>): string[] {
  const hooks: string[] = [];
  const text = node.getText();

  for (const hook of REACT_HOOKS) {
    const regex = new RegExp(`\\b${hook}\\s*\\(`, "g");
    const matches = text.match(regex);
    if (matches) {
      hooks.push(hook);
      hookUsage[hook] = (hookUsage[hook] || 0) + matches.length;
    }
  }

  const customHookRegex = /\buse[A-Z]\w*\s*\(/g;
  const customMatches = text.match(customHookRegex);
  if (customMatches) {
    for (const match of customMatches) {
      const hookName = match.replace(/\s*\($/, "");
      if (!REACT_HOOKS.includes(hookName) && !hooks.includes(hookName)) {
        hooks.push(hookName);
        hookUsage[hookName] = (hookUsage[hookName] || 0) + 1;
      }
    }
  }

  return hooks;
}
