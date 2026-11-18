import test from "node:test";
import assert from "node:assert/strict";
import { insertVariable, indentJson } from "../../src/lab/insert-variable.ts";
import { compile, blank, newVariable } from "../../src/lab/model.ts";
test("successive insertions make object properties and recover the screenshot draft", () => {
  let result = insertVariable("{\n\n}", "reference", 1, 1, "json");
  result = insertVariable(
    result.body,
    "variable2",
    result.cursor,
    result.cursor,
    "json",
  );
  const expected = { reference: "{{reference}}", variable2: "{{variable2}}" };
  assert.deepEqual(JSON.parse(result.body), expected);
  assert.deepEqual(
    JSON.parse(indentJson('{"{{reference}}""{{variable2}}"\n}')),
    expected,
  );
  assert.deepEqual(
    JSON.parse(insertVariable('{"a":[]}', "n", 6, 6, "json").body),
    { a: ["{{n}}"] },
  );
  assert.equal(
    insertVariable('{"a":null}', "n", 5, 9, "json").body,
    '{"a":"{{n}}"}',
  );
  assert.throws(() => insertVariable('{"broken"', "n", 1, 1, "json"));
});
test("both XML types preserve structure, escape attributes/text and reject malformed XML", () => {
  for (const contentType of ["application/xml", "text/xml"]) {
    const draft = {
      ...blank("QA"),
      name: "Flux",
      contentType,
      variables: [
        { ...newVariable(), type: "string", mode: "fixed", value: 'a<&"' },
      ],
      body: '<r a="{{reference}}">{{reference}}</r>',
    };
    assert.equal(
      compile(draft).body,
      '<r a="a&lt;&amp;&quot;">a&lt;&amp;&quot;</r>',
    );
    for (const body of [
      "<r>",
      "<!DOCTYPE r><r/>",
      "<r>{{missing}}</r>",
      "<{{reference}}/>",
    ])
      assert.throws(() => compile({ ...draft, body }));
  }
});
