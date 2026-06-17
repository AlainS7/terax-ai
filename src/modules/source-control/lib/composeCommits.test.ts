import { describe, expect, it } from "vitest";
import {
  buildComposeAnalyzePrompt,
  buildHunkCatalog,
  changedFilePaths,
  cleanCommitSubject,
  composeScopePaths,
  moveHunkBetweenCommits,
  parseCommitPlanResponse,
  planItemsToDrafts,
  validateComposePlan,
} from "./composeCommits";
import { parseWorktreeDiff } from "./parseDiffHunks";

const sampleStatus = {
  repoRoot: "/repo",
  branch: "main",
  upstream: null,
  ahead: 0,
  behind: 0,
  isDetached: false,
  truncated: false,
  changedFiles: [
    {
      path: "src/a.ts",
      originalPath: null,
      indexStatus: "M",
      worktreeStatus: " ",
      staged: true,
      unstaged: false,
      untracked: false,
      statusLabel: "Modified",
    },
    {
      path: "src/b.ts",
      originalPath: null,
      indexStatus: "?",
      worktreeStatus: "?",
      staged: false,
      unstaged: true,
      untracked: true,
      statusLabel: "Untracked",
    },
    {
      path: "src/c.ts",
      originalPath: null,
      indexStatus: "M",
      worktreeStatus: "M",
      staged: false,
      unstaged: true,
      untracked: false,
      statusLabel: "Modified",
    },
  ],
};

describe("composeCommits", () => {
  it("collects unique changed paths", () => {
    expect(changedFilePaths(sampleStatus)).toEqual([
      "src/a.ts",
      "src/b.ts",
      "src/c.ts",
    ]);
  });

  it("scopes to staged and selected paths", () => {
    expect(composeScopePaths(sampleStatus, null)).toEqual(["src/a.ts"]);
    expect(composeScopePaths(sampleStatus, "src/c.ts")).toEqual([
      "src/a.ts",
      "src/c.ts",
    ]);
    expect(composeScopePaths(sampleStatus, "src/b.ts")).toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
  });

  it("validates full hunk coverage", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
    ].join("\n");
    const scope = ["src/a.ts", "src/b.ts"];
    const catalog = buildHunkCatalog(diff, sampleStatus, scope);
    const hunkA = catalog.hunks.find((h) => h.filePath === "src/a.ts")!;
    const hunkB = catalog.hunks.find((h) => h.filePath === "src/b.ts")!;

    const drafts = planItemsToDrafts(
      [
        {
          order: 1,
          description: "backend",
          hunkIds: [hunkA.id],
          commitMessage: "feat(api): add handler",
        },
        {
          order: 2,
          description: "ui",
          hunkIds: [hunkB.id],
          commitMessage: "feat(ui): add panel",
        },
      ],
      catalog,
    );
    expect(validateComposePlan(drafts, catalog).ok).toBe(true);
  });

  it("parses fenced JSON commit plans", () => {
    const plan = parseCommitPlanResponse(`\`\`\`json
{
  "commits": [
    {
      "order": "1",
      "description": "feat",
      "files": ["src/a.ts"],
      "commitMessage": "feat(core): add thing"
    }
  ]
}
\`\`\``);
    expect(plan).toHaveLength(1);
    expect(plan[0].order).toBe(1);
    expect(plan[0].files).toEqual(["src/a.ts"]);
  });

  it("cleans fenced commit subjects", () => {
    expect(cleanCommitSubject("```\nfeat: add thing\n```")).toBe("feat: add thing");
  });

  it("moves hunks between commits", () => {
    const catalog = parseWorktreeDiff([
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1 +1 @@",
      "-a",
      "+b",
      "@@ -5 +5 @@",
      "-c",
      "+d",
    ].join("\n"));
    const [h0, h1] = catalog.hunks;
    const drafts = planItemsToDrafts(
      [
        {
          order: 1,
          description: "a",
          hunkIds: [h0.id, h1.id],
          commitMessage: "feat: one",
        },
        {
          order: 2,
          description: "b",
          hunkIds: [],
          commitMessage: "feat: two",
        },
      ],
      catalog,
    );
    const moved = moveHunkBetweenCommits(drafts, h1.id, drafts[1].id);
    expect(moved[0].hunkIds).toEqual([h0.id]);
    expect(moved[1].hunkIds).toEqual([h1.id]);
  });

  it("builds analyze prompt with scoped files", () => {
    const catalog = parseWorktreeDiff("diff --git a/x b/x\n--- a/x\n+++ b/x\n@@\n+a\n");
    const prompt = buildComposeAnalyzePrompt(catalog, "patch", false, ["x"]);
    expect(prompt).toContain("Scoped files");
    expect(prompt).toContain("Hunk catalog");
    expect(prompt).toContain("patch");
  });
});
