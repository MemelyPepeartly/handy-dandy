import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { OpenAI } from "openai";
import { OpenRouterClient, readOpenRouterSettings, type JsonSchemaDefinition } from "../src/scripts/openrouter/client";

type ResponsesCall = Record<string, any>;

class StubResponses {
  public calls: ResponsesCall[] = [];
  private readonly queue: Array<() => Promise<unknown>> = [];

  enqueue(response: unknown | Error): void {
    if (response instanceof Error) {
      this.queue.push(() => Promise.reject(response));
    } else {
      this.queue.push(() => Promise.resolve(response));
    }
  }

  async create(input: ResponsesCall): Promise<unknown> {
    this.calls.push(input);
    const task = this.queue.shift();
    if (!task) throw new Error("No stubbed response available");
    return task();
  }
}

class StubChatCompletions {
  public calls: ResponsesCall[] = [];
  private readonly queue: Array<() => Promise<unknown>> = [];

  enqueue(response: unknown | Error): void {
    if (response instanceof Error) {
      this.queue.push(() => Promise.reject(response));
    } else {
      this.queue.push(() => Promise.resolve(response));
    }
  }

  async create(input: ResponsesCall): Promise<unknown> {
    this.calls.push(input);
    const task = this.queue.shift();
    if (!task) throw new Error("No stubbed chat completion response available");
    return task();
  }
}

class StubChat {
  public completions = new StubChatCompletions();
}

class StubOpenAI {
  public responses = new StubResponses();
  public chat = new StubChat();
}

const schema = {
  name: "Example",
  schema: {
    type: "object",
    properties: {
      value: { type: "number" }
    },
    required: ["value"],
    additionalProperties: false
  }
} as const;

beforeEach(() => {
  globalThis.game = {
    settings: {
      get(moduleId: string, key: string) {
        if (moduleId !== "handy-dandy") throw new Error("Unknown module");
        const values: Record<string, unknown> = {
          OpenRouterModel: "openai/gpt-5-mini",
          OpenRouterImageModel: "openai/gpt-image-1",
          OpenRouterTemperature: 0.5,
          OpenRouterTopP: 0.75,
          OpenRouterSeed: 123,
        };
        return values[key] ?? null;
      }
    }
  } as any;
});

test("readOpenRouterSettings pulls module settings with sane defaults", () => {
  const config = readOpenRouterSettings();
  assert.deepEqual(config, {
    model: "openai/gpt-5-mini",
    imageModel: "openai/gpt-image-1",
    temperature: 0.5,
    top_p: 0.75,
    seed: 123,
  });
});

test("readOpenRouterSettings falls back to defaults for malformed model ids", () => {
  globalThis.game = {
    settings: {
      get(moduleId: string, key: string) {
        if (moduleId !== "handy-dandy") throw new Error("Unknown module");
        const values: Record<string, unknown> = {
          OpenRouterModel: null,
          OpenRouterImageModel: 999,
          OpenRouterTemperature: 0.25,
          OpenRouterTopP: 0.5,
          OpenRouterSeed: Number.NaN,
        };
        return values[key] ?? null;
      },
    },
  } as any;

  const config = readOpenRouterSettings();
  assert.deepEqual(config, {
    model: "openai/gpt-5-mini",
    imageModel: "openai/gpt-image-1",
    temperature: 0.25,
    top_p: 0.5,
  });
});

test("generateWithSchema returns parsed JSON from structured outputs", async () => {
  const stub = new StubOpenAI();
  stub.responses.enqueue({
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_json",
            json: { value: 42 }
          }
        ]
      }
    ]
  });

  const client = OpenRouterClient.fromSettings(stub as unknown as OpenAI);
  const result = await client.generateWithSchema<{ value: number }>("Say hello", schema);

  assert.deepEqual(result, { value: 42 });

  const [call] = stub.responses.calls;
  assert.equal(call.text?.format?.name, schema.name);
  assert.equal(call.text?.format?.strict, true);
});

test("generateWithSchema normalizes schema required properties for strict mode", async () => {
  const stub = new StubOpenAI();
  stub.responses.enqueue({
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_json",
            json: { attributes: { hp: { value: 10, temp: 0 } } }
          }
        ]
      }
    ]
  });

  const client = OpenRouterClient.fromSettings(stub as unknown as OpenAI);
  const complexSchema = {
    name: "Complex",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        attributes: {
          type: "object",
          additionalProperties: false,
          properties: {
            hp: {
              type: "object",
              additionalProperties: false,
              properties: {
                value: { type: "integer" },
                temp: { type: "integer", default: 0 },
              },
              required: ["value"],
            },
          },
          required: ["hp"],
        },
      },
      required: ["attributes"],
    },
  } as const satisfies JsonSchemaDefinition;

  await client.generateWithSchema<{ attributes: { hp: { value: number; temp: number } } }>(
    "Say hello",
    complexSchema,
  );

  const [call] = stub.responses.calls;
  const hpRequired =
    call.text?.format?.schema?.properties?.attributes?.properties?.hp?.required;
  assert.deepEqual(hpRequired, ["value", "temp"]);
});

test("generateWithSchema falls back to tool calls when response_format unsupported", async () => {
  const stub = new StubOpenAI();
  const error = new Error("This model does not support response_format");
  (error as Error & { status?: number }).status = 400;
  stub.responses.enqueue(error);
  stub.responses.enqueue({
    output: [
      {
        type: "message",
        content: [
          {
            type: "tool_call",
            tool_call: {
              name: schema.name,
              arguments: JSON.stringify({ value: 7 })
            }
          }
        ]
      }
    ]
  });

  const client = OpenRouterClient.fromSettings(stub as unknown as OpenAI);
  const result = await client.generateWithSchema<{ value: number }>("Say hello", schema);

  assert.deepEqual(result, { value: 7 });
  assert.equal(stub.responses.calls.length, 2);

  const [, fallbackCall] = stub.responses.calls;
  assert.equal(Array.isArray(fallbackCall.tools), true);
  assert.equal(fallbackCall.tool_choice?.name, schema.name);
});

test("generateWithSchema parses tool output from response function_call blocks", async () => {
  const stub = new StubOpenAI();
  const error = new Error("This model does not support response_format");
  (error as Error & { status?: number }).status = 400;
  stub.responses.enqueue(error);
  stub.responses.enqueue({
    output: [
      {
        type: "function_call",
        name: schema.name,
        arguments: JSON.stringify({ value: 11 }),
      },
    ],
  });

  const client = OpenRouterClient.fromSettings(stub as unknown as OpenAI);
  const result = await client.generateWithSchema<{ value: number }>("Say hello", schema);

  assert.deepEqual(result, { value: 11 });
});

test("generateWithSchema uses tool mode directly when schema has additionalProperties true", async () => {
  const stub = new StubOpenAI();
  const looseSchema = {
    name: "LooseObject",
    schema: {
      type: "object",
      required: ["rules"],
      properties: {
        rules: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
            required: ["key"],
            properties: {
              key: { type: "string" },
            },
          },
        },
      },
      additionalProperties: false,
    },
  } as const satisfies JsonSchemaDefinition;

  stub.responses.enqueue({
    output: [
      {
        type: "function_call",
        name: looseSchema.name,
        arguments: JSON.stringify({ rules: [{ key: "FlatModifier", value: 6 }] }),
      },
    ],
  });

  const client = OpenRouterClient.fromSettings(stub as unknown as OpenAI);
  const result = await client.generateWithSchema<{ rules: Array<{ key: string; value: number }> }>(
    "Generate rules",
    looseSchema,
  );

  assert.deepEqual(result, { rules: [{ key: "FlatModifier", value: 6 }] });
  assert.equal(stub.responses.calls.length, 1);
  assert.equal(stub.responses.calls[0]?.text, undefined);
  assert.equal(Array.isArray(stub.responses.calls[0]?.tools), true);
});

test("generateImage uses chat completions image modalities and parses data URLs", async () => {
  const stub = new StubOpenAI();
  stub.chat.completions.enqueue({
    choices: [
      {
        message: {
          content: "Updated prompt",
          images: [
            {
              image_url: {
                url: "data:image/png;base64,Zm9v",
              },
            },
          ],
        },
      },
    ],
  });

  const client = OpenRouterClient.fromSettings(stub as unknown as OpenAI);
  const result = await client.generateImage("Create token art", { format: "png" });

  assert.equal(result.base64, "Zm9v");
  assert.equal(result.mimeType, "image/png");
  assert.equal(result.revisedPrompt, "Updated prompt");
  assert.equal(stub.chat.completions.calls.length, 1);
  assert.deepEqual(stub.chat.completions.calls[0]?.modalities, ["image", "text"]);
});

test("generateImage includes reference images in chat content blocks", async () => {
  const stub = new StubOpenAI();
  stub.chat.completions.enqueue({
    choices: [
      {
        message: {
          images: [
            {
              image_url: {
                url: "data:image/png;base64,Zm9v",
              },
            },
          ],
        },
      },
    ],
  });

  const client = OpenRouterClient.fromSettings(stub as unknown as OpenAI);
  const referenceImage = new File([Buffer.from("image")], "reference.png", { type: "image/png" });
  await client.generateImage("Edit token art", { referenceImages: [referenceImage] });

  assert.equal(stub.chat.completions.calls.length, 1);
  const [call] = stub.chat.completions.calls;
  const message = call?.messages?.[0];
  assert.equal(message?.role, "user");
  assert.equal(Array.isArray(message?.content), true);
  const content = message?.content as Array<Record<string, unknown>>;
  assert.equal(content[0]?.type, "text");
  assert.equal(content[0]?.text, "Edit token art");
  assert.equal(content[1]?.type, "image_url");
  const imageUrl = (content[1]?.image_url as { url?: string })?.url ?? "";
  assert.match(imageUrl, /^data:image\/png;base64,/);
});
