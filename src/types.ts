export interface PropInfo {
  name: string;
  type: string;
  optional: boolean;
}

export type NextjsFileType =
  | "page"
  | "layout"
  | "loading"
  | "error"
  | "not-found"
  | "template"
  | "route"
  | "default"
  | null;

export interface PropSource {
  source: "serverQuery" | "prop" | "computed" | "literal" | "hook" | "context";
  query?: string;
  propName?: string;
  hookName?: string;
  contextName?: string;
}

export interface PropOrigin {
  propName: string;
  value?: unknown;
  source: PropSource;
  chain: PropOriginChainLink[];
}

export interface PropOriginChainLink {
  componentName: string;
  filePath: string;
  propName?: string;
  hookName?: string;
  queryName?: string;
  contextName?: string;
  type: "component" | "hook" | "query" | "context" | "provider" | "literal";
}

export interface DataFlowNode {
  id: string;
  label: string;
  type: "component" | "prop" | "hook" | "query" | "context" | "literal";
  meta?: Record<string, unknown>;
}

export interface DataFlowEdge {
  from: string;
  to: string;
  label?: string;
}

export interface DataFlowGraph {
  componentName: string;
  filePath: string;
  nodes: DataFlowNode[];
  edges: DataFlowEdge[];
  propOrigins: PropOrigin[];
}

export interface ChildDataFlow {
  component: string;
  props: Record<string, PropSource>;
}

export interface ComponentInfo {
  name: string;
  filePath: string;
  props: PropInfo[];
  hooks: string[];
  serverQueries: string[];
  childDataFlow?: ChildDataFlow[];
  isClientComponent: boolean;
  isServerComponent: boolean;
  nextjsFileType: NextjsFileType;
}

export interface ComponentTreeNode {
  file: string;
  component: ComponentInfo | null;
  children: ComponentTreeNode[];
}

export interface RouteEntryFiles {
  layouts: string[];
  page: string | null;
  loading: string | null;
  error: string | null;
  template: string | null;
  notFound: string | null;
}

export interface RouteAnalysis {
  route: string;
  entryFiles: RouteEntryFiles;
  componentTree: ComponentTreeNode[];
  allComponents: ComponentInfo[];
  stats: {
    totalComponents: number;
    clientComponents: number;
    serverComponents: number;
    uniqueHooks: string[];
  };
}

export interface DependencyNode {
  file: string;
  imports: string[];
}

export interface DependencyAnalysis {
  graph: DependencyNode[];
  circular: string[][];
  orphans: string[];
  warnings: string[];
  stats: {
    totalFiles: number;
    totalImports: number;
    circularCount: number;
    orphanCount: number;
  };
}

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  extension?: string;
  children?: FileNode[];
}

export interface FileTreeAnalysis {
  root: FileNode;
  stats: {
    totalFiles: number;
    totalDirectories: number;
    totalSize: number;
    byExtension: Record<string, number>;
  };
}

export interface RouteInfo {
  path: string;
  filePath: string;
  methods: string[];
  routeType: "pages-api" | "app-route";
  hasMiddleware: boolean;
  params: string[];
}

export interface ApiRouteAnalysis {
  routes: RouteInfo[];
  stats: {
    total: number;
    pagesApiRoutes: number;
    appRoutes: number;
    byMethod: Record<string, number>;
  };
}

export interface ProjectAnalysis {
  components: ComponentInfo[];
  stats: {
    total: number;
    withProps: number;
    clientComponents: number;
    serverComponents: number;
    hookUsage: Record<string, number>;
  };
}

export interface JsxExport {
  exportName: string;
  exportType: "function" | "variable" | "component";
  jsxReturned: string[];
  jsxInProperties: Map<string, string[]>;
}

export interface ProjectJsxExports {
  byFile: Map<string, JsxExport[]>;
}

export interface ResolvedJsxImport {
  localName: string;
  sourceFile: string;
  jsxExport: JsxExport;
}

export interface InferredJsxUsage {
  variableName: string;
  propertyPath: string | null;
  inferredComponents: string[];
}
