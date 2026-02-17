import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { OpenAI } from "openai";
import { GPTClient, readGPTSettings, type JsonSchemaDefinition } from "../src/scripts/gpt/client";

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

class StubImages {
  public calls: ResponsesCall[] = [];
  private readonly queue: Array<() => Promise<unknown>> = [];

  enqueue(response: unknown | Error): void {
    if (response instanceof Error) {
      this.queue.push(() => Promise.reject(response));
    } else {
      this.queue.push(() => Promise.resolve(response));
    }
  }

  async generate(input: ResponsesCall): Promise<unknown> {
    this.calls.push(input);
    const task = this.queue.shift();
    if (!task) throw new Error("No stubbed image response available");
    return task();
  }
}

class StubOpenAI {
  public responses = new StubResponses();
  public images = new StubImages();
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
          GPTModel: "gpt-5-mini",
          GPTImageModel: "gpt-image-1",
          GPTTemperature: 0.5,
          GPTTopP: 0.75,
          GPTSeed: 123,
        };
        return values[key] ?? null;
      }
    }
  } as any;
});

test("readGPTSettings pulls module settings with sane defaults", () => {
  const config = readGPTSettings();
  assert.deepEqual(config, {
    model: "gpt-5-mini",
    imageModel: "gpt-image-1",
    temperature: 0.5,
    top_p: 0.75,
    seed: 123,
  });
});

test("readGPTSettings falls back to defaults for unknown model ids", () => {
  globalThis.game = {
    settings: {
      get(moduleId: string, key: string) {
        if (moduleId !== "handy-dandy") throw new Error("Unknown module");
        const values: Record<string, unknown> = {
          GPTModel: "not-a-real-model",
          GPTImageModel: "not-a-real-image-model",
          GPTTemperature: 0.25,
          GPTTopP: 0.5,
          GPTSeed: Number.NaN,
        };
        return values[key] ?? null;
      },
    },
  } as any;

  const config = readGPTSettings();
  assert.deepEqual(config, {
    model: "gpt-5-mini",
    imageModel: "gpt-image-1.5",
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

  const client = GPTClient.fromSettings(stub as unknown as OpenAI);
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

  const client = GPTClient.fromSettings(stub as unknown as OpenAI);
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

  const client = GPTClient.fromSettings(stub as unknown as OpenAI);
  const result = await client.generateWithSchema<{ value: number }>("Say hello", schema);

  assert.deepEqual(result, { value: 7 });
  assert.equal(stub.responses.calls.length, 2);

  const [, fallbackCall] = stub.responses.calls;
  assert.equal(Array.isArray(fallbackCall.tools), true);
  assert.equal(fallbackCall.tool_choice?.name, schema.name);
});

test("generateImage requests output_format without deprecated response_format", async () => {
  const stub = new StubOpenAI();
  stub.images.enqueue({
    data: [{ b64_json: "Zm9v" }],
  });

  const client = GPTClient.fromSettings(stub as unknown as OpenAI);
  const result = await client.generateImage("Create token art", { format: "png" });

  assert.equal(result.base64, "Zm9v");
  assert.equal(result.mimeType, "image/png");
  assert.equal(stub.images.calls.length, 1);
  assert.equal(stub.images.calls[0]?.output_format, "png");
  assert.equal(Object.hasOwn(stub.images.calls[0] ?? {}, "response_format"), false);
});
