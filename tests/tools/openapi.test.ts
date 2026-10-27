import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOpenApi, renderOpenApi } from "../../src/tools/openapi.ts";

const SPEC = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "Pets <b>", version: "1" },
  tags: [{ name: "pets", description: "All about pets" }],
  paths: {
    "/pets": {
      get: {
        tags: ["pets"],
        summary: "List",
        responses: { "200": { description: "ok", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Pet" } } } } } },
      },
      post: { requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } } }, responses: {} },
    },
  },
  components: {
    schemas: {
      Pet: {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string" }, friend: { $ref: "#/components/schemas/Pet" }, kind: { type: "string", enum: ["cat", "dog"] } },
      },
    },
  },
});

test("operations are grouped by tag, schemas are expanded through $ref and cycles terminate", () => {
  const html = renderOpenApi(parseOpenApi(SPEC)!);
  assert.match(html, /<h2>pets<\/h2>/);
  assert.match(html, /<details class="op m-get">/);
  assert.match(html, /<h2>default<\/h2>/);
  assert.match(html, /<code>name<\/code><b>\*<\/b>/);
  assert.match(html, /<code>dog<\/code>/);
  assert.match(html, /<span class="type">Pet<\/span>/);
});

test("spec text is escaped", () => {
  assert.doesNotMatch(renderOpenApi(parseOpenApi(SPEC)!), /<b>\s*<small>/);
});
