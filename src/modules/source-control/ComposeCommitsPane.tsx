import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { fileIconUrl } from "@/modules/explorer/lib/iconResolver";
import type { GitComposeTab } from "@/modules/tabs";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, useMemo } from "react";
import {
  extractFilePatch,
  fileHunkCounts,
  filesForCommit,
  hunkAssignmentMap,
} from "./lib/composeCommits";
import type { ComposeCommitDraft, HunkCatalog } from "./lib/composeCommits";
import { useComposeCommits } from "./useComposeCommits";

function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

function DiffLine({ line, active }: { line: string; active: boolean }) {
  const added = line.startsWith("+") && !line.startsWith("+++");
  const removed = line.startsWith("-") && !line.startsWith("---");
  const isHunkHeader = line.startsWith("@@");
  return (
    <div
      className={cn(
        "whitespace-pre-wrap break-all px-2 py-px font-mono text-[11px] leading-relaxed",
        added && "bg-emerald-500/10 text-emerald-300",
        removed && "bg-rose-500/10 text-rose-300",
        isHunkHeader && active && "bg-primary/15 text-foreground",
        !added && !removed && !isHunkHeader && "text-muted-foreground/80",
      )}
    >
      {line || " "}
    </div>
  );
}

const CommitCard = memo(function CommitCard({
  commit,
  index,
  total,
  catalog,
  onToggle,
  onMessageChange,
  onBodyChange,
  onMoveHunk,
  selectedHunkId,
  onSelectHunk,
}: {
  commit: ComposeCommitDraft;
  index: number;
  total: number;
  catalog: HunkCatalog;
  onToggle: () => void;
  onMessageChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onMoveHunk: (hunkId: string, direction: "up" | "down") => void;
  selectedHunkId: string | null;
  onSelectHunk: (hunkId: string, filePath: string) => void;
}) {
  const files = filesForCommit(commit, catalog);
  return (
    <div
      className={cn(
        "rounded-lg border bg-background/80 p-3 shadow-sm transition-opacity",
        commit.enabled ? "border-border/70" : "border-border/40 opacity-60",
      )}
    >
      <div className="mb-2.5 flex items-start gap-2">
        <Checkbox
          checked={commit.enabled}
          onCheckedChange={() => onToggle()}
          className="mt-1"
          aria-label={`Include commit ${index + 1}`}
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Commit {index + 1}/{total}
            </span>
            {commit.description ? (
              <span className="truncate text-[10.5px] text-muted-foreground/80">
                {commit.description}
              </span>
            ) : null}
          </div>
          <Input
            value={commit.message}
            onChange={(event) => onMessageChange(event.target.value)}
            disabled={!commit.enabled}
            className="h-9 text-[13px] font-medium"
            placeholder="feat(scope): subject"
          />
          <Textarea
            value={commit.body}
            onChange={(event) => onBodyChange(event.target.value)}
            disabled={!commit.enabled}
            rows={4}
            className="min-h-[88px] resize-y text-[12px] leading-relaxed"
            placeholder="Optional commit body"
          />
        </div>
      </div>
      <ul className="space-y-1">
        {files.map((path) => {
          const iconUrl = fileIconUrl(basename(path));
          const fileHunks = commit.hunkIds
            .map((id) => catalog.byId.get(id))
            .filter((hunk) => hunk?.filePath === path);
          return (
            <li key={path} className="space-y-0.5">
              <div className="flex items-center gap-1.5 px-1 text-[10px] font-medium text-muted-foreground">
                {iconUrl ? (
                  <img src={iconUrl} alt="" className="size-3 shrink-0" />
                ) : (
                  <span className="size-3 shrink-0" />
                )}
                <span className="truncate font-mono">{path}</span>
              </div>
              {fileHunks.map((hunk) => {
                if (!hunk) return null;
                const selected = selectedHunkId === hunk.id;
                const label = hunk.wholeFile
                  ? "entire file"
                  : hunk.header.replace(/^@@[^@]*@@\s*/, "").trim() ||
                    hunk.header;
                return (
                  <div
                    key={hunk.id}
                    className={cn(
                      "group flex items-center gap-1 rounded-md px-1 py-0.5",
                      selected ? "bg-accent/60" : "hover:bg-accent/35",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectHunk(hunk.id, hunk.filePath)}
                      className="min-w-0 flex-1 cursor-pointer truncate text-left font-mono text-[10px] text-foreground/90"
                    >
                      {label}
                    </button>
                    <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="size-5"
                        disabled={index === 0}
                        aria-label="Move hunk to previous commit"
                        onClick={() => onMoveHunk(hunk.id, "up")}
                      >
                        <HugeiconsIcon
                          icon={ArrowUp01Icon}
                          size={10}
                          strokeWidth={2}
                        />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="size-5"
                        disabled={index >= total - 1}
                        aria-label="Move hunk to next commit"
                        onClick={() => onMoveHunk(hunk.id, "down")}
                      >
                        <HugeiconsIcon
                          icon={ArrowDown01Icon}
                          size={10}
                          strokeWidth={2}
                        />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </li>
          );
        })}
      </ul>
    </div>
  );
});

type Props = {
  tab: GitComposeTab;
  onPendingAnalyzeHandled: () => void;
  onRefreshSourceControl: () => Promise<void> | void;
};

export function ComposeCommitsPane({
  tab,
  onPendingAnalyzeHandled,
  onRefreshSourceControl,
}: Props) {
  const compose = useComposeCommits({
    tab,
    onPendingAnalyzeHandled,
    onApplied: onRefreshSourceControl,
  });

  const {
    phase,
    commits,
    hunkCatalog,
    worktreeDiff,
    scopePaths,
    selectedFile,
    selectedHunkId,
    setSelectedFile,
    selectHunk,
    error,
    resultMessage,
    validation,
    aiUnavailableReason,
    reanalyze,
    apply,
    updateCommitMessage,
    updateCommitBody,
    toggleCommitEnabled,
    moveHunk,
  } = compose;

  const displayPaths = useMemo(() => {
    if (scopePaths.length > 0) return scopePaths;
    if (hunkCatalog) return [...hunkCatalog.byFile.keys()];
    return tab.scopePaths;
  }, [hunkCatalog, scopePaths, tab.scopePaths]);

  const enabledCommits = useMemo(
    () => commits.filter((commit) => commit.enabled),
    [commits],
  );

  const hunkAssignments = useMemo(
    () => hunkAssignmentMap(commits),
    [commits],
  );

  const perFileCounts = useMemo(
    () =>
      hunkCatalog ? fileHunkCounts(hunkCatalog, commits) : new Map(),
    [commits, hunkCatalog],
  );

  const selectedPatch = useMemo(() => {
    if (!selectedFile) return "";
    return extractFilePatch(worktreeDiff, selectedFile);
  }, [selectedFile, worktreeDiff]);

  const patchLines = useMemo(
    () => (selectedPatch ? selectedPatch.split("\n") : []),
    [selectedPatch],
  );

  const activeHunkHeader = useMemo(() => {
    if (!selectedHunkId || !hunkCatalog) return null;
    return hunkCatalog.byId.get(selectedHunkId)?.header ?? null;
  }, [hunkCatalog, selectedHunkId]);

  const handleMoveHunk = (hunkId: string, direction: "up" | "down") => {
    const currentIndex = commits.findIndex((commit) =>
      commit.hunkIds.includes(hunkId),
    );
    if (currentIndex < 0) return;
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    const target = commits[targetIndex];
    if (!target) return;
    moveHunk(hunkId, target.id);
  };

  const busy = phase === "analyzing" || phase === "applying";
  const canApply = phase === "ready" && validation.ok && !busy;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <HugeiconsIcon icon={SparklesIcon} size={16} strokeWidth={1.8} />
            AI Compose Commits
          </div>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {displayPaths.length} scoped file
            {displayPaths.length === 1 ? "" : "s"} · switch tabs freely; this
            plan stays here until you apply or re-analyze.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || !!aiUnavailableReason}
            onClick={() => void reanalyze()}
          >
            Re-analyze
          </Button>
          {(phase === "ready" || phase === "applying" || phase === "done") && (
            <Button
              type="button"
              size="sm"
              disabled={!canApply}
              onClick={() => void apply()}
            >
              {phase === "applying" ? (
                <>
                  <Spinner className="size-3.5" />
                  Applying…
                </>
              ) : (
                `Apply ${enabledCommits.length} commit${enabledCommits.length === 1 ? "" : "s"}`
              )}
            </Button>
          )}
        </div>
      </header>

      {phase === "analyzing" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <Spinner className="size-5" />
          <div className="text-sm font-medium">Analyzing staged/selected changes…</div>
          <div className="max-w-md text-[12px] text-muted-foreground">
            Parsing hunks across {displayPaths.length} scoped file
            {displayPaths.length === 1 ? "" : "s"}.
          </div>
        </div>
      ) : null}

      {phase === "idle" && !hunkCatalog && !busy ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-[12px] text-muted-foreground">
          {error ?? aiUnavailableReason ?? "Waiting to analyze…"}
        </div>
      ) : null}

      {(phase === "ready" || phase === "applying" || phase === "done") &&
      hunkCatalog ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(200px,18%)_minmax(0,1fr)_minmax(340px,42%)]">
          <section className="flex min-h-0 flex-col border-r border-border/50 bg-card/40">
            <div className="shrink-0 border-b border-border/40 px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Scoped Files
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              <ul className="space-y-0.5">
                {displayPaths.map((path) => {
                  const iconUrl = fileIconUrl(basename(path));
                  const counts = perFileCounts.get(path);
                  const fileHunks = hunkCatalog.byFile.get(path) ?? [];
                  const selected = selectedFile === path;
                  return (
                    <li key={path} className="space-y-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          const first = fileHunks[0];
                          if (first) selectHunk(first.id, path);
                          else setSelectedFile(path);
                        }}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left",
                          selected ? "bg-accent/60" : "hover:bg-accent/35",
                        )}
                      >
                        {iconUrl ? (
                          <img
                            src={iconUrl}
                            alt=""
                            className="size-3.5 shrink-0"
                          />
                        ) : (
                          <span className="size-3.5 shrink-0" />
                        )}
                        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px]">
                          {path}
                        </span>
                        {counts && counts.total > 1 ? (
                          <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">
                            {counts.assigned}/{counts.total}
                          </span>
                        ) : null}
                      </button>
                      {selected
                        ? fileHunks.map((hunk) => (
                            <button
                              key={hunk.id}
                              type="button"
                              onClick={() => selectHunk(hunk.id, path)}
                              className={cn(
                                "ml-5 flex w-[calc(100%-1.25rem)] cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left",
                                selectedHunkId === hunk.id
                                  ? "bg-primary/15"
                                  : "hover:bg-accent/25",
                              )}
                            >
                              <span className="min-w-0 flex-1 truncate font-mono text-[9.5px] text-muted-foreground">
                                {hunk.wholeFile
                                  ? "entire file"
                                  : hunk.header.replace(
                                      /^@@[^@]*@@\s*/,
                                      "",
                                    ) || hunk.header}
                              </span>
                              {hunkAssignments.get(hunk.id) ? (
                                <span className="shrink-0 rounded bg-foreground/10 px-1 py-0.5 text-[8.5px] font-semibold tabular-nums">
                                  #{hunkAssignments.get(hunk.id)}
                                </span>
                              ) : null}
                            </button>
                          ))
                        : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          <section className="flex min-h-0 flex-col border-r border-border/50 bg-muted/20">
            <div className="shrink-0 border-b border-border/40 px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              {selectedFile ? basename(selectedFile) : "Diff Preview"}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {selectedFile && patchLines.length > 0 ? (
                patchLines.map((line, index) => (
                  <DiffLine
                    key={`${index}-${line}`}
                    line={line}
                    active={!!activeHunkHeader && line === activeHunkHeader}
                  />
                ))
              ) : (
                <div className="flex h-full items-center justify-center px-4 text-center text-[12px] text-muted-foreground">
                  {selectedFile
                    ? "No textual diff for this file (binary or untracked)."
                    : "Select a file to preview its patch."}
                </div>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col bg-card/30">
            <div className="shrink-0 border-b border-border/40 px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Commit Plan ({enabledCommits.length})
            </div>
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
              {commits.map((commit, index) => (
                <CommitCard
                  key={commit.id}
                  commit={commit}
                  index={index}
                  total={commits.length}
                  catalog={hunkCatalog}
                  selectedHunkId={selectedHunkId}
                  onSelectHunk={selectHunk}
                  onToggle={() => toggleCommitEnabled(commit.id)}
                  onMessageChange={(value) =>
                    updateCommitMessage(commit.id, value)
                  }
                  onBodyChange={(value) => updateCommitBody(commit.id, value)}
                  onMoveHunk={handleMoveHunk}
                />
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {(error || resultMessage || (!validation.ok && phase === "ready")) && (
        <footer
          className={cn(
            "shrink-0 border-t border-border/50 px-4 py-2 text-[11.5px]",
            error ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {error ??
            resultMessage ??
            (!validation.ok ? validation.reason : null)}
        </footer>
      )}
    </div>
  );
}
