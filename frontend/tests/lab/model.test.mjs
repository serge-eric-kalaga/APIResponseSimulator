import test from "node:test";
import assert from "node:assert/strict";
import { blank, compile, newVariable } from "../../src/lab/model.ts";
const base = () => ({ ...blank("QA"), name: "Validation" });
test("typed snapshot shared across response, interpolations and webhook", () => {
  const d = {
    ...base(),
    variables: [
      newVariable(),
      {
        ...newVariable(),
        name: "n",
        type: "integer",
        mode: "fixed",
        value: "3",
      },
    ],
    body: '{"id":"{{reference}}","n":"{{n}}","label":"n={{n}}"}',
    webhook: true,
    destination: "qa",
    hookBody: '{"id":"{{reference}}"}',
  };
  const r = compile(d),
    body = JSON.parse(r.body);
  assert.equal(body.n, 3);
  assert.equal(body.label, "n=3");
  assert.equal(body.id, JSON.parse(r.hook.body).id);
  assert.match(body.id, /^[0-9a-f-]{36}$/);
});
test("input defaults only apply when absent and preserve the type", () => {
  const d = {
    ...base(),
    variables: [
      {
        ...newVariable(),
        type: "boolean",
        mode: "input",
        source: "ready",
        value: "false",
      },
    ],
  };
  assert.equal(compile(d).variables.reference, false);
  assert.equal(compile(d, { ready: true }).variables.reference, true);
  assert.throws(() => compile(d, { ready: "true" }));
});
test("empty responses, headers, syntax, generator bounds and delay", () => {
  assert.equal(compile({ ...base(), noBody: true, status: 204 }).body, null);
  for (const edit of [
    { status: 204 },
    { name: "" },
    { path: "/../x" },
    { headers: '{"Set-Cookie":"a=b"}' },
    { body: "{" },
    { body: '"{{missing}}"' },
    { webhook: true, destination: "qa", delay: -1 },
    { variables: [{ ...newVariable(), type: "integer", min: 5, max: 4 }] },
  ])
    assert.throws(() => compile({ ...base(), ...edit }));
  const result = compile({
    ...base(),
    variables: [
      {
        ...newVariable(),
        type: "string",
        length: 3,
        prefix: "R-",
        alphabet: "x",
      },
    ],
  });
  assert.equal(result.variables.reference, "R-xxx");
});
test("inclusive integer bounds, decimal/null/UUID constants and escaped text", () => {
  const d = {
    ...base(),
    variables: [
      { ...newVariable(), name: "limit", type: "integer", min: -2, max: -2 },
      {
        ...newVariable(),
        name: "price",
        type: "decimal",
        mode: "fixed",
        value: "12.5",
      },
      {
        ...newVariable(),
        name: "ref",
        mode: "fixed",
        value: "a69e86db-4174-440e-a3ef-2cd27b499fab",
      },
      {
        ...newVariable(),
        name: "absent",
        type: "null",
        mode: "fixed",
        value: "null",
      },
      {
        ...newVariable(),
        name: "text",
        type: "string",
        mode: "fixed",
        value: 'a"b\\c',
      },
    ],
    body: '["{{limit}}","{{price}}","{{absent}}","id={{ref}}","ref={{text}}"]',
  };
  assert.deepEqual(JSON.parse(compile(d).body), [
    -2,
    12.5,
    null,
    "id=a69e86db-4174-440e-a3ef-2cd27b499fab",
    'ref=a"b\\c',
  ]);
  assert.deepEqual(
    compile({ ...d, contentType: "text/plain", body: "valeur {{limit}}" }).body,
    "valeur -2",
  );
});
