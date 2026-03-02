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

export interface RenderCondition {
  expression: string;
  branch: "true" | "false";
}

export interface ComponentTreeNode {
  file: string;
  component: ComponentInfo | null;
  children: ComponentTreeNode[];
  renderCondition?: RenderCondition;
  usageLine?: number;
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
  architectureAnalysis?: ArchitectureAnalysis;
  stats: {
    totalComponents: number;
    clientComponents: number;
    serverComponents: number;
    uniqueHooks: string[];
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

export interface ArchitectureSmell {
  type: "excessive-renaming" | "circular-naming" | "pass-through" | "no-op-function" | "prop-drilling" | "similar-components" | "type-duplication";
  severity: "warning" | "error" | "info";
  message: string;
  suggestion: string;
  location: { file: string; line?: number };
  details?: Record<string, unknown>;
}

export interface PropLineageSummary {
  propName: string;
  origin: string;
  transformationCount: number;
  hasComputation: boolean;
  chain: string[];
}

export interface ComponentUsageSummary {
  componentName: string;
  file: string;
  usedInFiles: string[];
  usedInComponents: string[];
  pageContexts: string[];
  totalUsages: number;
}

export interface SimilarComponentInfo {
  name: string;
  file: string;
  similarity: number;
  sharedProps: string[];
  reason: string;
}

export interface PropFlowNode {
  id: string;
  componentName: string;
  file: string;
  propName: string;
  fullPath?: string;
  line?: number;
  parentFile?: string;
  children: PropFlowNode[];
}

export interface PropOriginInfo {
  type: "hook" | "query" | "context" | "literal" | "computed" | "prop";
  name: string;
  detail?: string;
}

export interface PropFlowTree {
  propName: string;
  componentName: string;
  origin?: PropOriginInfo;
  root: PropFlowNode;
}

export interface PropValueSource {
  type: "prop" | "hook" | "query" | "context" | "literal" | "computed" | "urlParam" | "unknown";
  expression: string;
  sourceName?: string;
}

export interface PropUpstreamNode {
  componentName: string;
  file: string;
  propName?: string;
  sourceType: "prop" | "hook" | "query" | "context" | "literal" | "computed";
  sourceName: string;
  isTerminal: boolean;
}

export interface PropUsageSite {
  parentComponent: string;
  parentFile: string;
  line: number;
  valueSource: PropValueSource;
  upstreamChain: PropUpstreamNode[];
}

export interface PropUpwardFlow {
  componentName: string;
  propName: string;
  usages: PropUsageSite[];
}

export interface ArchitectureAnalysis {
  smells: ArchitectureSmell[];
  propLineages: PropLineageSummary[];
  componentUsages: ComponentUsageSummary[];
  similarComponents: Record<string, SimilarComponentInfo[]>;
  propFlows: Record<string, PropFlowTree[]>;
  propUpwardFlows: Record<string, PropUpwardFlow[]>;
  passThroughComponents: {
    name: string;
    file: string;
    propsReceived: number;
    propsPassedThrough: number;
    ratio: number;
  }[];
  noOpFunctions: {
    name: string;
    file: string;
    renames: Record<string, string>;
  }[];
}

export interface ScreenComponentRef {
  name: string;
  filePath: string;
}

export interface ScreenDeps {
  screen: string;
  pagePath: string;
  components: ScreenComponentRef[];
}

export interface SharedComponentEntry {
  name: string;
  filePath: string;
  usedByScreens: string[];
  usageCount: number;
}

export interface ScreenDepsAnalysis {
  screens: ScreenDeps[];
  sharedComponents: SharedComponentEntry[];
  stats: {
    totalScreens: number;
    totalUniqueComponents: number;
    totalSharedComponents: number;
  };
}
