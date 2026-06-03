import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import { useLiteLLMModels } from "../hooks/useLiteLLMModels";
import { LiteLLMModelSelect } from "./LiteLLMModelSelect";

type OpenAiCompatibleModelIdFieldProps = {
  baseURL: string;
  apiKey?: string | null;
  value: string;
  onChange: (modelId: string) => void;
  placeholder: string;
  className?: string;
};

export function OpenAiCompatibleModelIdField({
  baseURL,
  apiKey,
  value,
  onChange,
  placeholder,
  className = "h-8 font-mono text-[11.5px]",
}: OpenAiCompatibleModelIdFieldProps) {
  const { modelIds, loading, supported } = useLiteLLMModels(baseURL, apiKey);
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  if (loading && !supported) {
    return (
      <Input
        value=""
        disabled
        placeholder="Loading LiteLLM models…"
        spellCheck={false}
        className={className}
      />
    );
  }

  if (supported) {
    return (
      <LiteLLMModelSelect
        value={draft}
        onChange={(v) => {
          setDraft(v);
          if (v !== value) onChange(v);
        }}
        modelIds={modelIds}
        placeholder="Select LiteLLM model…"
      />
    );
  }

  return (
    <Input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const v = draft.trim();
        if (v !== value) onChange(v);
      }}
      placeholder={placeholder}
      spellCheck={false}
      className={className}
    />
  );
}
