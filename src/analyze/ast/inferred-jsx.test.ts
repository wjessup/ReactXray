import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { extractInferredJsx } from "./inferred-jsx.js";
import type { ResolvedJsxImport } from "../../types.js";

function parseJsx(code: string) {
  const project = new Project({
    compilerOptions: { jsx: 2, allowJs: true },
    skipAddingFilesFromTsConfig: true,
  });
  return project.createSourceFile("test.tsx", code, { overwrite: true });
}

function createResolvedImport(
  localName: string,
  jsxReturned: string[],
  jsxInProperties: Map<string, string[]>
): ResolvedJsxImport {
  return {
    localName,
    sourceFile: "mock.tsx",
    jsxExport: {
      exportName: localName,
      exportType: "function",
      jsxReturned,
      jsxInProperties,
    },
  };
}

describe("extractInferredJsx", () => {
  it("infers JSX from direct hook call assignment", () => {
    const sf = parseJsx(`
      function Page() {
        const modal = useModal();
        return <div>{modal}</div>;
      }
    `);
    const resolvedImports: ResolvedJsxImport[] = [
      createResolvedImport("useModal", ["Modal", "Overlay"], new Map()),
    ];
    const inferred = extractInferredJsx(sf, resolvedImports);
    expect(inferred).toHaveLength(1);
    expect(inferred[0].variableName).toBe("modal");
    expect(inferred[0].propertyPath).toBeNull();
    expect(inferred[0].inferredComponents).toContain("Modal");
    expect(inferred[0].inferredComponents).toContain("Overlay");
  });

  it("infers JSX from hook call with object destructuring", () => {
    const sf = parseJsx(`
      function Page() {
        const { content, icon } = useSection();
        return <div>{content}{icon}</div>;
      }
    `);
    const propsMap = new Map<string, string[]>();
    propsMap.set("content", ["FilterSection"]);
    propsMap.set("icon", ["IconComponent"]);
    const resolvedImports: ResolvedJsxImport[] = [
      createResolvedImport("useSection", [], propsMap),
    ];
    const inferred = extractInferredJsx(sf, resolvedImports);
    const contentInfer = inferred.find((i) => i.variableName === "content");
    const iconInfer = inferred.find((i) => i.variableName === "icon");
    expect(contentInfer?.inferredComponents).toContain("FilterSection");
    expect(iconInfer?.inferredComponents).toContain("IconComponent");
  });

  it("infers JSX through array.map destructuring pattern", () => {
    const sf = parseJsx(`
      function Page() {
        const sections = useFilterSections();
        return (
          <div>
            {sections.map(({ content }) => (
              <div>{content}</div>
            ))}
          </div>
        );
      }
    `);
    const propsMap = new Map<string, string[]>();
    propsMap.set("content", ["ColorFilter", "TextFilter"]);
    const resolvedImports: ResolvedJsxImport[] = [
      createResolvedImport("useFilterSections", [], propsMap),
    ];
    const inferred = extractInferredJsx(sf, resolvedImports);
    const contentInfer = inferred.find(
      (i) => i.variableName === "content" && i.propertyPath === null
    );
    expect(contentInfer).toBeDefined();
    expect(contentInfer?.inferredComponents).toContain("ColorFilter");
    expect(contentInfer?.inferredComponents).toContain("TextFilter");
  });

  it("returns empty array when no resolved imports", () => {
    const sf = parseJsx(`
      function Page() {
        const data = useData();
        return <div>{data}</div>;
      }
    `);
    const inferred = extractInferredJsx(sf, []);
    expect(inferred).toHaveLength(0);
  });

  it("handles renamed destructured properties", () => {
    const sf = parseJsx(`
      function Page() {
        const { content: myContent } = useSection();
        return <div>{myContent}</div>;
      }
    `);
    const propsMap = new Map<string, string[]>();
    propsMap.set("content", ["Section"]);
    const resolvedImports: ResolvedJsxImport[] = [
      createResolvedImport("useSection", [], propsMap),
    ];
    const inferred = extractInferredJsx(sf, resolvedImports);
    const myContentInfer = inferred.find((i) => i.variableName === "myContent");
    expect(myContentInfer?.inferredComponents).toContain("Section");
  });

  it("handles multiple hook calls", () => {
    const sf = parseJsx(`
      function Page() {
        const modal = useModal();
        const panel = usePanel();
        return <div>{modal}{panel}</div>;
      }
    `);
    const resolvedImports: ResolvedJsxImport[] = [
      createResolvedImport("useModal", ["ModalView"], new Map()),
      createResolvedImport("usePanel", ["PanelView"], new Map()),
    ];
    const inferred = extractInferredJsx(sf, resolvedImports);
    const modalInfer = inferred.find((i) => i.variableName === "modal");
    const panelInfer = inferred.find((i) => i.variableName === "panel");
    expect(modalInfer?.inferredComponents).toContain("ModalView");
    expect(panelInfer?.inferredComponents).toContain("PanelView");
  });
});
