import { describe, expect, it } from "vitest";
import {
  litellmModelsForPicker,
  litellmModelsListUrl,
  parseLiteLLMModelsResponse,
} from "./litellmModels";

describe("litellmModelsListUrl", () => {
  it("appends /models to /v1 base urls", () => {
    expect(litellmModelsListUrl("https://litellm.example.edu/v1")).toBe(
      "https://litellm.example.edu/v1/models",
    );
  });

  it("inserts /v1 when missing", () => {
    expect(litellmModelsListUrl("https://proxy.example.com")).toBe(
      "https://proxy.example.com/v1/models",
    );
  });
});

describe("parseLiteLLMModelsResponse", () => {
  it("reads OpenAI-compatible model ids", () => {
    const body = JSON.stringify({
      data: [{ id: "gpt-5-mini" }, { id: "Llama 3.3" }],
    });
    expect(parseLiteLLMModelsResponse(body)).toEqual([
      "gpt-5-mini",
      "Llama 3.3",
    ]);
  });
});

describe("litellmModelsForPicker", () => {
  it("prepends unknown current model id", () => {
    const models = litellmModelsForPicker(["gpt-5"], "custom-model");
    expect(models[0]?.id).toBe("custom-model");
  });
});
