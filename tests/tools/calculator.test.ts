import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluate, formatNumber, plainNumber } from "../../src/tools/calculator.ts";

const calc = (q: string) => {
  const v = evaluate(q);
  return v === null ? null : formatNumber(v);
};

test("basic arithmetic and precedence", () => {
  assert.equal(calc("2+2"), "4");
  assert.equal(calc("2 + 2 * 3"), "8");
  assert.equal(calc("(1+2)^2"), "9");
  assert.equal(calc("2^10"), "1 024");
  assert.equal(calc("10-2-3"), "5");
  assert.equal(calc("1-2"), "-1");
  assert.equal(calc("-5+3="), "-2");
  assert.equal(calc("10/3"), "3.33333333333");
});

test("percent works like a pocket calculator", () => {
  assert.equal(calc("200+15%"), "230");
  assert.equal(calc("100-7%"), "93");
  assert.equal(calc("15% * 200"), "30");
  assert.equal(calc("50%"), "0.5");
});

test("functions, constants, factorial, implicit multiplication", () => {
  assert.equal(calc("sqrt(16)"), "4");
  assert.equal(calc("sqrt 2"), "1.41421356237");
  assert.equal(calc("sin(pi/2)"), "1");
  assert.equal(calc("5!"), "120");
  assert.equal(calc("2(3+4)"), "14");
  assert.equal(calc("exp(1)"), "2.71828182846");
});

test("alternative notations", () => {
  assert.equal(calc("3x4"), "12");
  assert.equal(calc("3 х 4"), "12"); // Cyrillic х
  assert.equal(calc("6 ÷ 2"), "3");
  assert.equal(calc("0,1+0,2"), "0.3");
  assert.equal(calc("1e3*2"), "2 000");
});

test("plain text and numbers stay a search", () => {
  for (const q of ["2024", "hello", "how to change oil", "ios 17", "a+b", "12:30", "2/0", "", "exp", "5!!!!"]) {
    assert.equal(evaluate(q), null, q);
  }
});

test("clipboard value has no separators or float noise", () => {
  assert.equal(plainNumber(1024), "1024");
  assert.equal(plainNumber(0.1 + 0.2), "0.3");
});
