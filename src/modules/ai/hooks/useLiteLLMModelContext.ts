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

export type LiteLLMModelContext = {
  baseURL: string;
  apiKey: string | null;
  modelId: string;
  onChange: (modelId: string) => void;
};

export function useLiteLLMModelContext(): LiteLLMModelContext | null {
  const selectedModelId = useChatStore((s) => s.selectedModelId);
  const customEndpointKeys = useChatStore((s) => s.customEndpointKeys);
  const compatProviderKey = useChatStore(
    (s) => s.apiKeys["openai-compatible"],
  );
  const compatBaseURL = usePreferencesStore((s) => s.openaiCompatibleBaseURL);
  const compatModelId = usePreferencesStore((s) => s.openaiCompatibleModelId);
  const customEndpoints = usePreferencesStore((s) => s.customEndpoints);

  return useMemo(() => {
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
}
