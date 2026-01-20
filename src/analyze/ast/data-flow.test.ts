import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { extractChildDataFlow } from "./data-flow.js";

function parseNode(code: string) {
  const project = new Project({
    compilerOptions: { jsx: 2, allowJs: true },
    skipAddingFilesFromTsConfig: true,
  });
  const sf = project.createSourceFile("test.tsx", code, { overwrite: true });
  const func = sf.getFunctions()[0] || sf.getVariableDeclaration("Component")?.getInitializer();
  return func!;
}

describe("extractChildDataFlow", () => {
  describe("server query prop sources", () => {
    it("detects props from await calls", () => {
      const node = parseNode(`
        async function Page() {
          const data = await fetchData();
          return <Card data={data} />;
        }
      `);
      const flow = extractChildDataFlow(node);
      expect(flow).toHaveLength(1);
      expect(flow[0].component).toBe("Card");
      expect(flow[0].props.data.source).toBe("serverQuery");
      expect(flow[0].props.data.query).toBe("fetchData");
    });

    it("detects props from Promise.all destructuring", () => {
      const node = parseNode(`
        async function Page() {
          const [users, posts] = await Promise.all([
            getUsers(),
            getPosts()
          ]);
          return (
            <Dashboard users={users} posts={posts} />
          );
        }
      `);
      const flow = extractChildDataFlow(node);
      expect(flow).toHaveLength(1);
      expect(flow[0].component).toBe("Dashboard");
      expect(flow[0].props.users.source).toBe("serverQuery");
      expect(flow[0].props.users.query).toBe("getUsers");
      expect(flow[0].props.posts.source).toBe("serverQuery");
      expect(flow[0].props.posts.query).toBe("getPosts");
    });
  });

  describe("hook prop sources", () => {
    it("detects props from hook return value", () => {
      const node = parseNode(`
        function Component() {
          const data = useQuery();
          return <Display data={data} />;
        }
      `);
      const flow = extractChildDataFlow(node);
      expect(flow).toHaveLength(1);
      expect(flow[0].props.data.source).toBe("hook");
      expect(flow[0].props.data.hookName).toBe("useQuery");
    });

    it("detects props from hook destructuring", () => {
      const node = parseNode(`
        function Component() {
          const { user, isLoading } = useAuth();
          return <Profile user={user} loading={isLoading} />;
        }
      `);
      const flow = extractChildDataFlow(node);
      expect(flow).toHaveLength(1);
      expect(flow[0].props.user.source).toBe("hook");
      expect(flow[0].props.user.hookName).toBe("useAuth");
      expect(flow[0].props.loading.source).toBe("hook");
      expect(flow[0].props.loading.hookName).toBe("useAuth");
    });

    it("detects props from hook property access", () => {
      const node = parseNode(`
        function Component() {
          const result = useData();
          return <Display name={result.user.name} />;
        }
      `);
      const flow = extractChildDataFlow(node);
      expect(flow).toHaveLength(1);
      expect(flow[0].props.name.source).toBe("hook");
      expect(flow[0].props.name.hookName).toBe("useData");
    });
  });

  describe("parent prop sources", () => {
    it("detects props passed through from parent", () => {
      const node = parseNode(`
        function Component({ title, count }: { title: string; count: number }) {
          return <Card title={title} count={count} />;
        }
      `);
      const flow = extractChildDataFlow(node);
      expect(flow).toHaveLength(1);
      expect(flow[0].props.title.source).toBe("prop");
      expect(flow[0].props.title.propName).toBe("title");
      expect(flow[0].props.count.source).toBe("prop");
      expect(flow[0].props.count.propName).toBe("count");
    });

    it("detects props from parent prop property access", () => {
      const node = parseNode(`
        function Component({ user }: { user: User }) {
          return <Avatar src={user.avatar} name={user.name} />;
        }
      `);
      const flow = extractChildDataFlow(node);
      expect(flow).toHaveLength(1);
      expect(flow[0].props.src.source).toBe("prop");
      expect(flow[0].props.src.propName).toBe("user");
      expect(flow[0].props.name.source).toBe("prop");
      expect(flow[0].props.name.propName).toBe("user");
    });
  });

  describe("literal prop sources", () => {
    it("detects string literal props", () => {
      const node = parseNode(`
        function Component() {
          return <Button label="Click me" />;
        }
      `);
      const flow = extractChildDataFlow(node);
      expect(flow).toHaveLength(1);
      expect(flow[0].props.label.source).toBe("literal");
    });

    it("detects boolean shorthand props as literal", () => {
      const node = parseNode(`
        function Component() {
          return <Button disabled />;
        }
      `);
      const flow = extractChildDataFlow(node);
      expect(flow).toHaveLength(1);
      expect(flow[0].props.disabled.source).toBe("literal");
    });
  });

  describe("computed prop sources", () => {
    it("detects computed/derived props", () => {
      const node = parseNode(`
        function Component() {
          const doubled = value * 2;
          return <Display value={doubled} />;
        }
      `);
      const flow = extractChildDataFlow(node);
      expect(flow).toHaveLength(1);
      expect(flow[0].props.value.source).toBe("computed");
    });

    it("detects inline computed expressions", () => {
      const node = parseNode(`
        function Component() {
          return <Display value={1 + 2} />;
        }
      `);
      const flow = extractChildDataFlow(node);
      expect(flow).toHaveLength(1);
      expect(flow[0].props.value.source).toBe("computed");
    });
  });

  describe("map iterator tracking", () => {
    it("tracks hook data through map iterators", () => {
      const node = parseNode(`
        function Component() {
          const { items } = useData();
          return (
            <List>
              {items.map(item => (
                <ListItem data={item} />
              ))}
            </List>
          );
        }
      `);
      const flow = extractChildDataFlow(node);
      const listItem = flow.find(f => f.component === "ListItem");
      expect(listItem).toBeDefined();
      expect(listItem!.props.data.source).toBe("hook");
      expect(listItem!.props.data.hookName).toBe("useData");
    });

    it("tracks hook data through property access on iterator", () => {
      const node = parseNode(`
        function Component() {
          const { users } = useUsers();
          return (
            <div>
              {users.map(user => (
                <UserCard name={user.name} email={user.email} />
              ))}
            </div>
          );
        }
      `);
      const flow = extractChildDataFlow(node);
      const userCard = flow.find(f => f.component === "UserCard");
      expect(userCard).toBeDefined();
      expect(userCard!.props.name.source).toBe("hook");
      expect(userCard!.props.name.hookName).toBe("useUsers");
    });
  });

  describe("multiple components", () => {
    it("tracks data flow to multiple child components", () => {
      const node = parseNode(`
        async function Page() {
          const data = await fetchData();
          const { user } = useAuth();
          return (
            <Layout>
              <Header user={user} />
              <Content data={data} />
            </Layout>
          );
        }
      `);
      const flow = extractChildDataFlow(node);
      
      const header = flow.find(f => f.component === "Header");
      expect(header).toBeDefined();
      expect(header!.props.user.source).toBe("hook");
      
      const content = flow.find(f => f.component === "Content");
      expect(content).toBeDefined();
      expect(content!.props.data.source).toBe("serverQuery");
    });
  });

  describe("edge cases", () => {
    it("ignores lowercase (HTML) elements", () => {
      const node = parseNode(`
        function Component() {
          const data = useData();
          return <div data-value={data} />;
        }
      `);
      const flow = extractChildDataFlow(node);
      expect(flow).toHaveLength(0);
    });

    it("handles component with no props", () => {
      const node = parseNode(`
        function Component() {
          return <EmptyComponent />;
        }
      `);
      const flow = extractChildDataFlow(node);
      expect(flow).toHaveLength(0);
    });

    it("merges props for same component used multiple times", () => {
      const node = parseNode(`
        function Component() {
          const { a, b } = useData();
          return (
            <>
              <Card propA={a} />
              <Card propB={b} />
            </>
          );
        }
      `);
      const flow = extractChildDataFlow(node);
      expect(flow).toHaveLength(1);
      expect(flow[0].component).toBe("Card");
      expect(flow[0].props.propA).toBeDefined();
      expect(flow[0].props.propB).toBeDefined();
    });
  });
});
