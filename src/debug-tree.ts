import { Project } from "ts-morph";
import path from "path";
import { extractComponentFromFile, extractJsxChildren, extractJsxUsage } from "./analyze/ast.js";
import { buildImportGraph } from "./analyze/imports.js";
import { resolveRouteFiles } from "./analyze/routes.js";

async function debugTree(targetPath: string, route: string) {
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
  const segments = normalizedRoute.split("/").filter(Boolean);

  console.log("\n=== DEBUG TREE ANALYSIS ===\n");
  console.log(`Target: ${targetPath}`);
  console.log(`Route: ${normalizedRoute}\n`);

  const entryFiles = await resolveRouteFiles(targetPath, segments);
  console.log("Entry files found:");
  console.log("  Layouts:", entryFiles.layouts.length);
  console.log("  Page:", entryFiles.page ? "yes" : "no");

  const allEntryPaths = [
    ...entryFiles.layouts,
    entryFiles.page,
    entryFiles.loading,
    entryFiles.error,
    entryFiles.template,
    entryFiles.notFound,
  ].filter((p): p is string => p !== null);

  console.log("\nBuilding import graph...");

  const project = new Project({
    compilerOptions: { allowJs: true, jsx: 2 },
    skipAddingFilesFromTsConfig: true,
  });

  for (const entry of allEntryPaths) {
    project.addSourceFileAtPath(entry);
  }

  const { visited, graph } = buildImportGraph(project, allEntryPaths, targetPath);
  console.log(`Done. Visited ${visited.size} files.`);

  console.log(`\nTotal files visited: ${visited.size}\n`);

  const componentMap = new Map<string, { name: string; jsxUsage: ReturnType<typeof extractJsxUsage> }>();
  const nameToFile = new Map<string, string>();

  for (const absPath of visited) {
    if (absPath.endsWith(".tsx") || absPath.endsWith(".jsx")) {
      const sourceFile = project.getSourceFile(absPath);
      if (sourceFile) {
        const relPath = path.relative(targetPath, absPath);
        const info = extractComponentFromFile(sourceFile, relPath);
        const jsxUsage = extractJsxUsage(sourceFile);
        
        if (info) {
          componentMap.set(relPath, { name: info.name, jsxUsage });
          nameToFile.set(info.name, relPath);
        }
      }
    }
  }

  console.log("=== COMPONENT → JSX USAGE (with nesting) ===\n");
  
  const searchTerms = ["SpecimenGrid", "SpecimenCard", "SearchPage", "Search"];
  
  for (const [file, data] of componentMap) {
    const allChildren = [
      ...data.jsxUsage.directChildren,
      ...Array.from(data.jsxUsage.nestedInComponent.values()).flat()
    ];
    
    const isRelevant = searchTerms.some(term => 
      file.toLowerCase().includes(term.toLowerCase()) ||
      data.name.toLowerCase().includes(term.toLowerCase()) ||
      allChildren.some(c => c.toLowerCase().includes(term.toLowerCase()))
    );
    
    if (isRelevant) {
      console.log(`📄 ${file}`);
      console.log(`   Component: ${data.name}`);
      console.log(`   Direct children: [${data.jsxUsage.directChildren.join(", ")}]`);
      
      if (data.jsxUsage.nestedInComponent.size > 0) {
        console.log(`   Nested relationships:`);
        for (const [parent, children] of data.jsxUsage.nestedInComponent) {
          console.log(`     ${parent} → [${children.join(", ")}]`);
        }
      }
      console.log("");
    }
  }

  console.log("\n=== NAME → FILE MAPPING (relevant) ===\n");
  for (const term of searchTerms) {
    for (const [name, file] of nameToFile) {
      if (name.toLowerCase().includes(term.toLowerCase())) {
        console.log(`  ${name} → ${file}`);
      }
    }
  }

  console.log("\n=== VALIDATION ===\n");
  
  const specimenGridFile = nameToFile.get("SpecimenGrid");
  const specimenCardFile = nameToFile.get("SpecimenCard");
  
  if (specimenGridFile && specimenCardFile) {
    console.log(`SpecimenGrid file: ${specimenGridFile}`);
    console.log(`SpecimenCard file: ${specimenCardFile}`);
    
    for (const [file, data] of componentMap) {
      const hasGridDirect = data.jsxUsage.directChildren.includes("SpecimenGrid");
      const nestedInGrid = data.jsxUsage.nestedInComponent.get("SpecimenGrid") || [];
      const hasCardNestedInGrid = nestedInGrid.includes("SpecimenCard");
      
      if (hasGridDirect && hasCardNestedInGrid) {
        console.log(`\n✅ CORRECT: ${file} (${data.name})`);
        console.log(`   Direct children: [${data.jsxUsage.directChildren.join(", ")}]`);
        console.log(`   SpecimenGrid → [${nestedInGrid.join(", ")}]`);
        console.log(`   SpecimenCard is correctly detected as nested inside SpecimenGrid!`);
      }
    }
  }

  console.log("\n=== RAW SOURCE CHECK ===\n");
  
  for (const [file, data] of componentMap) {
    if (data.jsxUsage.directChildren.includes("SpecimenGrid") || 
        Array.from(data.jsxUsage.nestedInComponent.keys()).includes("SpecimenGrid")) {
      const absPath = path.join(targetPath, file);
      const sourceFile = project.getSourceFile(absPath);
      if (sourceFile) {
        const text = sourceFile.getFullText();
        
        const gridPattern = /<SpecimenGrid[\s\S]*?<\/SpecimenGrid>/g;
        const matches = text.match(gridPattern);
        
        if (matches) {
          for (const match of matches) {
            if (match.includes("SpecimenCard")) {
              console.log(`📍 In ${file}, SpecimenCard IS NESTED inside SpecimenGrid tags:`);
              console.log("   " + match.slice(0, 200).replace(/\n/g, "\n   ") + "...");
              console.log("");
            }
          }
        }
      }
    }
  }
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log("Usage: npx tsx src/debug-tree.ts <project-path> <route>");
  console.log("Example: npx tsx src/debug-tree.ts ~/code/my-app /search");
  process.exit(1);
}

debugTree(args[0], args[1]).catch(console.error);
