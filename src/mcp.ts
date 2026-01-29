import fs from "fs/promises";
import path from "path";
import type { ComponentTreeNode } from "./types.js";
import { analyzeRoute } from "./analyze/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

type RouteCacheEntry = { key: string; value: unknown };

const routeCache = new Map<string, RouteCacheEntry>();

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function collectComponentNamesFromTree(nodes: ComponentTreeNode[]): Set<string> {
  const names = new Set<string>();
  const visit = (n: ComponentTreeNode) => {
    if (n.component?.name) names.add(n.component.name);
    for (const c of n.children) visit(c);
  };
  for (const n of nodes) visit(n);
  return names;
}

async function getRouteAnalysis(projectPath: string, route: string) {
  const absProjectPath = path.resolve(projectPath);
  if (!(await pathExists(absProjectPath))) {
    throw new Error(`Project path does not exist: ${absProjectPath}`);
  }

  const key = `${absProjectPath}::${route}`;
  const cached = routeCache.get(key);
  if (cached) return cached.value as Awaited<ReturnType<typeof analyzeRoute>>;

  const value = await analyzeRoute(absProjectPath, route);
  routeCache.set(key, { key, value });
  if (routeCache.size > 5) {
    const firstKey = routeCache.keys().next().value;
    if (firstKey) routeCache.delete(firstKey);
  }
  return value;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function okJson(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

const server = new Server(
  { name: "repo-analyzer", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "analyze_route",
        description: "Analyze a Next.js route and return a compact summary",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["projectPath", "route"],
          properties: {
            projectPath: { type: "string" },
            route: { type: "string" },
            includeTree: { type: "boolean" },
            includeAllComponents: { type: "boolean" },
            includeArchitecture: { type: "boolean" },
          },
        },
      },
      {
        name: "list_route_components",
        description: "List components present in a route tree",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["projectPath", "route"],
          properties: {
            projectPath: { type: "string" },
            route: { type: "string" },
          },
        },
      },
      {
        name: "component_prop",
        description:
          "Return prop flow tree (where it flows to) and usage sites (where it comes from) for one component prop on a route",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["projectPath", "route", "component", "prop"],
          properties: {
            projectPath: { type: "string" },
            route: { type: "string" },
            component: { type: "string" },
            prop: { type: "string" },
          },
        },
      },
      {
        name: "component_context",
        description:
          "Return compact architecture context for a component from a route analysis",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["projectPath", "route", "component"],
          properties: {
            projectPath: { type: "string" },
            route: { type: "string" },
            component: { type: "string" },
          },
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const params = asObject(request.params);
  const toolName = String(params.name || "");
  const input = asObject(params.arguments);

  if (toolName === "analyze_route") {
    const projectPath = String(input.projectPath || "");
    const route = String(input.route || "");
    const includeTree = Boolean(input.includeTree);
    const includeAllComponents = Boolean(input.includeAllComponents);
    const includeArchitecture = Boolean(input.includeArchitecture);

    const result = await getRouteAnalysis(projectPath, route);

    return okJson({
      route: result.route,
      entryFiles: result.entryFiles,
      stats: result.stats,
      componentTree: includeTree ? result.componentTree : undefined,
      allComponents: includeAllComponents ? result.allComponents : undefined,
      architectureAnalysis: includeArchitecture ? result.architectureAnalysis : undefined,
    });
  }

  if (toolName === "list_route_components") {
    const projectPath = String(input.projectPath || "");
    const route = String(input.route || "");
    const result = await getRouteAnalysis(projectPath, route);
    const names = collectComponentNamesFromTree(result.componentTree);
    return okJson({
      route: result.route,
      components: [...names].sort(),
    });
  }

  if (toolName === "component_prop") {
    const projectPath = String(input.projectPath || "");
    const route = String(input.route || "");
    const component = String(input.component || "");
    const prop = String(input.prop || "");

    const result = await getRouteAnalysis(projectPath, route);
    const arch = result.architectureAnalysis;
    const routeComponents = collectComponentNamesFromTree(result.componentTree);

    const flow =
      arch?.propFlows?.[component]?.find((f) => f.propName === prop) || null;
    const upward =
      arch?.propUpwardFlows?.[component]?.find((f) => f.propName === prop) ||
      null;

    const comesFromAll = upward ? upward.usages : [];
    const comesFromInRoute = comesFromAll.filter((u) =>
      routeComponents.has(u.parentComponent)
    );

    return okJson({
      route: result.route,
      component,
      prop,
      whereItFlowsTo: flow?.root || null,
      whereItComesFrom: comesFromAll,
      whereItComesFromInRoute: comesFromInRoute,
    });
  }

  if (toolName === "component_context") {
    const projectPath = String(input.projectPath || "");
    const route = String(input.route || "");
    const component = String(input.component || "");

    const result = await getRouteAnalysis(projectPath, route);
    const arch = result.architectureAnalysis;

    const usage = arch?.componentUsages?.find((u) => u.componentName === component) || null;
    const similar = arch?.similarComponents?.[component] || [];
    const passThrough = arch?.passThroughComponents?.find((p) => p.name === component) || null;
    const smells = (arch?.smells || []).filter(
      (s) =>
        (typeof s.location?.file === "string" && usage?.file && s.location.file === usage.file) ||
        (typeof s.message === "string" && s.message.includes(component))
    );

    return okJson({
      route: result.route,
      component,
      usage,
      similar,
      passThrough,
      smells,
    });
  }

  throw new Error(`Unknown tool: ${toolName}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
