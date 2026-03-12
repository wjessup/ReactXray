import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { extractJsxUsage } from "./jsx-usage.js";

describe("Layout children array resolution", () => {
    it("should track {children} inside native HTML tags and associate with the nearest custom component", () => {
        const project = new Project({ compilerOptions: { jsx: 2 } });
        const source = project.createSourceFile("Layout.tsx", `
      export function Layout({ children, modal }) {
        return (
          <Provider>
            <main>
              <div>{children}</div>
              {modal}
            </main>
          </Provider>
        );
      }
    `);

        const usage = extractJsxUsage(source);

        expect(usage.identifiersInComponent.get("Provider")).toContain("children");
        expect(usage.identifiersInComponent.get("Provider")).toContain("modal");
    });
});
