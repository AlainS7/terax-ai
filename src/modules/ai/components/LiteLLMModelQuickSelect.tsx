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
      compact
      value={ctx.modelId}
      onChange={ctx.onChange}
      modelIds={modelIds}
      placeholder={loading ? "Loading…" : ctx.modelId || "Model"}
      disabled={loading}
    />
  );
}
