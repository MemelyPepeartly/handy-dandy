import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import type { OpenAI } from "openai";
import { GPTClient, readGPTSettings } from "../src/scripts/gpt/client";

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

class StubOpenAI {
  public responses = new StubResponses();
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
          GPTModel: "test-model",
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
    model: "test-model",
    temperature: 0.5,
    top_p: 0.75,
    seed: 123,
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
