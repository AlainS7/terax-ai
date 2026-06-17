export type ParsedHunk = {
  id: string;
  filePath: string;
  index: number;
  header: string;
  bodyHash: string;
  patch: string;
  displayLines: string[];
  wholeFile: boolean;
};

export type HunkCatalog = {
  hunks: ParsedHunk[];
  byId: Map<string, ParsedHunk>;
  byFile: Map<string, ParsedHunk[]>;
};

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").trim();
}

function parseDiffGitPath(line: string): string | null {
  const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
  if (!match) return null;
  return normalizePath(match[2]);
}

export function hashHunkBody(lines: string[]): string {
  const body = lines
    .filter((line) => line.startsWith("+") || line.startsWith("-"))
    .join("\n");
  let hash = 0;
  for (let i = 0; i < body.length; i += 1) {
    hash = (Math.imul(31, hash) + body.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export function hunkId(filePath: string, index: number, bodyHash: string): string {
  return `${filePath}#${index}:${bodyHash}`;
}

export function matchHunkId(selectedId: string, catalog: HunkCatalog): ParsedHunk | undefined {
  const exact = catalog.byId.get(selectedId);
  if (exact) return exact;
  const bodyHash = selectedId.includes(":") ? selectedId.split(":").slice(1).join(":") : "";
  const filePath = selectedId.split("#")[0];
  if (!bodyHash || !filePath) return undefined;
  return catalog.hunks.find(
    (hunk) => hunk.filePath === filePath && hunk.bodyHash === bodyHash,
  );
}

export function parseWorktreeDiff(
  diffText: string,
  wholeFilePaths: string[] = [],
): HunkCatalog {
  const hunks: ParsedHunk[] = [];
  const lines = diffText.split("\n");
  let filePath: string | null = null;
  let fileHeaders: string[] = [];
  let hunkLines: string[] = [];
  let hunkHeader = "";
  let fileIndex = -1;

  const flushHunk = () => {
    if (!filePath || hunkLines.length === 0) return;
    fileIndex += 1;
    const bodyHash = hashHunkBody(hunkLines);
    const id = hunkId(filePath, fileIndex, bodyHash);
    const patch = [...fileHeaders, hunkHeader, ...hunkLines].join("\n");
    hunks.push({
      id,
      filePath,
      index: fileIndex,
      header: hunkHeader,
      bodyHash,
      patch: patch.endsWith("\n") ? patch : `${patch}\n`,
      displayLines: [hunkHeader, ...hunkLines],
      wholeFile: false,
    });
    hunkLines = [];
    hunkHeader = "";
  };

  const flushFile = () => {
    flushHunk();
    filePath = null;
    fileHeaders = [];
    fileIndex = -1;
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      flushFile();
      filePath = parseDiffGitPath(line);
      fileHeaders = filePath ? [line] : [];
      continue;
    }
    if (!filePath) continue;

    if (line.startsWith("@@")) {
      flushHunk();
      hunkHeader = line;
      continue;
    }

    if (hunkHeader) {
      hunkLines.push(line);
    } else {
      fileHeaders.push(line);
    }
  }
  flushFile();

  const filesWithHunks = new Set(hunks.map((hunk) => hunk.filePath));
  for (const rawPath of wholeFilePaths) {
    const path = normalizePath(rawPath);
    if (filesWithHunks.has(path)) continue;
    const id = `${path}#whole`;
    hunks.push({
      id,
      filePath: path,
      index: 0,
      header: "(entire file)",
      bodyHash: "whole",
      patch: "",
      displayLines: ["(entire untracked file)"],
      wholeFile: true,
    });
  }

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

export function hunkIdsForFiles(catalog: HunkCatalog, files: string[]): string[] {
  const out: string[] = [];
  for (const raw of files) {
    const path = normalizePath(raw);
    const fileHunks = catalog.byFile.get(path) ?? [];
    for (const hunk of fileHunks) out.push(hunk.id);
  }
  return out;
}
