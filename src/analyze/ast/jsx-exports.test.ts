import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { extractJsxExports } from "./jsx-exports.js";

function parseJsx(code: string) {
  const project = new Project({
    compilerOptions: { jsx: 2, allowJs: true },
    skipAddingFilesFromTsConfig: true,
  });
  return project.createSourceFile("test.tsx", code, { overwrite: true });
}

describe("extractJsxExports", () => {
  it("detects direct JSX return from exported function", () => {
    const sf = parseJsx(`
      export function MyComponent() {
        return <Container><Child /></Container>;
      }
    `);
    const exports = extractJsxExports(sf);
    expect(exports).toHaveLength(1);
    expect(exports[0].exportName).toBe("MyComponent");
    expect(exports[0].exportType).toBe("component");
    expect(exports[0].jsxReturned).toContain("Container");
    expect(exports[0].jsxReturned).toContain("Child");
  });

  it("detects JSX in object return from hook", () => {
    const sf = parseJsx(`
      export function useFilterSections() {
        return { content: <FilterSection />, icon: <Icon /> };
      }
    `);
    const exports = extractJsxExports(sf);
    expect(exports).toHaveLength(1);
    expect(exports[0].exportName).toBe("useFilterSections");
    expect(exports[0].exportType).toBe("function");
    expect(exports[0].jsxInProperties.get("content")).toContain(
      "FilterSection"
    );
    expect(exports[0].jsxInProperties.get("icon")).toContain("Icon");
  });

  it("detects JSX in array map return", () => {
    const sf = parseJsx(`
      export function useItems() {
        return items.map(item => ({ content: <ItemView key={item.id} /> }));
      }
    `);
    const exports = extractJsxExports(sf);
    expect(exports).toHaveLength(1);
    expect(exports[0].jsxInProperties.get("content")).toContain("ItemView");
  });

  it("detects conditional JSX returns", () => {
    const sf = parseJsx(`
      export function useConditional(flag: boolean) {
        return flag ? <ComponentA /> : <ComponentB />;
      }
    `);
    const exports = extractJsxExports(sf);
    expect(exports).toHaveLength(1);
    expect(exports[0].jsxReturned).toContain("ComponentA");
    expect(exports[0].jsxReturned).toContain("ComponentB");
  });

  it("detects JSX from arrow function export", () => {
    const sf = parseJsx(`
      export const useModal = () => {
        return { trigger: <Button />, panel: <Panel><Content /></Panel> };
      };
    `);
    const exports = extractJsxExports(sf);
    expect(exports).toHaveLength(1);
    expect(exports[0].exportName).toBe("useModal");
    expect(exports[0].jsxInProperties.get("trigger")).toContain("Button");
    expect(exports[0].jsxInProperties.get("panel")).toContain("Panel");
    expect(exports[0].jsxInProperties.get("panel")).toContain("Content");
  });

  it("handles implicit arrow function return with object", () => {
    const sf = parseJsx(`
      export const useSection = () => ({ content: <Section /> });
    `);
    const exports = extractJsxExports(sf);
    expect(exports).toHaveLength(1);
    expect(exports[0].jsxInProperties.get("content")).toContain("Section");
  });

  it("handles multiple exports", () => {
    const sf = parseJsx(`
      export function ComponentA() {
        return <ViewA />;
      }
      export function useHookB() {
        return { jsx: <ViewB /> };
      }
    `);
    const exports = extractJsxExports(sf);
    expect(exports).toHaveLength(2);
    const compA = exports.find((e) => e.exportName === "ComponentA");
    const hookB = exports.find((e) => e.exportName === "useHookB");
    expect(compA?.jsxReturned).toContain("ViewA");
    expect(hookB?.jsxInProperties.get("jsx")).toContain("ViewB");
  });

  it("ignores non-JSX exports", () => {
    const sf = parseJsx(`
      export function calculateSum(a: number, b: number) {
        return a + b;
      }
      export const CONSTANT = "value";
    `);
    const exports = extractJsxExports(sf);
    expect(exports).toHaveLength(0);
  });

  it("handles the useFilterSections pattern from real codebase", () => {
    const sf = parseJsx(`
      const FILTER_COMPONENTS = {
        text: { Component: TextFilterSection },
        color: { Component: ColorFilterSection },
      };
      
      export function useFilterSections(view: string) {
        return ["text", "color"].map((key) => {
          const { Component } = FILTER_COMPONENTS[key];
          return { content: <Component />, title: key };
        });
      }
    `);
    const exports = extractJsxExports(sf);
    expect(exports).toHaveLength(1);
    expect(exports[0].exportName).toBe("useFilterSections");
    const contentJsx = exports[0].jsxInProperties.get("content");
    expect(contentJsx).toContain("TextFilterSection");
    expect(contentJsx).toContain("ColorFilterSection");
  });

  it("handles nested JSX in object properties", () => {
    const sf = parseJsx(`
      export function usePanel() {
        return {
          header: <Header><Title /></Header>,
          body: <Body><Content /><Footer /></Body>
        };
      }
    `);
    const exports = extractJsxExports(sf);
    expect(exports).toHaveLength(1);
    const headerJsx = exports[0].jsxInProperties.get("header");
    expect(headerJsx).toContain("Header");
    expect(headerJsx).toContain("Title");
    const bodyJsx = exports[0].jsxInProperties.get("body");
    expect(bodyJsx).toContain("Body");
    expect(bodyJsx).toContain("Content");
    expect(bodyJsx).toContain("Footer");
  });
});
