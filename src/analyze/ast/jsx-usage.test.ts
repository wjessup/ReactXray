import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { extractJsxUsage } from "./jsx-usage.js";

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
