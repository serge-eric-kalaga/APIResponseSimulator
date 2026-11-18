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
