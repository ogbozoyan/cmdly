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
        parameters: [{ name: "limit", in: "query", required: true, schema: { type: "integer", format: "int32" } }],
        responses: { "200": { description: "ok", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Pet" } } } } } },
      },
      post: { requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Pet" } } } }, responses: {} },
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

test("operations are grouped by tag, parameters get a table and schemas expand through $ref with cycles ending", () => {
  const html = renderOpenApi(parseOpenApi(SPEC)!);
  assert.match(html, /<h2 class="tag"><span>pets<\/span>/);
  assert.match(html, /<h2 class="tag"><span>default<\/span>/);
  assert.match(html, /<details class="op m-get">/);
  assert.match(html, /class="pname">limit<b class="req">\*<\/b>/);
  assert.match(html, /integer\(\$int32\)/);
  assert.match(html, /class="mp">name<b class="req">\*<\/b>/);
  assert.match(html, /enum: .*dog/);
  assert.match(html, /<summary>Pet<\/summary>/);
});

test("a body gets an example built from its schema and the Example/Schema tabs", () => {
  const html = renderOpenApi(parseOpenApi(SPEC)!);
  assert.match(html, /<pre class="example">\{\s+&quot;name&quot;: &quot;string&quot;,\s+&quot;friend&quot;: null,\s+&quot;kind&quot;: &quot;cat&quot;/);
  assert.match(html, /<input type="radio" name="tab1" id="tab1-1" checked>/);
});

test("spec text is escaped", () => {
  assert.match(renderOpenApi(parseOpenApi(SPEC)!), /Pets &lt;b&gt;/);
});
