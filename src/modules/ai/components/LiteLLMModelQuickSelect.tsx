import { useMemo } from "react";
import {
  endpointIdFromCompatModel,
  isCompatModelId,
} from "../config";
import { useChatStore } from "../store/chatStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setCustomEndpoints,
  setOpenaiCompatibleModelId,
} from "@/modules/settings/store";
import { useLiteLLMModels } from "../hooks/useLiteLLMModels";
import { LiteLLMModelSelect } from "./LiteLLMModelSelect";

export function LiteLLMModelQuickSelect() {
  const selectedModelId = useChatStore((s) => s.selectedModelId);
  const customEndpointKeys = useChatStore((s) => s.customEndpointKeys);
  const compatProviderKey = useChatStore(
    (s) => s.apiKeys["openai-compatible"],
  );
  const compatBaseURL = usePreferencesStore((s) => s.openaiCompatibleBaseURL);

  const compatModelId = usePreferencesStore((s) => s.openaiCompatibleModelId);
  const customEndpoints = usePreferencesStore((s) => s.customEndpoints);

  const ctx = useMemo(() => {
    if (selectedModelId === "openai-compatible-custom") {
      if (!compatBaseURL.trim()) return null;
      return {
        baseURL: compatBaseURL,
        apiKey: compatProviderKey,
        modelId: compatModelId,
        onChange: (v: string) => void setOpenaiCompatibleModelId(v),
      };
    }
    if (isCompatModelId(selectedModelId)) {
      const eid = endpointIdFromCompatModel(selectedModelId);
      const ep = customEndpoints.find((e) => e.id === eid);
      if (!ep?.baseURL.trim()) return null;
      return {
        baseURL: ep.baseURL,
        apiKey: customEndpointKeys[eid] ?? null,
        modelId: ep.modelId,
        onChange: (v: string) =>
          void setCustomEndpoints(
            customEndpoints.map((e) =>
              e.id === eid ? { ...e, modelId: v } : e,
            ),
          ),
      };
    }
    return null;
  }, [
    compatBaseURL,
    compatModelId,
    compatProviderKey,
    customEndpointKeys,
    customEndpoints,
    selectedModelId,
  ]);

  const { modelIds, loading, supported } = useLiteLLMModels(
    ctx?.baseURL ?? "",
    ctx?.apiKey,
  );

  if (!ctx || (!supported && !loading)) return null;

  return (
    <LiteLLMModelSelect
      value={ctx.modelId}
      onChange={ctx.onChange}
      modelIds={modelIds}
      triggerClassName="max-w-[11rem]"
      placeholder={loading ? "Loading…" : ctx.modelId || "LiteLLM model"}
      disabled={loading}
    />
  );
}
