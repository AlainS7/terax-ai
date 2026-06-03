import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { litellmModelsForPicker } from "../litellmModels";

type LiteLLMModelSelectProps = {
  value: string;
  onChange: (modelId: string) => void;
  modelIds: readonly string[];
  triggerClassName?: string;
  placeholder?: string;
  disabled?: boolean;
};

export function LiteLLMModelSelect({
  value,
  onChange,
  modelIds,
  triggerClassName,
  placeholder = "Select LiteLLM model…",
  disabled,
}: LiteLLMModelSelectProps) {
  const models = litellmModelsForPicker(modelIds, value);
  const selectValue = value.trim() || undefined;

  return (
    <Select
      value={selectValue}
      onValueChange={onChange}
      disabled={disabled || models.length === 0}
    >
      <SelectTrigger
        size="sm"
        className={cn(
          "h-8 w-full min-w-0 font-mono text-[11.5px]",
          triggerClassName,
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {models.map((m) => (
          <SelectItem
            key={m.id}
            value={m.id}
            className="font-mono text-[11.5px]"
          >
            {m.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
