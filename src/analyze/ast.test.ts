import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import {
  extractJsxUsage,
  extractJsxExports,
  extractInferredJsx,
} from "./ast.js";
import type { ResolvedJsxImport } from "../types.js";

function parseJsx(code: string) {
  const project = new Project({
    compilerOptions: { jsx: 2, allowJs: true },
    skipAddingFilesFromTsConfig: true,
  });
  return project.createSourceFile("test.tsx", code, { overwrite: true });
}

describe("extractJsxUsage", () => {
  it("detects direct JSX children", () => {
    const sf = parseJsx(`
      function Parent() {
        return <Container><Child /></Container>;
      }
    `);
    const usage = extractJsxUsage(sf);
    expect(usage.directChildren).toContain("Container");
    expect(usage.nestedInComponent.get("Container")).toContain("Child");
  });

  it("detects components inside map callbacks", () => {
    const sf = parseJsx(`
      function Grid() {
        return <Container>{items.map(i => <Card key={i} />)}</Container>;
      }
    `);
    const usage = extractJsxUsage(sf);
    expect(usage.directChildren).toContain("Container");
    expect(usage.nestedInComponent.get("Container")).toContain("Card");
  });

  it("detects components inside conditional AND expressions", () => {
    const sf = parseJsx(`
      function Page() {
        return <Wrapper>{show && <Modal />}</Wrapper>;
      }
    `);
    const usage = extractJsxUsage(sf);
    expect(usage.directChildren).toContain("Wrapper");
    expect(usage.nestedInComponent.get("Wrapper")).toContain("Modal");
  });

  it("detects components inside ternary expressions", () => {
    const sf = parseJsx(`
      function Toggle() {
        return <Container>{isOn ? <OnState /> : <OffState />}</Container>;
      }
    `);
    const usage = extractJsxUsage(sf);
    expect(usage.directChildren).toContain("Container");
    const nested = usage.nestedInComponent.get("Container");
    expect(nested).toContain("OnState");
    expect(nested).toContain("OffState");
  });

  it("detects nested maps with deeply nested components", () => {
    const sf = parseJsx(`
      function Table() {
        return (
          <Grid>
            {rows.map(row => (
              <Row key={row.id}>
                {row.cells.map(cell => <Cell key={cell.id} />)}
              </Row>
            ))}
          </Grid>
        );
      }
    `);
    const usage = extractJsxUsage(sf);
    expect(usage.directChildren).toContain("Grid");
    expect(usage.nestedInComponent.get("Grid")).toContain("Row");
    expect(usage.nestedInComponent.get("Row")).toContain("Cell");
  });

  it("detects components in arrow functions with implicit return", () => {
    const sf = parseJsx(`
      const Button = () => <Pressable><Text>Click</Text></Pressable>;
    `);
    const usage = extractJsxUsage(sf);
    expect(usage.directChildren).toContain("Pressable");
    expect(usage.nestedInComponent.get("Pressable")).toContain("Text");
  });

  it("detects components inside JSX fragments", () => {
    const sf = parseJsx(`
      function List() {
        return (
          <>
            <Header />
            <Content />
            <Footer />
          </>
        );
      }
    `);
    const usage = extractJsxUsage(sf);
    expect(usage.directChildren).toContain("Header");
    expect(usage.directChildren).toContain("Content");
    expect(usage.directChildren).toContain("Footer");
  });

  it("detects mixed nesting: conditionals inside maps", () => {
    const sf = parseJsx(`
      function Feed() {
        return (
          <Container>
            {posts.map(post => (
              <Card key={post.id}>
                {post.hasImage && <ImagePreview />}
                {post.isLiked ? <LikedIcon /> : <UnlikedIcon />}
              </Card>
            ))}
          </Container>
        );
      }
    `);
    const usage = extractJsxUsage(sf);
    expect(usage.directChildren).toContain("Container");
    expect(usage.nestedInComponent.get("Container")).toContain("Card");
    const cardChildren = usage.nestedInComponent.get("Card");
    expect(cardChildren).toContain("ImagePreview");
    expect(cardChildren).toContain("LikedIcon");
    expect(cardChildren).toContain("UnlikedIcon");
  });

  it("detects property access components like Dialog.Content", () => {
    const sf = parseJsx(`
      function Modal() {
        return (
          <Dialog>
            <Dialog.Trigger>Open</Dialog.Trigger>
            <Dialog.Content>
              <Dialog.Title>Title</Dialog.Title>
            </Dialog.Content>
          </Dialog>
        );
      }
    `);
    const usage = extractJsxUsage(sf);
    expect(usage.directChildren).toContain("Dialog");
    const dialogChildren = usage.nestedInComponent.get("Dialog");
    expect(dialogChildren).toContain("Dialog.Trigger");
    expect(dialogChildren).toContain("Dialog.Content");
    const contentChildren = usage.nestedInComponent.get("Dialog.Content");
    expect(contentChildren).toContain("Dialog.Title");
  });

  it("handles multiple return statements", () => {
    const sf = parseJsx(`
      function Conditional({ isLoading }: { isLoading: boolean }) {
        if (isLoading) {
          return <Spinner />;
        }
        return <Content><Data /></Content>;
      }
    `);
    const usage = extractJsxUsage(sf);
    expect(usage.directChildren).toContain("Spinner");
    expect(usage.directChildren).toContain("Content");
    expect(usage.nestedInComponent.get("Content")).toContain("Data");
  });

  it("handles self-closing components at root level", () => {
    const sf = parseJsx(`
      function Simple() {
        return <Avatar />;
      }
    `);
    const usage = extractJsxUsage(sf);
    expect(usage.directChildren).toContain("Avatar");
  });

  it("handles complex real-world SpecimenCard-like component", () => {
    const sf = parseJsx(`
      function SpecimenCard({ specimen }: { specimen: Specimen }) {
        return (
          <Card>
            <CardImage src={specimen.image} />
            <CardContent>
              <Title>{specimen.name}</Title>
              {specimen.views > 0 && <ViewCounter count={specimen.views} />}
              <ActionBar>
                <LikeButton onClick={handleLike} />
                <CommentButton onClick={handleComment} />
                {isOwner && <EditButton />}
              </ActionBar>
            </CardContent>
          </Card>
        );
      }
    `);
    const usage = extractJsxUsage(sf);
    expect(usage.directChildren).toContain("Card");

    const cardChildren = usage.nestedInComponent.get("Card");
    expect(cardChildren).toContain("CardImage");
    expect(cardChildren).toContain("CardContent");

    const contentChildren = usage.nestedInComponent.get("CardContent");
    expect(contentChildren).toContain("Title");
    expect(contentChildren).toContain("ViewCounter");
    expect(contentChildren).toContain("ActionBar");

    const actionBarChildren = usage.nestedInComponent.get("ActionBar");
    expect(actionBarChildren).toContain("LikeButton");
    expect(actionBarChildren).toContain("CommentButton");
    expect(actionBarChildren).toContain("EditButton");
  });

  it("detects JSX passed as prop values", () => {
    const sf = parseJsx(`
      function Page() {
        return (
          <TogglePanel
            trigger={<TriggerButton />}
            content={<PanelContent><FilterList /></PanelContent>}
          />
        );
      }
    `);
    const usage = extractJsxUsage(sf);
    expect(usage.directChildren).toContain("TogglePanel");
    const panelChildren = usage.nestedInComponent.get("TogglePanel");
    expect(panelChildren).toContain("TriggerButton");
    expect(panelChildren).toContain("PanelContent");
    expect(usage.nestedInComponent.get("PanelContent")).toContain("FilterList");
  });

  it("detects JSX in render prop pattern", () => {
    const sf = parseJsx(`
      function Page() {
        return (
          <DataProvider render={(data) => <DataView data={data}><DataItem /></DataView>} />
        );
      }
    `);
    const usage = extractJsxUsage(sf);
    expect(usage.directChildren).toContain("DataProvider");
    const providerChildren = usage.nestedInComponent.get("DataProvider");
    expect(providerChildren).toContain("DataView");
    expect(usage.nestedInComponent.get("DataView")).toContain("DataItem");
  });

  it("detects children of wrapper/panel components", () => {
    const sf = parseJsx(`
      function SearchPage() {
        return (
          <Layout>
            <ToggleFilterPanel>
              <FilterSection>
                <FilterInput />
              </FilterSection>
              <ApplyButton />
            </ToggleFilterPanel>
            <ResultsGrid />
          </Layout>
        );
      }
    `);
    const usage = extractJsxUsage(sf);
    expect(usage.directChildren).toContain("Layout");
    expect(usage.nestedInComponent.get("Layout")).toContain(
      "ToggleFilterPanel"
    );
    expect(usage.nestedInComponent.get("Layout")).toContain("ResultsGrid");

    const panelChildren = usage.nestedInComponent.get("ToggleFilterPanel");
    expect(panelChildren).toContain("FilterSection");
    expect(panelChildren).toContain("ApplyButton");

    expect(usage.nestedInComponent.get("FilterSection")).toContain(
      "FilterInput"
    );
  });
});

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

describe("extractInferredJsx", () => {
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
