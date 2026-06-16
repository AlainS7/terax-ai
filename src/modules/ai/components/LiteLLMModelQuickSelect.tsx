import { useLiteLLMModelContext } from "../hooks/useLiteLLMModelContext";
import { useLiteLLMModels } from "../hooks/useLiteLLMModels";
import { LiteLLMModelSelect } from "./LiteLLMModelSelect";

export function LiteLLMModelQuickSelect() {
  const ctx = useLiteLLMModelContext();
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
