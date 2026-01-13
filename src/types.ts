export interface PropInfo {
  name: string;
  type: string;
  optional: boolean;
}

export interface ComponentInfo {
  name: string;
  filePath: string;
  props: PropInfo[];
  hooks: string[];
  serverQueries: string[];
  isClientComponent: boolean;
  isServerComponent: boolean;
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
