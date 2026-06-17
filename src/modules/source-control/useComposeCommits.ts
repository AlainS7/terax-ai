import {
  endpointIdFromCompatModel,
  isCompatModelId,
  providerNeedsKey,
  resolveModel,
} from "@/modules/ai/config";
import { buildConfiguredLanguageModel } from "@/modules/ai/lib/agent";
import { native } from "@/modules/ai/lib/native";
import { useChatStore } from "@/modules/ai/store/chatStore";
import { invalidateRepoDiffs } from "@/modules/editor/lib/diffCache";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { GitComposeTab } from "@/modules/tabs";
import { generateText } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildComposeAnalyzePrompt,
  buildComposeRepairPrompt,
  buildHunkCatalog,
  cleanCommitSubject,
  COMPOSE_COMMITS_SYSTEM_PROMPT,
  COMPOSE_MAX_OUTPUT_TOKENS,
  executeComposePlan,
  fetchScopedComposeDiff,
  isValidCommitSubject,
  moveHunkBetweenCommits,
  parseCommitPlanResponse,
  planItemsToDrafts,
  removeEmptyCommits,
  renumberComposeCommits,
  truncateComposeDiff,
  validateComposePlan,
  type ComposeCommitDraft,
  type HunkCatalog,
} from "./lib/composeCommits";

type ComposePhase = "idle" | "analyzing" | "ready" | "applying" | "done";

function normalizeError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Compose commits failed";
}

export function resolveComposeAiUnavailableReason(input: {
  scopePaths: string[];
  hasApiKeyForSelected: boolean;
  selectedModelId: string;
  customEndpoints: ReturnType<
    typeof usePreferencesStore.getState
  >["customEndpoints"];
  lmstudioModelId: string;
  mlxModelId: string;
  ollamaModelId: string;
  openaiCompatibleBaseURL: string;
  openaiCompatibleModelId: string;
  openrouterModelId: string;
}): string | null {
  if (input.scopePaths.length === 0) {
    return "Stage or select files to compose commits";
  }
  if (!input.hasApiKeyForSelected) {
    return "Connect an AI provider to compose commits";
  }
  const selectedModel = resolveModel(
    input.selectedModelId,
    input.customEndpoints,
  );
  if (selectedModel.id === "lmstudio-local" && !input.lmstudioModelId.trim()) {
    return "Connect an AI provider to compose commits";
  }
  if (selectedModel.id === "mlx-local" && !input.mlxModelId.trim()) {
    return "Connect an AI provider to compose commits";
  }
  if (selectedModel.id === "ollama-local" && !input.ollamaModelId.trim()) {
    return "Connect an AI provider to compose commits";
  }
  if (
    selectedModel.id === "openai-compatible-custom" &&
    (!input.openaiCompatibleBaseURL.trim() ||
      !input.openaiCompatibleModelId.trim())
  ) {
    return "Connect an AI provider to compose commits";
  }
  if (isCompatModelId(input.selectedModelId)) {
    const eid = endpointIdFromCompatModel(input.selectedModelId);
    const ep = input.customEndpoints.find((e) => e.id === eid);
    if (!ep?.baseURL.trim() || !ep?.modelId.trim()) {
      return "Connect an AI provider to compose commits";
    }
  }
  if (
    selectedModel.id === "openrouter-custom" &&
    !input.openrouterModelId.trim()
  ) {
    return "Connect an AI provider to compose commits";
  }
  return null;
}

export function useComposeCommits(input: {
  tab: GitComposeTab;
  onPendingAnalyzeHandled: () => void;
  onApplied: () => Promise<void> | void;
}) {
  const { tab, onPendingAnalyzeHandled, onApplied } = input;
  const selectedModelId = useChatStore((state) => state.selectedModelId);
  const agentStatus = useChatStore((state) => state.agentMeta.status);
  const customEndpoints = usePreferencesStore((state) => state.customEndpoints);
  const hasApiKeyForSelected = useChatStore((state) => {
    if (isCompatModelId(state.selectedModelId)) return true;
    const model = resolveModel(state.selectedModelId, customEndpoints);
    return !providerNeedsKey(model.provider) || !!state.apiKeys[model.provider];
  });
  const lmstudioModelId = usePreferencesStore((state) => state.lmstudioModelId);
  const mlxModelId = usePreferencesStore((state) => state.mlxModelId);
  const ollamaModelId = usePreferencesStore((state) => state.ollamaModelId);
  const openaiCompatibleBaseURL = usePreferencesStore(
    (state) => state.openaiCompatibleBaseURL,
  );
  const openaiCompatibleModelId = usePreferencesStore(
    (state) => state.openaiCompatibleModelId,
  );
  const openrouterModelId = usePreferencesStore(
    (state) => state.openrouterModelId,
  );

  const [phase, setPhase] = useState<ComposePhase>("idle");
  const [commits, setCommits] = useState<ComposeCommitDraft[]>([]);
  const [hunkCatalog, setHunkCatalog] = useState<HunkCatalog | null>(null);
  const [worktreeDiff, setWorktreeDiff] = useState("");
  const [scopePaths, setScopePaths] = useState<string[]>(tab.scopePaths);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedHunkId, setSelectedHunkId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const analyzeRef = useRef<(() => Promise<void>) | null>(null);

  const aiBusy = agentStatus !== "idle" && agentStatus !== "error";

  const aiUnavailableReason = useMemo(
    () =>
      resolveComposeAiUnavailableReason({
        scopePaths: tab.scopePaths,
        hasApiKeyForSelected,
        selectedModelId,
        customEndpoints,
        lmstudioModelId,
        mlxModelId,
        ollamaModelId,
        openaiCompatibleBaseURL,
        openaiCompatibleModelId,
        openrouterModelId,
      }),
    [
      customEndpoints,
      hasApiKeyForSelected,
      lmstudioModelId,
      mlxModelId,
      ollamaModelId,
      openaiCompatibleBaseURL,
      openaiCompatibleModelId,
      openrouterModelId,
      selectedModelId,
      tab.scopePaths,
    ],
  );

  const validation = useMemo(
    () =>
      hunkCatalog
        ? validateComposePlan(commits, hunkCatalog)
        : ({ ok: false, reason: "No hunk catalog loaded." } as const),
    [commits, hunkCatalog],
  );

  const analyze = useCallback(async () => {
    if (tab.scopePaths.length === 0) return;
    if (aiBusy) {
      setError("Wait for the current AI action to finish");
      return;
    }
    if (aiUnavailableReason) {
      setError(aiUnavailableReason);
      return;
    }

    setPhase("analyzing");
    setError(null);
    setResultMessage(null);

    try {
      const status = await native.gitStatus(tab.repoRoot);
      const diffText = await fetchScopedComposeDiff(
        tab.repoRoot,
        status,
        tab.scopePaths,
      );
      const { text, truncated } = truncateComposeDiff(diffText);
      const catalog = buildHunkCatalog(text, status, tab.scopePaths);
      if (catalog.hunks.length === 0) {
        throw new Error("No stageable hunks found in staged/selected files.");
      }
      setWorktreeDiff(text);
      setHunkCatalog(catalog);
      setScopePaths(tab.scopePaths);
      setSelectedFile(catalog.hunks[0]?.filePath ?? null);
      setSelectedHunkId(catalog.hunks[0]?.id ?? null);

      const chatState = useChatStore.getState();
      const prefs = usePreferencesStore.getState();
      const model = await buildConfiguredLanguageModel(
        selectedModelId,
        chatState.apiKeys,
        {
          lmstudioBaseURL: prefs.lmstudioBaseURL,
          lmstudioModelId,
          mlxBaseURL: prefs.mlxBaseURL,
          mlxModelId,
          ollamaBaseURL: prefs.ollamaBaseURL,
          ollamaModelId,
          openaiCompatibleBaseURL,
          openaiCompatibleModelId,
          openrouterModelId,
          customEndpoints: prefs.customEndpoints,
          customEndpointKeys: chatState.customEndpointKeys,
        },
      );

      const result = await generateText({
        model,
        system: COMPOSE_COMMITS_SYSTEM_PROMPT,
        prompt: buildComposeAnalyzePrompt(
          catalog,
          text,
          truncated,
          tab.scopePaths,
        ),
        maxOutputTokens: COMPOSE_MAX_OUTPUT_TOKENS,
        temperature: 0.2,
      });

      let planItems: ReturnType<typeof parseCommitPlanResponse>;
      try {
        planItems = parseCommitPlanResponse(result.text);
      } catch (parseError) {
        const repair = await generateText({
          model,
          system: COMPOSE_COMMITS_SYSTEM_PROMPT,
          prompt: buildComposeRepairPrompt(
            result.text,
            catalog,
            normalizeError(parseError),
          ),
          maxOutputTokens: COMPOSE_MAX_OUTPUT_TOKENS,
          temperature: 0,
        });
        planItems = parseCommitPlanResponse(repair.text);
      }

      let drafts = planItemsToDrafts(planItems, catalog);
      for (const draft of drafts) {
        if (!isValidCommitSubject(draft.message)) {
          draft.message = cleanCommitSubject(draft.message);
        }
      }
      drafts = renumberComposeCommits(removeEmptyCommits(drafts));
      const planValidation = validateComposePlan(drafts, catalog);
      if (!planValidation.ok) {
        throw new Error(planValidation.reason);
      }
      setCommits(drafts);
      setPhase("ready");
    } catch (err) {
      setError(normalizeError(err));
      setPhase("idle");
    }
  }, [
    aiBusy,
    aiUnavailableReason,
    lmstudioModelId,
    mlxModelId,
    ollamaModelId,
    openaiCompatibleBaseURL,
    openaiCompatibleModelId,
    openrouterModelId,
    selectedModelId,
    tab.repoRoot,
    tab.scopePaths,
  ]);

  analyzeRef.current = analyze;

  useEffect(() => {
    if (!tab.pendingAnalyze) return;
    onPendingAnalyzeHandled();
    void analyzeRef.current?.();
  }, [onPendingAnalyzeHandled, tab.pendingAnalyze, tab.scopePaths]);

  const apply = useCallback(async () => {
    if (!validation.ok) {
      setError(validation.reason);
      return;
    }
    setPhase("applying");
    setError(null);
    try {
      const result = await executeComposePlan(
        tab.repoRoot,
        commits,
        scopePaths,
        scopePaths,
      );
      invalidateRepoDiffs(tab.repoRoot);
      await onApplied();
      setResultMessage(
        `Created ${result.committedCount} commit${result.committedCount === 1 ? "" : "s"}.`,
      );
      setPhase("done");
    } catch (err) {
      setError(normalizeError(err));
      setPhase("ready");
    }
  }, [commits, onApplied, scopePaths, tab.repoRoot, validation]);

  const updateCommitMessage = useCallback((id: string, message: string) => {
    setCommits((prev) =>
      prev.map((commit) =>
        commit.id === id ? { ...commit, message } : commit,
      ),
    );
  }, []);

  const updateCommitBody = useCallback((id: string, body: string) => {
    setCommits((prev) =>
      prev.map((commit) => (commit.id === id ? { ...commit, body } : commit)),
    );
  }, []);

  const toggleCommitEnabled = useCallback((id: string) => {
    setCommits((prev) =>
      prev.map((commit) =>
        commit.id === id ? { ...commit, enabled: !commit.enabled } : commit,
      ),
    );
  }, []);

  const moveHunk = useCallback((hunkId: string, targetCommitId: string) => {
    setCommits((prev) =>
      renumberComposeCommits(
        removeEmptyCommits(
          moveHunkBetweenCommits(prev, hunkId, targetCommitId),
        ),
      ),
    );
  }, []);

  const selectHunk = useCallback((hunkId: string, filePath: string) => {
    setSelectedHunkId(hunkId);
    setSelectedFile(filePath);
  }, []);

  const reanalyze = useCallback(() => {
    setPhase("idle");
    setCommits([]);
    setHunkCatalog(null);
    setWorktreeDiff("");
    setError(null);
    setResultMessage(null);
    void analyze();
  }, [analyze]);

  return {
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
    analyze,
    reanalyze,
    apply,
    updateCommitMessage,
    updateCommitBody,
    toggleCommitEnabled,
    moveHunk,
  };
}
