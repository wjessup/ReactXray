import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { extractComponentFromFile } from "./component.js";

function parseComponent(code: string, filename = "test.tsx") {
  const project = new Project({
    compilerOptions: { jsx: 2, allowJs: true },
    skipAddingFilesFromTsConfig: true,
  });
  return project.createSourceFile(filename, code, { overwrite: true });
}

describe("extractComponentFromFile", () => {
  describe("client/server component detection", () => {
    it("detects client component with double quotes", () => {
      const sf = parseComponent(`
        "use client";
        export default function ClientComp() {
          return <div>Client</div>;
        }
      `);
      const info = extractComponentFromFile(sf, "components/Client.tsx");
      expect(info).not.toBeNull();
      expect(info!.isClientComponent).toBe(true);
      expect(info!.isServerComponent).toBe(false);
    });

    it("detects client component with single quotes", () => {
      const sf = parseComponent(`
        'use client';
        export default function ClientComp() {
          return <div>Client</div>;
        }
      `);
      const info = extractComponentFromFile(sf, "components/Client.tsx");
      expect(info).not.toBeNull();
      expect(info!.isClientComponent).toBe(true);
    });

    it("detects server component with use server", () => {
      const sf = parseComponent(`
        "use server";
        export default function ServerComp() {
          return <div>Server</div>;
        }
      `);
      const info = extractComponentFromFile(sf, "components/Server.tsx");
      expect(info).not.toBeNull();
      expect(info!.isServerComponent).toBe(true);
      expect(info!.isClientComponent).toBe(false);
    });

    it("detects neither when no directive present", () => {
      const sf = parseComponent(`
        export default function NeutralComp() {
          return <div>Neutral</div>;
        }
      `);
      const info = extractComponentFromFile(sf, "components/Neutral.tsx");
      expect(info).not.toBeNull();
      expect(info!.isClientComponent).toBe(false);
      expect(info!.isServerComponent).toBe(false);
    });
  });

  describe("Next.js file type detection", () => {
    it("detects page.tsx as page type", () => {
      const sf = parseComponent(`
        export default function Page() {
          return <div>Page</div>;
        }
      `);
      const info = extractComponentFromFile(sf, "app/page.tsx");
      expect(info).not.toBeNull();
      expect(info!.nextjsFileType).toBe("page");
    });

    it("detects layout.tsx as layout type", () => {
      const sf = parseComponent(`
        export default function Layout({ children }: { children: React.ReactNode }) {
          return <div>{children}</div>;
        }
      `);
      const info = extractComponentFromFile(sf, "app/layout.tsx");
      expect(info).not.toBeNull();
      expect(info!.nextjsFileType).toBe("layout");
    });

    it("detects loading.tsx as loading type", () => {
      const sf = parseComponent(`
        export default function Loading() {
          return <div>Loading...</div>;
        }
      `);
      const info = extractComponentFromFile(sf, "app/loading.tsx");
      expect(info).not.toBeNull();
      expect(info!.nextjsFileType).toBe("loading");
    });

    it("detects error.tsx as error type", () => {
      const sf = parseComponent(`
        "use client";
        export default function Error({ error }: { error: Error }) {
          return <div>Error: {error.message}</div>;
        }
      `);
      const info = extractComponentFromFile(sf, "app/error.tsx");
      expect(info).not.toBeNull();
      expect(info!.nextjsFileType).toBe("error");
    });

    it("returns null for regular component files", () => {
      const sf = parseComponent(`
        export default function MyComponent() {
          return <div>Component</div>;
        }
      `);
      const info = extractComponentFromFile(sf, "components/MyComponent.tsx");
      expect(info).not.toBeNull();
      expect(info!.nextjsFileType).toBeNull();
    });
  });

  describe("props extraction", () => {
    it("extracts typed props from function declaration", () => {
      const sf = parseComponent(`
        export default function Card({ title, count }: { title: string; count: number }) {
          return <div>{title}: {count}</div>;
        }
      `);
      const info = extractComponentFromFile(sf, "Card.tsx");
      expect(info).not.toBeNull();
      expect(info!.props).toHaveLength(2);
      expect(info!.props.find(p => p.name === "title")?.type).toBe("string");
      expect(info!.props.find(p => p.name === "count")?.type).toBe("number");
    });

    it("detects optional props", () => {
      const sf = parseComponent(`
        export default function Button({ label, disabled }: { label: string; disabled?: boolean }) {
          return <button disabled={disabled}>{label}</button>;
        }
      `);
      const info = extractComponentFromFile(sf, "Button.tsx");
      expect(info).not.toBeNull();
      expect(info!.props.find(p => p.name === "label")?.optional).toBe(false);
      expect(info!.props.find(p => p.name === "disabled")?.optional).toBe(true);
    });

    it("extracts props from arrow function", () => {
      const sf = parseComponent(`
        export const Avatar = ({ src, size }: { src: string; size: number }) => {
          return <img src={src} width={size} />;
        };
      `);
      const info = extractComponentFromFile(sf, "Avatar.tsx");
      expect(info).not.toBeNull();
      expect(info!.name).toBe("Avatar");
      expect(info!.props).toHaveLength(2);
    });

    it("handles component with no props", () => {
      const sf = parseComponent(`
        export default function Divider() {
          return <hr />;
        }
      `);
      const info = extractComponentFromFile(sf, "Divider.tsx");
      expect(info).not.toBeNull();
      expect(info!.props).toHaveLength(0);
    });
  });

  describe("hooks detection", () => {
    it("detects React hooks", () => {
      const sf = parseComponent(`
        "use client";
        export default function Counter() {
          const [count, setCount] = useState(0);
          useEffect(() => { console.log(count); }, [count]);
          return <div>{count}</div>;
        }
      `);
      const info = extractComponentFromFile(sf, "Counter.tsx");
      expect(info).not.toBeNull();
      expect(info!.hooks).toContain("useState");
      expect(info!.hooks).toContain("useEffect");
    });

    it("detects custom hooks", () => {
      const sf = parseComponent(`
        "use client";
        export default function DataDisplay() {
          const data = useCustomData();
          const { user } = useAuth();
          return <div>{data}</div>;
        }
      `);
      const info = extractComponentFromFile(sf, "DataDisplay.tsx");
      expect(info).not.toBeNull();
      expect(info!.hooks).toContain("useCustomData");
      expect(info!.hooks).toContain("useAuth");
    });
  });

  describe("server queries detection", () => {
    it("detects await calls as server queries", () => {
      const sf = parseComponent(`
        export default async function DataPage() {
          const data = await fetchData();
          return <div>{data}</div>;
        }
      `);
      const info = extractComponentFromFile(sf, "page.tsx");
      expect(info).not.toBeNull();
      expect(info!.serverQueries).toContain("fetchData");
    });

    it("does not detect server queries in client components", () => {
      const sf = parseComponent(`
        "use client";
        export default async function ClientPage() {
          const data = await fetchData();
          return <div>{data}</div>;
        }
      `);
      const info = extractComponentFromFile(sf, "page.tsx");
      expect(info).not.toBeNull();
      expect(info!.serverQueries).toHaveLength(0);
    });
  });

  describe("export handling", () => {
    it("extracts default export function declaration", () => {
      const sf = parseComponent(`
        export default function MyPage() {
          return <div>Page</div>;
        }
      `);
      const info = extractComponentFromFile(sf, "page.tsx");
      expect(info).not.toBeNull();
      expect(info!.name).toBe("MyPage");
    });

    it("extracts named export when no default", () => {
      const sf = parseComponent(`
        export function Card() {
          return <div>Card</div>;
        }
      `);
      const info = extractComponentFromFile(sf, "Card.tsx");
      expect(info).not.toBeNull();
      expect(info!.name).toBe("Card");
    });

    it("prefers default export over named export", () => {
      const sf = parseComponent(`
        export function Helper() {
          return <span>Helper</span>;
        }
        export default function Main() {
          return <div>Main</div>;
        }
      `);
      const info = extractComponentFromFile(sf, "Component.tsx");
      expect(info).not.toBeNull();
      expect(info!.name).toBe("Main");
    });

    it("returns null for non-component files", () => {
      const sf = parseComponent(`
        export function calculateSum(a: number, b: number) {
          return a + b;
        }
      `);
      const info = extractComponentFromFile(sf, "utils.ts");
      expect(info).toBeNull();
    });

    it("ignores Next.js special exports", () => {
      const sf = parseComponent(`
        export async function generateMetadata() {
          return { title: "Page" };
        }
        export default function Page() {
          return <div>Page</div>;
        }
      `);
      const info = extractComponentFromFile(sf, "page.tsx");
      expect(info).not.toBeNull();
      expect(info!.name).toBe("Page");
    });
  });
});
