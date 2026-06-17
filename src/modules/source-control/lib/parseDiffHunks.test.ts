import { describe, expect, it } from "vitest";
import { matchHunkId, parseWorktreeDiff } from "./parseDiffHunks";

describe("parseDiffHunks", () => {
  it("parses multiple hunks in one file", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "index 111..222 100644",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1,3 +1,4 @@",
      " context",
      "-old1",
      "+new1",
      "@@ -20,3 +21,4 @@ export function bar() {",
      " context2",
      "-old2",
      "+new2",
    ].join("\n");

    const catalog = parseWorktreeDiff(diff);
    expect(catalog.hunks).toHaveLength(2);
    expect(catalog.byFile.get("src/a.ts")).toHaveLength(2);
    expect(catalog.hunks[0].patch).toContain("@@ -1,3 +1,4 @@");
    expect(catalog.hunks[1].patch).toContain("@@ -20,3 +21,4 @@");
  });

  it("matches hunks by body hash after reparse", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
    ].join("\n");
    const first = parseWorktreeDiff(diff);
    const id = first.hunks[0].id;
    const second = parseWorktreeDiff(diff);
    expect(matchHunkId(id, second)?.bodyHash).toBe(first.hunks[0].bodyHash);
  });

  it("adds whole-file entries for untracked paths", () => {
    const catalog = parseWorktreeDiff("", ["src/new.ts"]);
    expect(catalog.hunks).toHaveLength(1);
    expect(catalog.hunks[0].wholeFile).toBe(true);
    expect(catalog.hunks[0].id).toBe("src/new.ts#whole");
  });
});
