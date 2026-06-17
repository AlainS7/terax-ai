import { native, type GitStatusSnapshot } from "@/modules/ai/lib/native";
import { z } from "zod";
import {
  hunkIdsForFiles,
  matchHunkId,
  parseWorktreeDiff,
  type HunkCatalog,
  type ParsedHunk,
} from "./parseDiffHunks";

export const COMPOSE_DIFF_CHAR_LIMIT = 80_000;
export const COMPOSE_MAX_OUTPUT_TOKENS = 4096;

export const CONVENTIONAL_PREFIX =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?: .+/;

const commitPlanItemSchema = z.object({
  order: z.coerce.number().int().positive(),
  description: z.string(),
  hunkIds: z.array(z.string()).optional(),
  files: z.array(z.string()).optional(),
  commitMessage: z.string(),
  commitBody: z.string().optional(),
});

export const commitPlanSchema = z.object({
  commits: z.array(commitPlanItemSchema).min(1),
});

export type AiCommitPlanItem = z.infer<typeof commitPlanSchema>["commits"][number];

export type ComposeCommitDraft = {
  id: string;
  order: number;
  description: string;
  hunkIds: string[];
  message: string;
  body: string;
  enabled: boolean;
};

export type ComposePlanValidation =
  | { ok: true }
  | { ok: false; reason: string };

export const COMPOSE_COMMITS_SYSTEM_PROMPT =
  "You are an expert Git maintainer. Split the provided staged/selected changes into clean, atomic commits. Prefer hunk-level splits when one file contains unrelated edits. Assign every catalog hunk id to exactly one commit. Use Conventional Commits for each commitMessage (type(scope): subject). Reply with JSON only — no markdown fences or commentary.";

export const COMPOSE_PLAN_JSON_EXAMPLE = `{
  "commits": [
    {
      "order": 1,
      "description": "what this commit contains",
      "hunkIds": ["src/a.ts#0:abc123"],
      "commitMessage": "feat(scope): subject line",
      "commitBody": "Optional longer explanation."
    }
  ]
}`;

export function changedFilePaths(status: GitStatusSnapshot): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const file of status.changedFiles) {
    if (seen.has(file.path)) continue;
    seen.add(file.path);
    out.push(file.path);
  }
  return out;
}

/** Staged paths plus the currently selected change row (if any). */
export function composeScopePaths(
  status: GitStatusSnapshot,
  selectedPath: string | null,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (path: string) => {
    if (!path || seen.has(path)) return;
    seen.add(path);
    out.push(path);
  };

  for (const file of status.changedFiles) {
    if (file.staged) push(file.path);
  }
  if (selectedPath) {
    const selected = status.changedFiles.find((file) => file.path === selectedPath);
    if (selected) push(selected.path);
  }
  return out;
}

export function filterCatalogToPaths(
  catalog: HunkCatalog,
  paths: string[],
): HunkCatalog {
  const allowed = new Set(paths.map((path) => path.replace(/\\/g, "/").trim()));
  const hunks = catalog.hunks.filter((hunk) => allowed.has(hunk.filePath));
  const byId = new Map<string, ParsedHunk>();
  const byFile = new Map<string, ParsedHunk[]>();
  for (const hunk of hunks) {
    byId.set(hunk.id, hunk);
    const list = byFile.get(hunk.filePath) ?? [];
    list.push(hunk);
    byFile.set(hunk.filePath, list);
  }
  return { hunks, byId, byFile };
}

export function untrackedFilePaths(status: GitStatusSnapshot): string[] {
  return changedFilePaths(status).filter((path) => {
    const file = status.changedFiles.find((entry) => entry.path === path);
    return file?.untracked ?? false;
  });
}

export function buildHunkCatalog(
  diffText: string,
  status: GitStatusSnapshot,
  scopePaths: string[],
): HunkCatalog {
  const scopeSet = new Set(scopePaths);
  const untracked = untrackedFilePaths(status).filter((path) =>
    scopeSet.has(path),
  );
  return filterCatalogToPaths(
    parseWorktreeDiff(diffText, untracked),
    scopePaths,
  );
}

export function truncateComposeDiff(diff: string): {
  text: string;
  truncated: boolean;
} {
  if (diff.length <= COMPOSE_DIFF_CHAR_LIMIT) {
    return { text: diff, truncated: false };
  }
  return { text: diff.slice(0, COMPOSE_DIFF_CHAR_LIMIT), truncated: true };
}

export function hunkCatalogSummary(catalog: HunkCatalog): string {
  return catalog.hunks
    .map((hunk) => {
      const label = hunk.wholeFile
        ? "(entire file)"
        : hunk.header.replace(/^@@[^@]*@@\s*/, "").trim() || hunk.header;
      return `- ${hunk.id}  ${hunk.filePath}  ${label}`;
    })
    .join("\n");
}

export function buildComposeAnalyzePrompt(
  catalog: HunkCatalog,
  diffText: string,
  truncated: boolean,
  scopePaths: string[],
): string {
  return [
    "Split the staged/selected changes below into multiple atomic commits.",
    "Rules:",
    "- Only use hunk ids and file paths from the catalog below.",
    "- Assign every catalog hunk id to exactly one commit.",
    "- Prefer hunkIds on each commit. Use files only when you must assign every hunk in those paths.",
    "- Do not invent hunk ids or file paths.",
    "- commitMessage is the Conventional Commit subject (one line).",
    "- commitBody is optional prose after the subject; omit when unnecessary.",
    "- order starts at 1 and increases sequentially.",
    "- Return JSON matching this shape:",
    COMPOSE_PLAN_JSON_EXAMPLE,
    truncated
      ? "The diff was truncated; infer grouping from visible hunks and the catalog."
      : "The scoped diff is included below.",
    "",
    "Scoped files:",
    scopePaths.map((path) => `- ${path}`).join("\n"),
    "",
    "Hunk catalog:",
    hunkCatalogSummary(catalog),
    "",
    "Scoped diff:",
    diffText || "(No textual diff; assign whole-file hunks from the catalog.)",
  ].join("\n");
}

export function buildComposeRepairPrompt(
  raw: string,
  catalog: HunkCatalog,
  parseError: string,
): string {
  return [
    "Fix the JSON commit plan below so it matches the required shape and catalog.",
    `Parse error: ${parseError}`,
    "Rules:",
    "- Return JSON only — no markdown fences.",
    "- Every catalog hunk id must appear in exactly one commit hunkIds array.",
    "- commitMessage must be Conventional Commits (type(scope): subject).",
    "- Required shape:",
    COMPOSE_PLAN_JSON_EXAMPLE,
    "",
    "Hunk catalog:",
    hunkCatalogSummary(catalog),
    "",
    "Invalid plan:",
    raw,
  ].join("\n");
}

function extractJsonObject(raw: string): string {
  let text = raw.trim();
  const fence = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

function normalizeCommitPlanPayload(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const root = input as Record<string, unknown>;
  const commits = Array.isArray(root.commits) ? root.commits : [];
  return {
    commits: commits.map((entry, index) => {
      const item =
        entry && typeof entry === "object"
          ? (entry as Record<string, unknown>)
          : {};
      const hunkIds = item.hunkIds ?? item.hunk_ids ?? item.hunks;
      const files = item.files ?? item.filePaths ?? item.file_paths;
      return {
        order: item.order ?? item.index ?? index + 1,
        description: item.description ?? item.summary ?? item.title ?? "",
        hunkIds: Array.isArray(hunkIds) ? hunkIds : undefined,
        files: Array.isArray(files) ? files : undefined,
        commitMessage:
          item.commitMessage ?? item.commit_message ?? item.message ?? "",
        commitBody: item.commitBody ?? item.commit_body ?? item.body ?? "",
      };
    }),
  };
}

export function parseCommitPlanResponse(raw: string): AiCommitPlanItem[] {
  const jsonText = extractJsonObject(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid JSON";
    throw new Error(`AI plan was not valid JSON: ${detail}`);
  }
  const normalized = normalizeCommitPlanPayload(parsed);
  const result = commitPlanSchema.safeParse(normalized);
  if (!result.success) {
    throw new Error(result.error.issues.map((issue) => issue.message).join("; "));
  }
  return result.data.commits;
}

export function cleanCommitSubject(raw: string): string {
  let text = raw.trim();
  const fence = text.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```\s*$/);
  if (fence) text = fence[1].trim();
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return "";
  return firstLine.replace(/^["'`]+|["'`]+$/g, "").trim();
}

export function isValidCommitSubject(message: string): boolean {
  return CONVENTIONAL_PREFIX.test(message);
}

export function resolvePlanHunkIds(
  item: AiCommitPlanItem,
  catalog: HunkCatalog,
): string[] {
  if (item.hunkIds && item.hunkIds.length > 0) {
    return [...new Set(item.hunkIds.map((id) => id.trim()).filter(Boolean))];
  }
  if (item.files && item.files.length > 0) {
    return hunkIdsForFiles(catalog, item.files);
  }
  return [];
}

export function planItemsToDrafts(
  items: AiCommitPlanItem[],
  catalog: HunkCatalog,
): ComposeCommitDraft[] {
  return [...items]
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({
      id: `commit-${index + 1}`,
      order: index + 1,
      description: item.description.trim(),
      hunkIds: resolvePlanHunkIds(item, catalog),
      message: cleanCommitSubject(item.commitMessage),
      body: typeof item.commitBody === "string" ? item.commitBody.trim() : "",
      enabled: true,
    }));
}

export function filesForCommit(
  commit: ComposeCommitDraft,
  catalog: HunkCatalog,
): string[] {
  const paths = new Set<string>();
  for (const hunkId of commit.hunkIds) {
    const hunk = catalog.byId.get(hunkId);
    if (hunk) paths.add(hunk.filePath);
  }
  return [...paths];
}

export function validateComposePlan(
  commits: ComposeCommitDraft[],
  catalog: HunkCatalog,
): ComposePlanValidation {
  const enabled = commits.filter((c) => c.enabled);
  if (enabled.length === 0) {
    return { ok: false, reason: "Enable at least one commit." };
  }

  const assigned = new Map<string, string>();

  for (const commit of enabled) {
    const message = commit.message.trim();
    if (!message) {
      return { ok: false, reason: "Every enabled commit needs a message." };
    }
    if (!isValidCommitSubject(message)) {
      return {
        ok: false,
        reason: `Invalid commit message: ${message}`,
      };
    }
    if (commit.hunkIds.length === 0) {
      return { ok: false, reason: "Every enabled commit needs at least one hunk." };
    }
    for (const hunkId of commit.hunkIds) {
      if (!catalog.byId.has(hunkId)) {
        return { ok: false, reason: `Unknown hunk in plan: ${hunkId}` };
      }
      if (assigned.has(hunkId)) {
        return { ok: false, reason: `Hunk assigned twice: ${hunkId}` };
      }
      assigned.set(hunkId, commit.id);
    }
  }

  for (const hunk of catalog.hunks) {
    if (!assigned.has(hunk.id)) {
      return { ok: false, reason: `Missing hunk from plan: ${hunk.id}` };
    }
  }

  return { ok: true };
}

export function moveHunkBetweenCommits(
  commits: ComposeCommitDraft[],
  hunkId: string,
  targetCommitId: string,
): ComposeCommitDraft[] {
  return commits.map((commit) => {
    if (commit.id === targetCommitId) {
      if (commit.hunkIds.includes(hunkId)) return commit;
      return { ...commit, hunkIds: [...commit.hunkIds, hunkId] };
    }
    return {
      ...commit,
      hunkIds: commit.hunkIds.filter((id) => id !== hunkId),
    };
  });
}

export function removeEmptyCommits(
  commits: ComposeCommitDraft[],
): ComposeCommitDraft[] {
  return commits.filter((c) => c.hunkIds.length > 0);
}

export function renumberComposeCommits(
  commits: ComposeCommitDraft[],
): ComposeCommitDraft[] {
  return commits.map((commit, index) => ({
    ...commit,
    order: index + 1,
  }));
}

export function extractFilePatch(diffText: string, filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const lines = diffText.split("\n");
  const chunks: string[] = [];
  let capture = false;
  let current: string[] = [];

  const flush = () => {
    if (current.length > 0) chunks.push(current.join("\n"));
    current = [];
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (capture) flush();
      capture =
        line.includes(` b/${normalized}`) ||
        line.includes(` b/${normalized} `) ||
        line.endsWith(` b/${normalized}`);
      if (capture) current = [line];
      continue;
    }
    if (capture) current.push(line);
  }
  if (capture) flush();
  return chunks.join("\n\n");
}

export function hunkAssignmentMap(
  commits: ComposeCommitDraft[],
): Map<string, number> {
  const map = new Map<string, number>();
  commits.forEach((commit, index) => {
    for (const hunkId of commit.hunkIds) {
      map.set(hunkId, index + 1);
    }
  });
  return map;
}

export function fileHunkCounts(
  catalog: HunkCatalog,
  commits: ComposeCommitDraft[],
): Map<string, { assigned: number; total: number }> {
  const map = new Map<string, { assigned: number; total: number }>();
  for (const [path, hunks] of catalog.byFile) {
    map.set(path, { assigned: 0, total: hunks.length });
  }
  for (const commit of commits) {
    for (const hunkId of commit.hunkIds) {
      const hunk = catalog.byId.get(hunkId);
      if (!hunk) continue;
      const entry = map.get(hunk.filePath);
      if (entry) entry.assigned += 1;
    }
  }
  return map;
}

async function stageHunk(
  repoRoot: string,
  selectedId: string,
  catalog: HunkCatalog,
): Promise<void> {
  const hunk = matchHunkId(selectedId, catalog);
  if (!hunk) {
    throw new Error(`Hunk no longer available in the working tree: ${selectedId}`);
  }
  if (hunk.wholeFile) {
    await native.gitStage(repoRoot, [hunk.filePath]);
    return;
  }
  await native.gitApplyCached(repoRoot, hunk.patch);
}

export function formatComposeCommitMessage(commit: ComposeCommitDraft): string {
  const subject = commit.message.trim();
  const body = commit.body.trim();
  if (!body) return subject;
  return `${subject}\n\n${body}`;
}

export async function fetchScopedComposeDiff(
  repoRoot: string,
  status: GitStatusSnapshot,
  scopePaths: string[],
): Promise<string> {
  const parts: string[] = [];
  for (const path of scopePaths) {
    const file = status.changedFiles.find((entry) => entry.path === path);
    if (!file) continue;
    if (file.staged) {
      const staged = await native.gitDiff(repoRoot, path, true);
      if (staged.diffText.trim()) parts.push(staged.diffText);
      continue;
    }
    const worktree = await native.gitDiffWorktree(repoRoot, path);
    if (worktree.diffText.trim()) parts.push(worktree.diffText);
  }
  return parts.join("\n");
}

export type ExecuteComposeResult = {
  shas: string[];
  committedCount: number;
};

export async function executeComposePlan(
  repoRoot: string,
  commits: ComposeCommitDraft[],
  resetPaths: string[],
  scopePaths: string[],
): Promise<ExecuteComposeResult> {
  const enabled = commits
    .filter((c) => c.enabled && c.hunkIds.length > 0)
    .sort((a, b) => a.order - b.order);

  if (enabled.length === 0) {
    throw new Error("No commits to apply.");
  }

  const uniqueResetPaths = [...new Set(resetPaths)];
  const scopeSet = new Set(scopePaths);
  const shas: string[] = [];

  for (const commit of enabled) {
    if (uniqueResetPaths.length > 0) {
      await native.gitUnstage(repoRoot, uniqueResetPaths);
    }

    const diffResult = await native.gitDiffWorktree(repoRoot);
    const liveCatalog = filterCatalogToPaths(
      parseWorktreeDiff(diffResult.diffText),
      scopePaths,
    );

    for (const hunkId of commit.hunkIds) {
      const scopedHunk = matchHunkId(hunkId, liveCatalog);
      if (!scopedHunk) {
        throw new Error(`Hunk no longer available in scoped changes: ${hunkId}`);
      }
      if (!scopeSet.has(scopedHunk.filePath)) {
        throw new Error(`Hunk outside compose scope: ${hunkId}`);
      }
      await stageHunk(repoRoot, hunkId, liveCatalog);
    }

    const result = await native.gitCommit(
      repoRoot,
      formatComposeCommitMessage(commit),
    );
    shas.push(result.commitSha);
  }

  return { shas, committedCount: enabled.length };
}

export type { HunkCatalog, ParsedHunk };
