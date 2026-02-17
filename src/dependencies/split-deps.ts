import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Component {
  name: string;
  filePath: string;
}

interface Screen {
  screen: string;
  pagePath: string;
  components: Component[];
}

interface SharedComponent {
  name: string;
  filePath: string;
  usedByScreens: string[];
  usageCount: number;
}

interface Stats {
  totalScreens: number;
  totalUniqueComponents: number;
  totalSharedComponents: number;
}

interface ScreenDeps {
  screens: Screen[];
  sharedComponents: SharedComponent[];
  stats: Stats;
}

const FEATURE_WEIGHT = 3;
const SHARED_WEIGHT = 1;
const UNIQUE_WEIGHT = 2;

export function splitDeps(inputPath: string) {
  const outputDir = dirname(inputPath);
  const depsDir = resolve(outputDir, "deps");
  const screensDir = resolve(depsDir, "screens");

  if (!existsSync(depsDir)) mkdirSync(depsDir, { recursive: true });
  if (!existsSync(screensDir)) mkdirSync(screensDir, { recursive: true });

  const data: ScreenDeps = JSON.parse(readFileSync(inputPath, "utf-8"));
  const sharedSet = new Set(data.sharedComponents.map((c) => c.filePath));

  function classifyComponent(comp: Component): "shared" | "feature" | "unique" {
    if (sharedSet.has(comp.filePath)) return "shared";
    if (comp.filePath.includes("\\features\\") || comp.filePath.includes("/features/"))
      return "feature";
    return "unique";
  }

  function screenToSlug(screen: Screen): string {
    return screen.pagePath
      .replace(/^src\\app\\/, "")
      .replace(/\\/g, "__")
      .replace(/\.tsx$/, "")
      .replace(/[^a-zA-Z0-9_\-\[\]()]/g, "_");
  }

  interface ClassifiedComponent extends Component {
    type: "shared" | "feature" | "unique";
  }

  interface ScreenSummary {
    slug: string;
    screen: string;
    pagePath: string;
    file: string;
    componentCount: number;
    featureCount: number;
    sharedCount: number;
    uniqueCount: number;
    complexity: number;
    complexityLevel: "low" | "medium" | "high" | "critical";
  }

  function complexityLevel(score: number): "low" | "medium" | "high" | "critical" {
    if (score <= 15) return "low";
    if (score <= 50) return "medium";
    if (score <= 100) return "high";
    return "critical";
  }

  const screenSummaries: ScreenSummary[] = [];

  for (const screen of data.screens) {
    const slug = screenToSlug(screen);
    const classified: ClassifiedComponent[] = screen.components.map((c) => ({
      ...c,
      type: classifyComponent(c),
    }));

    let featureCount = 0;
    let sharedCount = 0;
    let uniqueCount = 0;
    let complexity = 0;

    for (const c of classified) {
      if (c.type === "feature") {
        featureCount++;
        complexity += FEATURE_WEIGHT;
      } else if (c.type === "shared") {
        sharedCount++;
        complexity += SHARED_WEIGHT;
      } else {
        uniqueCount++;
        complexity += UNIQUE_WEIGHT;
      }
    }

    const screenFile = {
      screen: screen.screen,
      pagePath: screen.pagePath,
      complexity,
      complexityLevel: complexityLevel(complexity),
      componentCount: screen.components.length,
      breakdown: {
        feature: featureCount,
        shared: sharedCount,
        unique: uniqueCount,
      },
      components: classified,
    };

    const filename = `${slug}.json`;
    writeFileSync(
      resolve(screensDir, filename),
      JSON.stringify(screenFile, null, 2),
      "utf-8"
    );

    screenSummaries.push({
      slug,
      screen: screen.screen,
      pagePath: screen.pagePath,
      file: `screens/${filename}`,
      componentCount: screen.components.length,
      featureCount,
      sharedCount,
      uniqueCount,
      complexity,
      complexityLevel: complexityLevel(complexity),
    });
  }

  screenSummaries.sort((a, b) => b.complexity - a.complexity);

  const sharedSorted = [...data.sharedComponents].sort(
    (a, b) => b.usageCount - a.usageCount
  );

  const sharedComponentsFile = {
    totalSharedComponents: data.stats.totalSharedComponents,
    components: sharedSorted.map((c) => ({
      name: c.name,
      filePath: c.filePath,
      usageCount: c.usageCount,
      usedByScreens: c.usedByScreens,
    })),
  };

  writeFileSync(
    resolve(depsDir, "shared-components.json"),
    JSON.stringify(sharedComponentsFile, null, 2),
    "utf-8"
  );

  const avgComplexity =
    screenSummaries.reduce((sum, s) => sum + s.complexity, 0) /
    screenSummaries.length;
  const avgComponents =
    screenSummaries.reduce((sum, s) => sum + s.componentCount, 0) /
    screenSummaries.length;

  const complexityBuckets = {
    low: screenSummaries.filter((s) => s.complexityLevel === "low").length,
    medium: screenSummaries.filter((s) => s.complexityLevel === "medium").length,
    high: screenSummaries.filter((s) => s.complexityLevel === "high").length,
    critical: screenSummaries.filter((s) => s.complexityLevel === "critical").length,
  };

  const indexFile = {
    generatedAt: new Date().toISOString(),
    stats: {
      ...data.stats,
      avgComplexity: Math.round(avgComplexity * 10) / 10,
      avgComponentsPerScreen: Math.round(avgComponents * 10) / 10,
      maxComplexity: screenSummaries[0]?.complexity ?? 0,
      complexityDistribution: complexityBuckets,
    },
    complexityWeights: {
      feature: FEATURE_WEIGHT,
      shared: SHARED_WEIGHT,
      unique: UNIQUE_WEIGHT,
      explanation:
        "feature components (src/features/) are heaviest to migrate; shared components are migrated once and reused; unique/page-local need per-screen work",
    },
    sharedComponentsFile: "shared-components.json",
    screens: screenSummaries,
  };

  writeFileSync(
    resolve(depsDir, "index.json"),
    JSON.stringify(indexFile, null, 2),
    "utf-8"
  );

  console.log(`Split complete into: ${depsDir}`);
  console.log(`  deps/index.json              (summary + screen list)`);
  console.log(`  deps/shared-components.json   (${sharedSorted.length} components)`);
  console.log(`  deps/screens/                 (${data.screens.length} screen files)`);
  console.log("");
  console.log("Complexity distribution:");
  console.log(`  Critical (>100): ${complexityBuckets.critical}`);
  console.log(`  High (51-100):   ${complexityBuckets.high}`);
  console.log(`  Medium (16-50):  ${complexityBuckets.medium}`);
  console.log(`  Low (<=15):      ${complexityBuckets.low}`);
}

// Execute if running directly
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const args = process.argv.slice(2);
  const inputPath = args[0] ? resolve(process.cwd(), args[0]) : resolve(__dirname, "screen-deps.json");
  
  if (!args[0]) {
    console.log("No input file provided, using default:", inputPath);
    console.log("Usage: tsx src/dependencies/split-deps.ts <path-to-screen-deps.json>");
  }

  if (existsSync(inputPath)) {
      splitDeps(inputPath);
  } else {
      console.error(`Input file not found: ${inputPath}`);
      process.exit(1);
  }
}
