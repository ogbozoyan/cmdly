/**
 * Safe calculator — a small recursive-descent parser, no eval().
 *
 * Grammar (lowest to highest precedence):
 *   expr    = term (("+" | "-") term)*          "200 + 15%" means 200 * 1.15
 *   term    = unary (("*" | "/") unary | unary)*  second form is implicit multiplication: 2(3+4)
 *   unary   = ("-" | "+") unary | power
 *   power   = postfix ("^" unary)?              right-associative
 *   postfix = primary ("%" | "!")*
 *   primary = number | constant | function primary | "(" expr ")"
 */

const FUNCTIONS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  log: Math.log10, lg: Math.log10, ln: Math.log, exp: Math.exp,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, "π": Math.PI, e: Math.E };

const HAS_OPERATOR = new RegExp(
  String.raw`[-+*/^%!×÷()]|\d\s*[xх]\s*\d|\b(${Object.keys(FUNCTIONS).join("|")})\b`,
  "i"
);

/** num = 12.5, id = function or constant name, op = one of + - * / ^ % ! ( ) */
type Token = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

class ParseError extends Error {}

/** Returns the numeric result, or null if the text is not a math expression (then it stays a search). */
export function evaluate(input: string): number | null {
  const text = input.trim().replace(/=$/, "").trim();
  // Needs a digit and an operator/function: plain "2024" or "ios 17" must stay a search.
  if (!/\d|π|pi/.test(text) || !HAS_OPERATOR.test(text)) return null;
  const tokens = tokenize(text);
  if (!tokens?.length) return null;
  try {
    const value = new Parser(tokens).parse();
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** "1024" → "1 024", 1/3 → "0.333333333333". */
export function formatNumber(v: number): string {
  if (Number.isInteger(v) && Math.abs(v) < 1e21) return v.toLocaleString("en-US").replace(/,/g, " ");
  const r = parseFloat(v.toPrecision(12));
  return Math.abs(r) >= 1e21 || (Math.abs(r) < 1e-6 && r !== 0) ? r.toExponential(6) : String(r);
}

/** Value suitable for the clipboard: no thousands separators, no float noise. */
export function plainNumber(v: number): string {
  return String(parseFloat(v.toPrecision(12)));
}

function tokenize(src: string): Token[] | null {
  const s = src
    .toLowerCase()
    .replace(/×/g, "*")
    .replace(/([\d)])\s*[xх]\s*(?=[\d(])/g, "$1*") // 3x4, 3 х 4 (Cyrillic)
    .replace(/÷/g, "/")
    .replace(/[−–]/g, "-")
    .replace(/\*\*/g, "^")
    .replace(/(\d),(\d)/g, "$1.$2"); // 0,5 → 0.5
  const tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    if (/^\s/.test(rest)) { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(rest);
    if (num) { tokens.push({ t: "num", v: parseFloat(num[0]) }); i += num[0].length; continue; }
    const id = /^([a-z]+|π)/.exec(rest);
    if (id) { tokens.push({ t: "id", v: id[0] }); i += id[0].length; continue; }
    if ("+-*/^%!()".includes(s[i])) { tokens.push({ t: "op", v: s[i] }); i++; continue; }
    return null;
  }
  return tokens;
}

class Parser {
  private pos = 0;
  private readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): number {
    const v = this.expr();
    if (this.pos !== this.tokens.length) throw new ParseError();
    return v;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private isOp(token: Token | undefined, op: string): boolean {
    return token?.t === "op" && token.v === op;
  }

  /** Consumes the operator if it is next. */
  private eat(op: string): boolean {
    if (!this.isOp(this.peek(), op)) return false;
    this.pos++;
    return true;
  }

  private expr(): number {
    let v = this.term();
    for (;;) {
      const sign = this.eat("+") ? 1 : this.eat("-") ? -1 : 0;
      if (!sign) return v;
      const t = this.term();
      const endsWithPercent = this.isOp(this.tokens[this.pos - 1], "%");
      v = endsWithPercent ? v * (1 + sign * t) : v + sign * t;
    }
  }

  private term(): number {
    let v = this.unary();
    for (;;) {
      if (this.eat("*")) v *= this.unary();
      else if (this.eat("/")) v /= this.unary();
      else if (this.startsOperand(this.peek())) v *= this.unary();
      else return v;
    }
  }

  private startsOperand(token: Token | undefined): boolean {
    return token?.t === "num" || token?.t === "id" || this.isOp(token, "(");
  }

  private unary(): number {
    if (this.eat("-")) return -this.unary();
    if (this.eat("+")) return this.unary();
    return this.power();
  }

  private power(): number {
    const base = this.postfix();
    return this.eat("^") ? Math.pow(base, this.unary()) : base;
  }

  private postfix(): number {
    let v = this.primary();
    for (;;) {
      if (this.eat("%")) v /= 100;
      else if (this.eat("!")) v = factorial(v);
      else return v;
    }
  }

  private primary(): number {
    const tok = this.tokens[this.pos++];
    if (!tok) throw new ParseError();
    if (tok.t === "num") return tok.v;
    if (this.isOp(tok, "(")) {
      const v = this.expr();
      if (!this.eat(")")) throw new ParseError();
      return v;
    }
    if (tok.t === "id") {
      const name = tok.v;
      if (name in CONSTANTS) return CONSTANTS[name];
      if (name in FUNCTIONS) {
        const arg = this.isOp(this.peek(), "(") ? this.primary() : this.power();
        return FUNCTIONS[name](arg);
      }
    }
    throw new ParseError();
  }
}

function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n) || n > 170) throw new ParseError();
  let r = 1;
  for (let k = 2; k <= n; k++) r *= k;
  return r;
}
