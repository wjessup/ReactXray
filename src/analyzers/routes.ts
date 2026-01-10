import { Project, Node } from "ts-morph";
import path from "path";
import { glob } from "glob";
import fs from "fs/promises";

interface RouteInfo {
  path: string;
  filePath: string;
  methods: string[];
  routeType: "pages-api" | "app-route";
  hasMiddleware: boolean;
  params: string[];
}

interface RouteAnalysis {
  routes: RouteInfo[];
  stats: {
    total: number;
    pagesApiRoutes: number;
    appRoutes: number;
    byMethod: Record<string, number>;
  };
}

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export async function analyzeRoutes(targetPath: string): Promise<RouteAnalysis> {
  const routes: RouteInfo[] = [];
  const byMethod: Record<string, number> = {};

  const pagesApiFiles = await glob("pages/api/**/*.{ts,tsx,js,jsx}", {
    cwd: targetPath,
    ignore: ["node_modules/**"],
    absolute: true,
  });

  for (const file of pagesApiFiles) {
    const routeInfo = await analyzePagesApiRoute(file, targetPath);
    if (routeInfo) {
      routes.push(routeInfo);
      routeInfo.methods.forEach((m) => {
        byMethod[m] = (byMethod[m] || 0) + 1;
      });
    }
  }

  const appRouteFiles = await glob("app/**/route.{ts,tsx,js,jsx}", {
    cwd: targetPath,
    ignore: ["node_modules/**"],
    absolute: true,
  });

  for (const file of appRouteFiles) {
    const routeInfo = await analyzeAppRoute(file, targetPath);
    if (routeInfo) {
      routes.push(routeInfo);
      routeInfo.methods.forEach((m) => {
        byMethod[m] = (byMethod[m] || 0) + 1;
      });
    }
  }

  const srcPagesApiFiles = await glob("src/pages/api/**/*.{ts,tsx,js,jsx}", {
    cwd: targetPath,
    ignore: ["node_modules/**"],
    absolute: true,
  });

  for (const file of srcPagesApiFiles) {
    const routeInfo = await analyzePagesApiRoute(file, targetPath);
    if (routeInfo) {
      routes.push(routeInfo);
      routeInfo.methods.forEach((m) => {
        byMethod[m] = (byMethod[m] || 0) + 1;
      });
    }
  }

  const srcAppRouteFiles = await glob("src/app/**/route.{ts,tsx,js,jsx}", {
    cwd: targetPath,
    ignore: ["node_modules/**"],
    absolute: true,
  });

  for (const file of srcAppRouteFiles) {
    const routeInfo = await analyzeAppRoute(file, targetPath);
    if (routeInfo) {
      routes.push(routeInfo);
      routeInfo.methods.forEach((m) => {
        byMethod[m] = (byMethod[m] || 0) + 1;
      });
    }
  }

  return {
    routes,
    stats: {
      total: routes.length,
      pagesApiRoutes: routes.filter((r) => r.routeType === "pages-api").length,
      appRoutes: routes.filter((r) => r.routeType === "app-route").length,
      byMethod,
    },
  };
}

async function analyzePagesApiRoute(filePath: string, targetPath: string): Promise<RouteInfo | null> {
  const relativePath = path.relative(targetPath, filePath);

  let routePath = relativePath
    .replace(/^(src\/)?pages\/api/, "/api")
    .replace(/\.(ts|tsx|js|jsx)$/, "")
    .replace(/\/index$/, "");

  const params = extractRouteParams(routePath);
  routePath = routePath.replace(/\[([^\]]+)\]/g, ":$1");

  const content = await fs.readFile(filePath, "utf-8");
  const methods = detectPagesApiMethods(content);

  return {
    path: routePath || "/api",
    filePath: relativePath,
    methods,
    routeType: "pages-api",
    hasMiddleware: content.includes("middleware"),
    params,
  };
}

async function analyzeAppRoute(filePath: string, targetPath: string): Promise<RouteInfo | null> {
  const relativePath = path.relative(targetPath, filePath);

  let routePath = relativePath
    .replace(/^(src\/)?app/, "")
    .replace(/\/route\.(ts|tsx|js|jsx)$/, "");

  const params = extractRouteParams(routePath);
  routePath = routePath.replace(/\[([^\]]+)\]/g, ":$1");

  const project = new Project({
    compilerOptions: { allowJs: true },
    skipAddingFilesFromTsConfig: true,
  });

  const sourceFile = project.addSourceFileAtPath(filePath);
  const methods: string[] = [];

  const exports = sourceFile.getExportedDeclarations();
  for (const [exportName] of exports) {
    const upperName = exportName.toUpperCase();
    if (HTTP_METHODS.includes(upperName)) {
      methods.push(upperName);
    }
  }

  const content = await fs.readFile(filePath, "utf-8");

  return {
    path: routePath || "/",
    filePath: relativePath,
    methods: methods.length > 0 ? methods : ["GET"],
    routeType: "app-route",
    hasMiddleware: content.includes("middleware"),
    params,
  };
}

function extractRouteParams(routePath: string): string[] {
  const params: string[] = [];
  const regex = /\[([^\]]+)\]/g;
  let match;
  while ((match = regex.exec(routePath)) !== null) {
    params.push(match[1]);
  }
  return params;
}

function detectPagesApiMethods(content: string): string[] {
  const methods: string[] = [];

  if (content.includes("export default")) {
    if (content.includes('req.method')) {
      for (const method of HTTP_METHODS) {
        if (content.includes(`"${method}"`) || content.includes(`'${method}'`)) {
          methods.push(method);
        }
      }
    }

    if (methods.length === 0) {
      methods.push("ALL");
    }
  }

  return methods;
}
