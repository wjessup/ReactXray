import { describe, it, expect, beforeEach } from "vitest";

(globalThis as any).localStorage = {
  _data: {} as Record<string, string>,
  getItem(key: string) { return this._data[key] ?? null; },
  setItem(key: string, value: string) { this._data[key] = value; },
  removeItem(key: string) { delete this._data[key]; },
};

(globalThis as any).window = {
  location: { pathname: "/" },
  addEventListener: () => {},
  __REACT_DEVTOOLS_GLOBAL_HOOK__: null,
};
(globalThis as any).document = {
  createElement: () => ({}),
  querySelectorAll: () => [],
  getElementById: () => null,
  contains: () => false,
  body: { style: {}, appendChild: () => {} },
  head: { appendChild: () => {} },
};
(globalThis as any).history = { pushState: () => {} };

const { state } = await import("./client/state.js");
const { renderTree } = await import("./client/treeRenderer.js");

function parseHtml(html: string): { usageBtns: Array<{ file: string; line: string }>; fileBtns: Array<{ file: string }> } {
  const usageBtns: Array<{ file: string; line: string }> = [];
  const fileBtns: Array<{ file: string }> = [];

  const usageRe = /class="usage-btn"[^>]*data-usage-file="([^"]*)"[^>]*data-usage-line="([^"]*)"/g;
  let m;
  while ((m = usageRe.exec(html)) !== null) {
    usageBtns.push({ file: m[1], line: m[2] });
  }

  const fileRe = /class="file-btn"[^>]*data-def-file="([^"]*)"/g;
  while ((m = fileRe.exec(html)) !== null) {
    fileBtns.push({ file: m[1] });
  }

  return { usageBtns, fileBtns };
}

describe("tree renderer usage pin and file buttons", () => {
  beforeEach(() => {
    state.renderCounts = new Map();
    state.searchTerm = "";
    state.ignoredPaths = [];
    state.PROJECT_PATH = "C:\\WORK_DATA\\repositories\\test-xray";
  });

  it("renders usage pin when child component has a different parent file", () => {
    const tree = [
      {
        file: "src/features/inbox/InboxPage.tsx",
        component: { name: "InboxPage", filePath: "src/features/inbox/InboxPage.tsx", isClientComponent: true },
        source: { fileName: "src/features/inbox/InboxPage.tsx" },
        hasFiber: true,
        isBridge: true,
        children: [
          {
            file: "src/components/Button.tsx",
            component: { name: "Button", filePath: "src/components/Button.tsx", isClientComponent: true },
            source: { fileName: "src/features/inbox/InboxPage.tsx", lineNumber: 8 },
            hasFiber: true,
            isBridge: true,
            children: [],
          },
        ],
      },
    ];

    state.DISPLAY_TREE = tree;
    const html = renderTree(tree);
    const { usageBtns, fileBtns } = parseHtml(html);

    const buttonUsage = usageBtns.find(u => u.file.includes("InboxPage"));
    expect(buttonUsage).toBeDefined();
    expect(buttonUsage!.line).toBe("8");

    const buttonDef = fileBtns.find(f => f.file.includes("Button"));
    expect(buttonDef).toBeDefined();
  });

  it("does not render usage pin for root-level component (no parent)", () => {
    const tree = [
      {
        file: "src/features/inbox/InboxPage.tsx",
        component: { name: "InboxPage", filePath: "src/features/inbox/InboxPage.tsx", isClientComponent: true },
        source: { fileName: "src/features/inbox/InboxPage.tsx" },
        hasFiber: true,
        isBridge: true,
        children: [],
      },
    ];

    state.DISPLAY_TREE = tree;
    const html = renderTree(tree);
    const { usageBtns } = parseHtml(html);

    expect(usageBtns).toHaveLength(0);
  });

  it("does not render usage pin when parent file is the same as defined file", () => {
    const tree = [
      {
        file: "src/features/inbox/InboxPage.tsx",
        component: { name: "InboxPage", filePath: "src/features/inbox/InboxPage.tsx", isClientComponent: true },
        source: { fileName: "src/features/inbox/InboxPage.tsx" },
        hasFiber: true,
        isBridge: true,
        children: [
          {
            file: "src/features/inbox/InboxPage.tsx",
            component: { name: "InternalHelper", filePath: "src/features/inbox/InboxPage.tsx", isClientComponent: true },
            source: { fileName: "src/features/inbox/InboxPage.tsx", lineNumber: 20 },
            hasFiber: true,
            isBridge: true,
            children: [],
          },
        ],
      },
    ];

    state.DISPLAY_TREE = tree;
    const html = renderTree(tree);
    const { usageBtns } = parseHtml(html);

    expect(usageBtns).toHaveLength(0);
  });

  it("resolves relative paths to absolute using PROJECT_PATH", () => {
    const tree = [
      {
        file: "src/features/inbox/InboxPage.tsx",
        component: { name: "InboxPage", filePath: "src/features/inbox/InboxPage.tsx", isClientComponent: true },
        source: { fileName: "src/features/inbox/InboxPage.tsx" },
        hasFiber: true,
        isBridge: true,
        children: [
          {
            file: "src/components/Button.tsx",
            component: { name: "Button", filePath: "src/components/Button.tsx", isClientComponent: true },
            source: { fileName: "src/features/inbox/InboxPage.tsx", lineNumber: 8 },
            hasFiber: true,
            isBridge: true,
            children: [],
          },
        ],
      },
    ];

    state.DISPLAY_TREE = tree;
    const html = renderTree(tree);
    const { usageBtns, fileBtns } = parseHtml(html);

    const buttonUsage = usageBtns.find(u => u.file.includes("InboxPage"));
    expect(buttonUsage).toBeDefined();
    expect(buttonUsage!.file).toContain("C:\\WORK_DATA\\repositories\\test-xray");
    expect(buttonUsage!.file).toContain("InboxPage.tsx");

    const buttonDef = fileBtns.find(f => f.file.includes("Button"));
    expect(buttonDef).toBeDefined();
    expect(buttonDef!.file).toContain("C:\\WORK_DATA\\repositories\\test-xray");
    expect(buttonDef!.file).toContain("Button.tsx");
  });

  it("renders usage pins for multiple instances at correct lines", () => {
    const tree = [
      {
        file: "src/features/inbox/InboxPage.tsx",
        component: { name: "InboxPage", filePath: "src/features/inbox/InboxPage.tsx", isClientComponent: true },
        source: { fileName: "src/features/inbox/InboxPage.tsx" },
        hasFiber: true,
        isBridge: true,
        children: [
          {
            file: "src/components/Button.tsx",
            component: { name: "Button", filePath: "src/components/Button.tsx", isClientComponent: true },
            source: { fileName: "src/features/inbox/InboxPage.tsx", lineNumber: 8 },
            hasFiber: true,
            isBridge: true,
            children: [],
          },
          {
            file: "src/features/inbox/components/InboxTree.tsx",
            component: { name: "InboxTree", filePath: "src/features/inbox/components/InboxTree.tsx", isClientComponent: true },
            source: { fileName: "src/features/inbox/InboxPage.tsx", lineNumber: 14 },
            hasFiber: true,
            isBridge: true,
            children: [
              {
                file: "src/components/Button.tsx",
                component: { name: "Button", filePath: "src/components/Button.tsx", isClientComponent: true },
                source: { fileName: "src/features/inbox/components/InboxTree.tsx", lineNumber: 21 },
                hasFiber: true,
                isBridge: true,
                children: [],
              },
            ],
          },
        ],
      },
    ];

    state.DISPLAY_TREE = tree;
    const html = renderTree(tree);
    const { usageBtns } = parseHtml(html);

    const buttonUsages = usageBtns.filter(u => u.file.includes("Button") === false);
    expect(buttonUsages.length).toBeGreaterThanOrEqual(2);

    const usageAtInboxPage = usageBtns.find(u => u.file.includes("InboxPage") && u.line === "8");
    expect(usageAtInboxPage).toBeDefined();

    const usageAtInboxTree = usageBtns.find(u => u.file.includes("InboxTree") && u.line === "21");
    expect(usageAtInboxTree).toBeDefined();
  });
});
