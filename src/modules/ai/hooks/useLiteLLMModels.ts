import { useEffect, useState } from "react";
import { fetchLiteLLMModelIds } from "../litellmModels";

type State = {
  modelIds: string[];
  loading: boolean;
  error: string | null;
};

export function useLiteLLMModels(
  baseURL: string,
  apiKey?: string | null,
): State & { supported: boolean } {
  const [state, setState] = useState<State>({
    modelIds: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    const trimmed = baseURL.trim();
    if (!trimmed) {
      setState({ modelIds: [], loading: false, error: null });
      return;
    }

    const controller = new AbortController();
    setState((prev) => ({ ...prev, loading: true, error: null }));

    void fetchLiteLLMModelIds(trimmed, apiKey, { signal: controller.signal })
      .then((modelIds) => {
        if (controller.signal.aborted) return;
        setState({ modelIds, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : "Failed to load models";
        setState({ modelIds: [], loading: false, error: message });
      });

    return () => controller.abort();
  }, [apiKey, baseURL]);

  return {
    ...state,
    supported: state.modelIds.length > 0,
  };
}
