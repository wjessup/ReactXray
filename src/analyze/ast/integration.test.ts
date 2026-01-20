import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { extractJsxExports } from "./jsx-exports.js";
import { extractJsxUsage } from "./jsx-usage.js";
import { extractInferredJsx } from "./inferred-jsx.js";
import type { ResolvedJsxImport } from "../../types.js";

function parseJsx(code: string) {
  const project = new Project({
    compilerOptions: { jsx: 2, allowJs: true },
    skipAddingFilesFromTsConfig: true,
  });
  return project.createSourceFile("test.tsx", code, { overwrite: true });
}

function createMockResolvedImport(
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

describe("cross-file JSX tracing integration", () => {
  it("extracts JSX from hook with object return and traces to consumer", () => {
    const hookSf = parseJsx(`
      export function useModal() {
        return {
          trigger: <TriggerButton />,
          content: <ModalContent><ModalBody /></ModalContent>
        };
      }
    `);

    const hookExports = extractJsxExports(hookSf);
    expect(hookExports).toHaveLength(1);
    expect(hookExports[0].exportName).toBe("useModal");
    expect(hookExports[0].jsxInProperties.get("trigger")).toContain(
      "TriggerButton"
    );
    expect(hookExports[0].jsxInProperties.get("content")).toContain(
      "ModalContent"
    );
    expect(hookExports[0].jsxInProperties.get("content")).toContain(
      "ModalBody"
    );

    const pageSf = parseJsx(`
      function Page() {
        const { trigger, content } = useModal();
        return (
          <Container>
            {trigger}
            <Panel>{content}</Panel>
          </Container>
        );
      }
    `);

    const resolvedImports: ResolvedJsxImport[] = [
      {
        localName: "useModal",
        sourceFile: "hooks/useModal.tsx",
        jsxExport: hookExports[0],
      },
    ];

    const inferred = extractInferredJsx(pageSf, resolvedImports);
    const triggerInfer = inferred.find((i) => i.variableName === "trigger");
    const contentInfer = inferred.find((i) => i.variableName === "content");

    expect(triggerInfer?.inferredComponents).toContain("TriggerButton");
    expect(contentInfer?.inferredComponents).toContain("ModalContent");
    expect(contentInfer?.inferredComponents).toContain("ModalBody");
  });

  it("extracts JSX through array.map pattern with destructuring", () => {
    const hookSf = parseJsx(`
      export function useFilterSections() {
        return config.map(({ Component }) => ({
          content: <Component />,
          title: "filter",
        }));
      }
    `);

    const hookExports = extractJsxExports(hookSf);
    expect(hookExports).toHaveLength(1);
    expect(hookExports[0].jsxInProperties.get("content")).toContain(
      "Component"
    );

    const pageSf = parseJsx(`
      function SearchPage() {
        const sections = useFilterSections();
        return (
          <FilterPanel>
            {sections.map(({ content }) => (
              <FilterWrapper>{content}</FilterWrapper>
            ))}
          </FilterPanel>
        );
      }
    `);

    const resolvedImports: ResolvedJsxImport[] = [
      {
        localName: "useFilterSections",
        sourceFile: "hooks/useFilterSections.tsx",
        jsxExport: hookExports[0],
      },
    ];

    const inferred = extractInferredJsx(pageSf, resolvedImports);
    const contentInfer = inferred.find(
      (i) => i.variableName === "content" && i.propertyPath === null
    );
    expect(contentInfer).toBeDefined();
    expect(contentInfer?.inferredComponents).toContain("Component");
  });

  it("extracts JSX with conditional returns", () => {
    const hookSf = parseJsx(`
      export function useStatus(isLoading: boolean) {
        return isLoading ? <LoadingSpinner /> : <SuccessIcon />;
      }
    `);

    const hookExports = extractJsxExports(hookSf);
    expect(hookExports).toHaveLength(1);
    expect(hookExports[0].jsxReturned).toContain("LoadingSpinner");
    expect(hookExports[0].jsxReturned).toContain("SuccessIcon");

    const statusSf = parseJsx(`
      function Status({ loading }: { loading: boolean }) {
        const icon = useStatus(loading);
        return <StatusWrapper>{icon}</StatusWrapper>;
      }
    `);

    const resolvedImports: ResolvedJsxImport[] = [
      {
        localName: "useStatus",
        sourceFile: "hooks/useStatus.tsx",
        jsxExport: hookExports[0],
      },
    ];

    const inferred = extractInferredJsx(statusSf, resolvedImports);
    const iconInfer = inferred.find((i) => i.variableName === "icon");
    expect(iconInfer?.inferredComponents).toContain("LoadingSpinner");
    expect(iconInfer?.inferredComponents).toContain("SuccessIcon");
  });

  it("handles multiple hooks with different JSX patterns", () => {
    const headerSf = parseJsx(`
      export function useHeader() {
        return <HeaderComponent><Logo /></HeaderComponent>;
      }
    `);

    const footerSf = parseJsx(`
      export function useFooter() {
        return { content: <FooterContent />, links: <FooterLinks /> };
      }
    `);

    const headerExports = extractJsxExports(headerSf);
    const footerExports = extractJsxExports(footerSf);

    expect(headerExports[0].jsxReturned).toContain("HeaderComponent");
    expect(headerExports[0].jsxReturned).toContain("Logo");
    expect(footerExports[0].jsxInProperties.get("content")).toContain(
      "FooterContent"
    );
    expect(footerExports[0].jsxInProperties.get("links")).toContain(
      "FooterLinks"
    );

    const layoutSf = parseJsx(`
      function Layout({ children }) {
        const header = useHeader();
        const { content, links } = useFooter();
        return (
          <Page>
            {header}
            <Main>{children}</Main>
            <Footer>{content}{links}</Footer>
          </Page>
        );
      }
    `);

    const resolvedImports: ResolvedJsxImport[] = [
      {
        localName: "useHeader",
        sourceFile: "hooks/useHeader.tsx",
        jsxExport: headerExports[0],
      },
      {
        localName: "useFooter",
        sourceFile: "hooks/useFooter.tsx",
        jsxExport: footerExports[0],
      },
    ];

    const inferred = extractInferredJsx(layoutSf, resolvedImports);

    const headerInfer = inferred.find((i) => i.variableName === "header");
    expect(headerInfer?.inferredComponents).toContain("HeaderComponent");
    expect(headerInfer?.inferredComponents).toContain("Logo");

    const contentInfer = inferred.find((i) => i.variableName === "content");
    const linksInfer = inferred.find((i) => i.variableName === "links");
    expect(contentInfer?.inferredComponents).toContain("FooterContent");
    expect(linksInfer?.inferredComponents).toContain("FooterLinks");
  });

  it("handles renamed destructured properties", () => {
    const hookSf = parseJsx(`
      export function usePanel() {
        return { jsx: <PanelContent /> };
      }
    `);

    const hookExports = extractJsxExports(hookSf);

    const appSf = parseJsx(`
      function App() {
        const { jsx: panelJsx } = usePanel();
        return <Container>{panelJsx}</Container>;
      }
    `);

    const resolvedImports: ResolvedJsxImport[] = [
      {
        localName: "usePanel",
        sourceFile: "hooks/usePanel.tsx",
        jsxExport: hookExports[0],
      },
    ];

    const inferred = extractInferredJsx(appSf, resolvedImports);
    const panelInfer = inferred.find((i) => i.variableName === "panelJsx");
    expect(panelInfer?.inferredComponents).toContain("PanelContent");
  });

  it("combines extractJsxUsage with inferred JSX for complete picture", () => {
    const pageSf = parseJsx(`
      function SearchPage() {
        const sections = useFilterSections();
        return (
          <Layout>
            <ToggleFilterPanel>
              {sections.map(({ content }) => (
                <div>{content}</div>
              ))}
            </ToggleFilterPanel>
            <ResultsGrid />
          </Layout>
        );
      }
    `);

    const jsxUsage = extractJsxUsage(pageSf);
    expect(jsxUsage.directChildren).toContain("Layout");
    expect(jsxUsage.nestedInComponent.get("Layout")).toContain(
      "ToggleFilterPanel"
    );
    expect(jsxUsage.nestedInComponent.get("Layout")).toContain("ResultsGrid");

    const propsMap = new Map<string, string[]>();
    propsMap.set("content", ["ColorFilter", "TextFilter"]);
    const resolvedImports: ResolvedJsxImport[] = [
      createMockResolvedImport("useFilterSections", [], propsMap),
    ];

    const inferred = extractInferredJsx(pageSf, resolvedImports);
    const contentInfer = inferred.find(
      (i) => i.variableName === "content" && i.propertyPath === null
    );
    expect(contentInfer?.inferredComponents).toContain("ColorFilter");
    expect(contentInfer?.inferredComponents).toContain("TextFilter");
  });

  it("tracks identifiers rendered inside components for tree building", () => {
    const pageSf = parseJsx(`
      function SearchPage() {
        const sections = useFilterSections();
        return (
          <Layout>
            <ToggleFilterPanel>
              {sections.map(({ content }) => (
                <div>{content}</div>
              ))}
            </ToggleFilterPanel>
          </Layout>
        );
      }
    `);

    const jsxUsage = extractJsxUsage(pageSf);

    const togglePanelIdentifiers =
      jsxUsage.identifiersInComponent.get("ToggleFilterPanel") || [];
    expect(togglePanelIdentifiers).toContain("content");
  });

  it("full integration: ToggleFilterPanel shows inferred filter children", () => {
    const hookSf = parseJsx(`
      export function useFilterSections() {
        return config.filters.map((key) => {
          const { Component } = FILTER_COMPONENTS[key];
          return { content: <Component />, title: key };
        });
      }
    `);

    const hookExports = extractJsxExports(hookSf);
    expect(hookExports[0].jsxInProperties.get("content")).toContain(
      "Component"
    );

    const pageSf = parseJsx(`
      function SearchPage() {
        const specimensFilterSections = useFilterSections("search");
        return (
          <ToggleFilterPanel>
            {specimensFilterSections.map(({ content }, i) => (
              <div key={i}>{content}</div>
            ))}
          </ToggleFilterPanel>
        );
      }
    `);

    const jsxUsage = extractJsxUsage(pageSf);
    expect(jsxUsage.directChildren).toContain("ToggleFilterPanel");
    expect(jsxUsage.identifiersInComponent.get("ToggleFilterPanel")).toContain(
      "content"
    );

    const resolvedImports: ResolvedJsxImport[] = [
      {
        localName: "useFilterSections",
        sourceFile: "hooks/useFilterSections.tsx",
        jsxExport: hookExports[0],
      },
    ];

    const inferred = extractInferredJsx(pageSf, resolvedImports);
    const contentInfer = inferred.find(
      (i) => i.variableName === "content" && i.propertyPath === null
    );
    expect(contentInfer?.inferredComponents).toContain("Component");
  });
});
