import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("landing page visual stylesheet", () => {
  it("keeps screen layout styles alongside export and print styles", () => {
    const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");

    expect(css).toContain(".app-shell");
    expect(css).toContain(".sidebar");
    expect(css).toContain(".content-grid");
    expect(css).toContain(".id-card");
    expect(css).toContain(".print-sheet");
    expect(css).toContain(".print-preview-modal");
    expect(css).toContain("@media print");
  });

  it("keeps the badge-maker tool rail and production-tool visual language", () => {
    const css = readFileSync(resolve(process.cwd(), "client/src/index.css"), "utf8");

    expect(css).toContain(".designer-toolstrip");
    expect(css).toContain(".designer-tool.ai");
    expect(css).toContain(".designer-tool.security");
    expect(css).toContain("--coral: #146ec1");
    expect(css).toContain("--olive: #23845d");
  });
});
