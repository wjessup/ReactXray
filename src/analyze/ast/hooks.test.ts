import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { findHooks, findServerQueries } from "./hooks.js";

function parseNode(code: string) {
  const project = new Project({
    compilerOptions: { jsx: 2, allowJs: true },
    skipAddingFilesFromTsConfig: true,
  });
  const sf = project.createSourceFile("test.tsx", code, { overwrite: true });
  const func = sf.getFunctions()[0] || sf.getVariableDeclaration("Component")?.getInitializer();
  return func!;
}

describe("findHooks", () => {
  describe("React hooks detection", () => {
    it("detects useState", () => {
      const node = parseNode(`
        function Component() {
          const [value, setValue] = useState(0);
          return <div>{value}</div>;
        }
      `);
      const hooks = findHooks(node);
      expect(hooks).toContain("useState");
    });

    it("detects useEffect", () => {
      const node = parseNode(`
        function Component() {
          useEffect(() => {
            console.log("mounted");
          }, []);
          return <div />;
        }
      `);
      const hooks = findHooks(node);
      expect(hooks).toContain("useEffect");
    });

    it("detects multiple React hooks", () => {
      const node = parseNode(`
        function Component() {
          const [value, setValue] = useState(0);
          const ref = useRef(null);
          const memoized = useMemo(() => value * 2, [value]);
          const callback = useCallback(() => {}, []);
          return <div ref={ref}>{memoized}</div>;
        }
      `);
      const hooks = findHooks(node);
      expect(hooks).toContain("useState");
      expect(hooks).toContain("useRef");
      expect(hooks).toContain("useMemo");
      expect(hooks).toContain("useCallback");
    });

    it("detects useContext", () => {
      const node = parseNode(`
        function Component() {
          const theme = useContext(ThemeContext);
          return <div style={{ color: theme.primary }} />;
        }
      `);
      const hooks = findHooks(node);
      expect(hooks).toContain("useContext");
    });

    it("detects useReducer", () => {
      const node = parseNode(`
        function Component() {
          const [state, dispatch] = useReducer(reducer, initialState);
          return <div>{state.count}</div>;
        }
      `);
      const hooks = findHooks(node);
      expect(hooks).toContain("useReducer");
    });
  });

  describe("custom hooks detection", () => {
    it("detects custom hook with return value", () => {
      const node = parseNode(`
        function Component() {
          const data = useCustomData();
          return <div>{data}</div>;
        }
      `);
      const hooks = findHooks(node);
      expect(hooks).toContain("useCustomData");
    });

    it("detects custom hook with destructuring", () => {
      const node = parseNode(`
        function Component() {
          const { user, isLoading } = useAuth();
          return <div>{user?.name}</div>;
        }
      `);
      const hooks = findHooks(node);
      expect(hooks).toContain("useAuth");
    });

    it("detects multiple custom hooks", () => {
      const node = parseNode(`
        function Component() {
          const data = useData();
          const { isOpen, toggle } = useModal();
          const theme = useTheme();
          return <div />;
        }
      `);
      const hooks = findHooks(node);
      expect(hooks).toContain("useData");
      expect(hooks).toContain("useModal");
      expect(hooks).toContain("useTheme");
    });

    it("does not duplicate hooks in results", () => {
      const node = parseNode(`
        function Component() {
          const [a, setA] = useState(0);
          const [b, setB] = useState(0);
          return <div>{a + b}</div>;
        }
      `);
      const hooks = findHooks(node);
      const useStateCount = hooks.filter(h => h === "useState").length;
      expect(useStateCount).toBe(1);
    });
  });

  describe("edge cases", () => {
    it("returns empty array for component with no hooks", () => {
      const node = parseNode(`
        function Component({ name }: { name: string }) {
          return <div>Hello {name}</div>;
        }
      `);
      const hooks = findHooks(node);
      expect(hooks).toHaveLength(0);
    });

    it("works with arrow function components", () => {
      const project = new Project({
        compilerOptions: { jsx: 2, allowJs: true },
        skipAddingFilesFromTsConfig: true,
      });
      const sf = project.createSourceFile("test.tsx", `
        const Component = () => {
          const [count, setCount] = useState(0);
          return <div>{count}</div>;
        };
      `, { overwrite: true });
      const node = sf.getVariableDeclaration("Component")!.getInitializer()!;
      const hooks = findHooks(node);
      expect(hooks).toContain("useState");
    });

    it("ignores hook-like function names that don't start with use", () => {
      const node = parseNode(`
        function Component() {
          const result = getUsefulData();
          return <div>{result}</div>;
        }
      `);
      const hooks = findHooks(node);
      expect(hooks).not.toContain("getUsefulData");
    });
  });
});

describe("findServerQueries", () => {
  it("detects simple await calls", () => {
    const node = parseNode(`
      async function Component() {
        const data = await fetchData();
        return <div>{data}</div>;
      }
    `);
    const queries = findServerQueries(node);
    expect(queries).toContain("fetchData");
  });

  it("detects multiple await calls", () => {
    const node = parseNode(`
      async function Component() {
        const users = await getUsers();
        const posts = await getPosts();
        return <div>{users.length} users, {posts.length} posts</div>;
      }
    `);
    const queries = findServerQueries(node);
    expect(queries).toContain("getUsers");
    expect(queries).toContain("getPosts");
  });

  it("detects Promise.all patterns", () => {
    const node = parseNode(`
      async function Component() {
        const [users, posts] = await Promise.all([
          fetchUsers(),
          fetchPosts()
        ]);
        return <div>{users.length}</div>;
      }
    `);
    const queries = findServerQueries(node);
    expect(queries).toContain("fetchUsers");
    expect(queries).toContain("fetchPosts");
  });

  it("ignores Promise itself", () => {
    const node = parseNode(`
      async function Component() {
        const result = await Promise.resolve(42);
        return <div>{result}</div>;
      }
    `);
    const queries = findServerQueries(node);
    expect(queries).not.toContain("Promise");
  });

  it("returns empty array for sync components", () => {
    const node = parseNode(`
      function Component() {
        const data = getData();
        return <div>{data}</div>;
      }
    `);
    const queries = findServerQueries(node);
    expect(queries).toHaveLength(0);
  });

  it("does not duplicate queries", () => {
    const node = parseNode(`
      async function Component() {
        const a = await fetchData();
        const b = await fetchData();
        return <div>{a}{b}</div>;
      }
    `);
    const queries = findServerQueries(node);
    const fetchDataCount = queries.filter(q => q === "fetchData").length;
    expect(fetchDataCount).toBe(1);
  });
});
