import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { analyzeRoute } from "./index.js";
import fs from "fs/promises";
import path from "path";
import os from "os";

let tmpDir: string;

async function writeFixture(relPath: string, content: string) {
  const absPath = path.join(tmpDir, relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, content);
}

function findNode(
  nodes: any[],
  name: string,
): any | null {
  for (const n of nodes) {
    if (n.component?.name === name) return n;
    if (n.file === name) return n;
    if (n.children) {
      const found = findNode(n.children, name);
      if (found) return found;
    }
  }
  return null;
}

function getChildNames(node: any): string[] {
  return (node.children || []).map(
    (c: any) => c.component?.name || c.file,
  );
}

function collectAllNames(nodes: any[], names: string[] = []): string[] {
  for (const n of nodes) {
    names.push(n.component?.name || n.file);
    if (n.children) collectAllNames(n.children, names);
  }
  return names;
}

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "rxray-test-"));
  await fs.writeFile(
    path.join(tmpDir, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { jsx: "react-jsx", module: "esnext", moduleResolution: "bundler", allowJs: true, paths: { "@/*": ["./src/*"] } }, include: ["src"] }),
  );
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("tree building: non-project wrapper hoisting in passedAsChildren", () => {
  it("hoists project components past non-project wrappers like Suspense", async () => {
    // Setup: layout uses FeatureFlagProvider which wraps Suspense > FilterSync
    // FeatureFlagProvider and FilterSync are project components, Suspense is not
    await writeFixture(
      "src/app/layout.tsx",
      `
      import { FeatureFlagProvider } from "../providers/FeatureFlagProvider";
      import { FilterSync } from "../components/FilterSync";
      import { Suspense } from "react";

      export default function RootLayout({ children }: { children: React.ReactNode }) {
        return (
          <FeatureFlagProvider>
            <Suspense fallback={null}>
              <FilterSync />
            </Suspense>
            {children}
          </FeatureFlagProvider>
        );
      }
    `,
    );

    await writeFixture(
      "src/app/page.tsx",
      `
      export default function HomePage() {
        return <div>Home</div>;
      }
    `,
    );

    await writeFixture(
      "src/providers/FeatureFlagProvider.tsx",
      `
      "use client";
      export function FeatureFlagProvider({ children }: { children: React.ReactNode }) {
        return <div>{children}</div>;
      }
    `,
    );

    await writeFixture(
      "src/components/FilterSync.tsx",
      `
      "use client";
      export function FilterSync() {
        return <div>sync</div>;
      }
    `,
    );

    const result = await analyzeRoute(tmpDir, "/");
    const tree = result.componentTree;

    // FeatureFlagProvider should exist in tree
    const ffp = findNode(tree, "FeatureFlagProvider");
    expect(ffp).not.toBeNull();

    // FilterSync should be a child of FeatureFlagProvider (hoisted past Suspense)
    const ffpChildren = getChildNames(ffp);
    expect(ffpChildren).toContain("FilterSync");

    // FilterSync should NOT be at the root layout level
    const rootLayout = tree[0];
    const rootChildren = getChildNames(rootLayout);
    expect(rootChildren).not.toContain("FilterSync");
  });

  it("hoists multiple project components past the same non-project wrapper", async () => {
    await writeFixture(
      "src/app/layout.tsx",
      `
      import { MyProvider } from "../providers/MyProvider";
      import { CompA } from "../components/CompA";
      import { CompB } from "../components/CompB";

      export default function RootLayout({ children }: { children: React.ReactNode }) {
        return (
          <MyProvider>
            <Suspense fallback={null}>
              <CompA />
              <CompB />
            </Suspense>
            {children}
          </MyProvider>
        );
      }
    `,
    );

    await writeFixture(
      "src/app/page.tsx",
      `
      export default function Page() { return <div>page</div>; }
    `,
    );

    await writeFixture(
      "src/providers/MyProvider.tsx",
      `
      "use client";
      export function MyProvider({ children }: { children: React.ReactNode }) {
        return <div>{children}</div>;
      }
    `,
    );

    await writeFixture(
      "src/components/CompA.tsx",
      `
      "use client";
      export function CompA() { return <div>A</div>; }
    `,
    );

    await writeFixture(
      "src/components/CompB.tsx",
      `
      "use client";
      export function CompB() { return <div>B</div>; }
    `,
    );

    const result = await analyzeRoute(tmpDir, "/");
    const provider = findNode(result.componentTree, "MyProvider");
    expect(provider).not.toBeNull();

    const providerChildren = getChildNames(provider);
    expect(providerChildren).toContain("CompA");
    expect(providerChildren).toContain("CompB");
  });
});

describe("tree building: JSX passed as props to non-project wrappers", () => {
  it("hoists components passed as JSX props past non-project wrappers", async () => {
    // RenderOn is not a project component, MobileNav is
    // <RenderOn mobile={<MobileNav />} /> inside a project component
    await writeFixture(
      "src/app/layout.tsx",
      `
      import { AppShell } from "../components/AppShell";

      export default function RootLayout({ children }: { children: React.ReactNode }) {
        return <AppShell>{children}</AppShell>;
      }
    `,
    );

    await writeFixture(
      "src/app/page.tsx",
      `
      export default function Page() { return <div>page</div>; }
    `,
    );

    await writeFixture(
      "src/components/AppShell.tsx",
      `
      import { MobileNav } from "./MobileNav";
      import { Header } from "./Header";

      export function AppShell({ children }: { children: React.ReactNode }) {
        return (
          <main>
            <Header />
            {children}
            <RenderOn mobile={<MobileNav />} />
          </main>
        );
      }
    `,
    );

    await writeFixture(
      "src/components/MobileNav.tsx",
      `
      "use client";
      export function MobileNav() { return <nav>mobile</nav>; }
    `,
    );

    await writeFixture(
      "src/components/Header.tsx",
      `
      export function Header() { return <header>header</header>; }
    `,
    );

    const result = await analyzeRoute(tmpDir, "/");
    const appShell = findNode(result.componentTree, "AppShell");
    expect(appShell).not.toBeNull();

    // MobileNav should be inside AppShell (hoisted past RenderOn)
    const appShellChildren = getChildNames(appShell);
    expect(appShellChildren).toContain("MobileNav");
    expect(appShellChildren).toContain("Header");
  });
});
