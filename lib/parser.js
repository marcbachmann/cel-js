import {UnsignedInt} from './functions.js'
import {ParseError} from './errors.js'
import {OPERATORS as OPS} from './operators.js'
import {RESERVED, isAsync} from './globals.js'

const TOKEN = {
  EOF: 0,
  NUMBER: 1,
  STRING: 2,
  BOOLEAN: 3,
  NULL: 4,
  IDENTIFIER: 5,
  PLUS: 6,
  MINUS: 7,
  MULTIPLY: 8,
  DIVIDE: 9,
  MODULO: 10,
  EQ: 11,
  NE: 12,
  LT: 13,
  LE: 14,
  GT: 15,
  GE: 16,
  AND: 17,
  OR: 18,
  NOT: 19,
  IN: 20,
  LPAREN: 21,
  RPAREN: 22,
  LBRACKET: 23,
  RBRACKET: 24,
  LBRACE: 25,
  RBRACE: 26,
  DOT: 27,
  COMMA: 28,
  COLON: 29,
  QUESTION: 30,
  BYTES: 31
}

const OP_FOR_TOKEN = {
  [TOKEN.EQ]: OPS['=='],
  [TOKEN.PLUS]: OPS['+'],
  [TOKEN.MINUS]: OPS['-'],
  [TOKEN.MULTIPLY]: OPS['*'],
  [TOKEN.DIVIDE]: OPS['/'],
  [TOKEN.MODULO]: OPS['%'],
  [TOKEN.LE]: OPS['<='],
  [TOKEN.LT]: OPS['<'],
  [TOKEN.GE]: OPS['>='],
  [TOKEN.GT]: OPS['>'],
  [TOKEN.NE]: OPS['!='],
  [TOKEN.IN]: OPS['in']
}

const TOKEN_BY_NUMBER = {}
for (const key in TOKEN) TOKEN_BY_NUMBER[TOKEN[key]] = key

const HEX_CODES = new Uint8Array(128)
for (const ch of '0123456789abcdefABCDEF') HEX_CODES[ch.charCodeAt(0)] = 1

const STRING_ESCAPES = {
  '\\': '\\',
  '?': '?',
  '"': '"',
  "'": "'",
  '`': '`',
  a: '\x07',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v'
}

export class ASTNode {
  #meta
  constructor(input, pos, start, end, op, args) {
    this.#meta = {input, pos, start, end, evaluate: op.evaluate, check: op.check}
    this.op = op.name
    this.args = args
  }

  clone(op, args) {
    const meta = this.#meta
    return new ASTNode(meta.input, meta.pos, meta.start, meta.end, op, args)
  }

  get meta() {
    return this.#meta
  }

  #computeIsAsync() {
    const ast = this.#meta.alternate ?? this

    // prettier-ignore
    switch (ast.op) {
      case 'value': case 'id': case 'accuValue': case 'accuInc':
        return false
      case 'accuPush':
        return ast.args.maybeAsync
      case '!_': case '-_':
        if (ast.candidates?.async !== false) return true
        return ast.args.maybeAsync
      case '!=': case '==': case 'in': case '+': case '-': case '*':
      case '/': case '%': case '<': case '<=': case '>': case '>=':
        if (ast.candidates?.async !== false) return true
        return ast.args.some((a) => a.maybeAsync)
      case 'call': case 'rcall':
        if (ast.candidates?.async !== false) return true
        return (ast.receiverWithArgs || ast.args[1]).some((a) => a.maybeAsync)
      case 'comprehension':
        return ast.args.iterable.maybeAsync || ast.args.step.maybeAsync
      case '.': case '.?':
        return ast.args[0].maybeAsync
      case '?:': case 'list':
      case '[]': case '[?]':
          return ast.args.some((a) => a.maybeAsync)
      case '||': case '&&':
        return ast.args.some((a) => a.maybeAsync)
      case 'map':
        return ast.args.some((a) => a[0].maybeAsync || a[1].maybeAsync)
      default:
        return true
    }
  }

  /**
   * Check whether we can optimize away async calling
   * If no ast members includes a function, we can optimize the call
   * for which we want to return true here.
   * @returns {boolean}
   */
  get maybeAsync() {
    return (this.#meta.async ??= this.#computeIsAsync())
  }

  check(chk, ast, ctx) {
    const meta = this.#meta
    if (meta.alternate) return chk.check(meta.alternate, ctx)
    else if (meta.macro) return meta.macro.typeCheck(chk, meta.macro, ctx)
    return meta.check(chk, ast, ctx)
  }

  evaluate(ev, ast, ctx) {
    const meta = this.#meta
    if (meta.alternate) this.evaluate = this.#evaluateAlternate
    else if (meta.macro) this.evaluate = this.#evaluateMacro
    else this.evaluate = meta.evaluate
    return this.evaluate(ev, ast, ctx)
  }

  #evaluateAlternate(ev, ast, ctx) {
    return (ast = this.#meta.alternate).evaluate(ev, ast, ctx)
  }

  #evaluateMacro(ev, ast, ctx) {
    return (ast = this.#meta.macro).evaluate(ev, ast, ctx)
  }

  setMeta(key, value) {
    return ((this.#meta[key] = value), this)
  }

  get input() {
    return this.#meta.input
  }

  get pos() {
    return this.#meta.pos
  }

  get start() {
    return this.#meta.start
  }

  get end() {
    return this.#meta.end
  }

  get range() {
    return {start: this.#meta.start, end: this.#meta.end}
  }

  toOldStructure() {
    const args = Array.isArray(this.args) ? this.args : [this.args]
    return [this.op, ...args.map((a) => (a instanceof ASTNode ? a.toOldStructure() : a))]
  }
}

class Lexer {
  input
  pos
  length

  tokenPos
  tokenEnd
  tokenType
  tokenValue

  reset(input) {
    this.pos = 0
    this.input = input
    this.length = input.length
    return input
  }

  token(pos, type, value, end = this.pos) {
    this.tokenPos = pos
    this.tokenEnd = end
    this.tokenType = type
    this.tokenValue = value
    return this
  }

  // Read next token
  nextToken() {
    while (true) {
      const {pos, input, length} = this
      if (pos >= length) return this.token(pos, TOKEN.EOF)

      const ch = input[pos]
      switch (ch) {
        // Whitespaces
        case ' ':
        case '\t':
        case '\n':
        case '\r':
          this.pos++
          continue

        // Operators
        case '=':
          if (input[pos + 1] !== '=') break
          return this.token((this.pos += 2) - 2, TOKEN.EQ)
        case '&':
          if (input[pos + 1] !== '&') break
          return this.token((this.pos += 2) - 2, TOKEN.AND)
        case '|':
          if (input[pos + 1] !== '|') break
          return this.token((this.pos += 2) - 2, TOKEN.OR)
        case '+':
          return this.token(this.pos++, TOKEN.PLUS)
        case '-':
          return this.token(this.pos++, TOKEN.MINUS)
        case '*':
          return this.token(this.pos++, TOKEN.MULTIPLY)
        case '/':
          if (input[pos + 1] === '/') {
            while (this.pos < length && this.input[this.pos] !== '\n') this.pos++
            continue
          }
          return this.token(this.pos++, TOKEN.DIVIDE)
        case '%':
          return this.token(this.pos++, TOKEN.MODULO)
        case '<':
          if (input[pos + 1] === '=') return this.token((this.pos += 2) - 2, TOKEN.LE)
          return this.token(this.pos++, TOKEN.LT)
        case '>':
          if (input[pos + 1] === '=') return this.token((this.pos += 2) - 2, TOKEN.GE)
          return this.token(this.pos++, TOKEN.GT)
        case '!':
          if (input[pos + 1] === '=') return this.token((this.pos += 2) - 2, TOKEN.NE)
          return this.token(this.pos++, TOKEN.NOT)
        case '(':
          return this.token(this.pos++, TOKEN.LPAREN)
        case ')':
          return this.token(this.pos++, TOKEN.RPAREN)
        case '[':
          return this.token(this.pos++, TOKEN.LBRACKET)
        case ']':
          return this.token(this.pos++, TOKEN.RBRACKET)
        case '{':
          return this.token(this.pos++, TOKEN.LBRACE)
        case '}':
          return this.token(this.pos++, TOKEN.RBRACE)
        case '.':
          return this.token(this.pos++, TOKEN.DOT)
        case ',':
          return this.token(this.pos++, TOKEN.COMMA)
        case ':':
          return this.token(this.pos++, TOKEN.COLON)
        case '?':
          return this.token(this.pos++, TOKEN.QUESTION)
        case `"`:
        case `'`:
          return this.readString(ch)
        // Check for string prefixes (b, B, r, R followed by quote)
        case 'b':
        case 'B':
        case 'r':
        case 'R': {
          // This is a prefixed string, advance past the prefix and read string
          const next = input[pos + 1]
          if (next === '"' || next === "'") return ++this.pos && this.readString(next, ch)
          return this.readIdentifier()
        }
        default: {
          const code = ch.charCodeAt(0)
          if (code <= 57 && code >= 48) return this.readNumber()
          if (this._isIdentifierCharCode(code)) return this.readIdentifier()
        }
      }

      throw new ParseError(`Unexpected character: ${ch}`, {pos, start: pos, end: pos + 1, input})
    }
  }

  // Characters: 0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_
  _isIdentifierCharCode(c) {
    if (c < 48 || c > 122) return false
    return c >= 97 || (c >= 65 && c <= 90) || c <= 57 || c === 95
  }

  _parseAsDouble(start, end) {
    const value = Number(this.input.substring(start, end))
    if (Number.isFinite(value)) return this.token(start, TOKEN.NUMBER, value)
    throw new ParseError(`Invalid number: ${value}`, {
      pos: start,
      start,
      end,
      input: this.input
    })
  }

  _parseAsBigInt(start, end, isHex, unsigned) {
    const string = this.input.substring(start, end)
    if (unsigned === 'u' || unsigned === 'U') {
      this.pos++
      try {
        return this.token(start, TOKEN.NUMBER, new UnsignedInt(string))
      } catch (_err) {}
    } else {
      try {
        return this.token(start, TOKEN.NUMBER, BigInt(string))
      } catch (_err) {}
    }

    throw new ParseError(isHex ? `Invalid hex integer: ${string}` : `Invalid integer: ${string}`, {
      pos: start,
      start,
      end: this.pos,
      input: this.input
    })
  }

  _readDigits(input, length, pos, code) {
    while (pos < length && (code = input.charCodeAt(pos)) && !(code > 57 || code < 48)) pos++
    return pos
  }

  _readExponent(input, length, pos) {
    let ch = pos < length && input[pos]
    if (ch === 'e' || ch === 'E') {
      ch = ++pos < length && input[pos]
      if (ch === '-' || ch === '+') pos++
      const start = pos
      pos = this._readDigits(input, length, pos)
      if (start === pos)
        throw new ParseError('Invalid exponent', {
          pos,
          start: pos,
          end: Math.min(pos + 1, input.length),
          input
        })
    }
    return pos
  }

  readNumber() {
    const {input, length, pos: start} = this
    let pos = start
    if (input[pos] === '0' && (input[pos + 1] === 'x' || input[pos + 1] === 'X')) {
      pos += 2
      while (pos < length && HEX_CODES[input[pos].charCodeAt(0)]) pos++
      return this._parseAsBigInt(start, (this.pos = pos), true, input[pos])
    }

    pos = this._readDigits(input, length, pos)
    if (pos + 1 < length) {
      let isDouble = false
      let afterpos = input[pos] === '.' ? this._readDigits(input, length, pos + 1) : pos + 1
      if (afterpos !== pos + 1) (isDouble = true) && (pos = afterpos)

      afterpos = this._readExponent(input, length, pos)
      if (afterpos !== pos) (isDouble = true) && (pos = afterpos)
      if (isDouble) return this._parseAsDouble(start, (this.pos = pos))
    }
    return this._parseAsBigInt(start, (this.pos = pos), false, input[pos])
  }

  readString(del, prefix) {
    const {input: i, pos: s} = this
    if (i[s + 1] === del && i[s + 2] === del) return this.readTripleQuotedString(del, prefix)
    return this.readSingleQuotedString(del, prefix)
  }

  _closeQuotedString(rawValue, prefix, pos, rawStart) {
    switch (prefix) {
      case 'b':
      case 'B': {
        const processed = this.processEscapes(rawValue, true, rawStart)
        const bytes = new Uint8Array(processed.length)
        for (let i = 0; i < processed.length; i++) bytes[i] = processed.charCodeAt(i) & 0xff
        return this.token(pos - 1, TOKEN.BYTES, bytes)
      }
      case 'r':
      case 'R': {
        return this.token(pos - 1, TOKEN.STRING, rawValue)
      }
      default: {
        const value = this.processEscapes(rawValue, false, rawStart)
        return this.token(pos, TOKEN.STRING, value)
      }
    }
  }

  readSingleQuotedString(delimiter, prefix) {
    const {input, length, pos: start} = this

    let ch
    let pos = this.pos + 1
    while (pos < length && (ch = input[pos])) {
      switch (ch) {
        case delimiter:
          const rawValue = input.slice(start + 1, pos)
          this.pos = ++pos
          return this._closeQuotedString(rawValue, prefix, start, start + 1)
        case '\n':
        case '\r':
          throw new ParseError('Newlines not allowed in single-quoted strings', {
            pos,
            start: pos,
            end: pos + 1,
            input
          })
        case '\\':
          pos++
      }
      pos++
    }
    throw new ParseError('Unterminated string', {
      pos: start,
      start,
      end: input.length,
      input
    })
  }

  readTripleQuotedString(delimiter, prefix) {
    const {input, length, pos: start} = this

    let ch
    let pos = this.pos + 3
    while (pos < length && (ch = input[pos])) {
      switch (ch) {
        case delimiter:
          if (input[pos + 1] === delimiter && input[pos + 2] === delimiter) {
            const rawValue = input.slice(start + 3, pos)
            this.pos = pos + 3
            return this._closeQuotedString(rawValue, prefix, start, start + 3)
          }
          break
        case '\\':
          pos++
      }
      pos++
    }
    throw new ParseError('Unterminated triple-quoted string', {
      pos: start,
      start,
      end: input.length,
      input
    })
  }

  processEscapes(str, isBytes, offset) {
    if (!str.includes('\\')) return str

    const input = this.input
    const inputEnd = offset + str.length
    let result = ''
    let i = 0
    const fail = (message, start, end = start + 1) => {
      throw new ParseError(message, {input, pos: start, start, end: Math.min(end, inputEnd)})
    }
    while (i < str.length) {
      if (str[i] !== '\\' || i + 1 >= str.length) {
        result += str[i++]
        continue
      }

      const next = str[i + 1]
      if (STRING_ESCAPES[next]) {
        result += STRING_ESCAPES[next]
        i += 2
      } else if (next === 'u') {
        if (isBytes) fail('\\u not allowed in bytes literals', offset + i, offset + i + 2)
        const escapeStart = i
        i += 6
        const hex = str.substring(escapeStart + 2, i)
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          fail(`Invalid Unicode escape: \\u${hex}`, offset + escapeStart, offset + i)
        }
        const c = Number.parseInt(hex, 16)
        if (c >= 0xd800 && c <= 0xdfff) {
          fail(`Invalid Unicode surrogate: \\u${hex}`, offset + escapeStart, offset + i)
        }
        result += String.fromCharCode(c)
      } else if (next === 'U') {
        if (isBytes) fail('\\U not allowed in bytes literals', offset + i, offset + i + 2)
        const escapeStart = i
        i += 10
        const hex = str.substring(escapeStart + 2, i)
        if (!/^[0-9a-fA-F]{8}$/.test(hex)) {
          fail(`Invalid Unicode escape: \\U${hex}`, offset + escapeStart, offset + i)
        }
        const c = Number.parseInt(hex, 16)
        if (c > 0x10ffff) fail(`Invalid Unicode escape: \\U${hex}`, offset + escapeStart, offset + i)
        if (c >= 0xd800 && c <= 0xdfff) {
          fail(`Invalid Unicode surrogate: \\U${hex}`, offset + escapeStart, offset + i)
        }
        result += String.fromCodePoint(c)
      } else if (next === 'x' || next === 'X') {
        const escapeStart = i
        i += 4
        const h = str.substring(escapeStart + 2, i)
        if (!/^[0-9a-fA-F]{2}$/.test(h)) {
          fail(`Invalid hex escape: \\${next}${h}`, offset + escapeStart, offset + i)
        }
        result += String.fromCharCode(Number.parseInt(h, 16))
      } else if (next >= '0' && next <= '7') {
        const escapeStart = i
        i += 4
        const o = str.substring(escapeStart + 1, i)
        if (!/^[0-7]{3}$/.test(o)) {
          fail('Octal escape must be 3 digits', offset + escapeStart, offset + i)
        }
        const value = Number.parseInt(o, 8)
        if (value > 0xff) fail(`Octal escape out of range: \\${o}`, offset + escapeStart, offset + i)
        result += String.fromCharCode(value)
      } else {
        fail(`Invalid escape sequence: \\${next}`, offset + i, offset + i + 2)
      }
    }

    return result
  }

  readIdentifier() {
    const {pos, input, length} = this
    let p = pos
    while (p < length && this._isIdentifierCharCode(input[p].charCodeAt(0))) p++
    const value = input.substring(pos, (this.pos = p))
    switch (value) {
      case 'true':
        return this.token(pos, TOKEN.BOOLEAN, true)
      case 'false':
        return this.token(pos, TOKEN.BOOLEAN, false)
      case 'null':
        return this.token(pos, TOKEN.NULL, null)
      case 'in':
        return this.token(pos, TOKEN.IN)
      default:
        return this.token(pos, TOKEN.IDENTIFIER, value)
    }
  }
}

const globalLexer = new Lexer()
export class Parser {
  lexer = globalLexer
  input = null
  maxDepthRemaining = null
  astNodesRemaining = null

  type = null
  pos = null
  end = null

  constructor(limits, registry) {
    this.limits = limits
    this.registry = registry
  }

  #limitExceeded(limitKey, pos = this.pos) {
    throw new ParseError(`Exceeded ${limitKey} (${this.limits[limitKey]})`, {
      pos,
      start: pos,
      end: pos,
      input: this.input
    })
  }

  #node(pos, op, args, start = pos, end = start) {
    const node = new ASTNode(this.input, pos, start, end, op, args)
    if (!this.astNodesRemaining--) this.#limitExceeded('maxAstNodes', pos)
    return node
  }

  #advanceToken(returnValue = this.pos) {
    const l = this.lexer.nextToken()
    this.pos = l.tokenPos
    this.end = l.tokenEnd
    this.type = l.tokenType
    return returnValue
  }

  // The value of the current token is accessed less regularly,
  // so we use a getter to reduce assignment overhead
  get value() {
    return this.lexer.tokenValue
  }

  consume(expectedType) {
    if (this.type === expectedType) return this.#advanceToken()
    throw new ParseError(
      `Expected ${TOKEN_BY_NUMBER[expectedType]}, got ${TOKEN_BY_NUMBER[this.type]}`,
      {pos: this.pos, start: this.pos, end: this.end, input: this.input}
    )
  }

  match(type) {
    return this.type === type
  }

  // Parse entry point
  parse(input) {
    if (typeof input !== 'string') throw new ParseError('Expression must be a string')
    this.input = this.lexer.reset(input)
    this.#advanceToken()
    this.maxDepthRemaining = this.limits.maxDepth
    this.astNodesRemaining = this.limits.maxAstNodes

    const result = this.parseExpression()
    if (this.match(TOKEN.EOF)) return result

    throw new ParseError(`Unexpected character: '${this.input[this.lexer.pos - 1]}'`, {
      pos: this.pos,
      start: this.pos,
      end: this.end,
      input: this.input
    })
  }

  #expandMacro(pos, op, args, start = pos, end = start) {
    const [methodName, receiver, fnArgs] = op === OPS.rcall ? args : [args[0], null, args[1]]
    const decl = this.registry.findMacro(methodName, !!receiver, fnArgs.length)
    const ast = this.#node(pos, op, args, start, end)
    if (!decl) return ast
    const macro = decl.handler({ast, args: fnArgs, receiver, methodName, parser: this})
    if (macro.callAst) return ast.setMeta('alternate', macro.callAst)
    return ast.setMeta('macro', macro).setMeta('async', isAsync(macro.evaluate, macro.async))
  }

  // Expression ::= LogicalOr ('?' Expression ':' Expression)?
  parseExpression() {
    if (!this.maxDepthRemaining--) this.#limitExceeded('maxDepth')
    const expr = this.parseLogicalOr()
    if (!this.match(TOKEN.QUESTION)) return ++this.maxDepthRemaining && expr

    const questionPos = this.#advanceToken()
    const consequent = this.parseExpression()
    this.consume(TOKEN.COLON)
    const alternate = this.parseExpression()
    this.maxDepthRemaining++
    return this.#node(questionPos, OPS.ternary, [expr, consequent, alternate], expr.start, alternate.end)
  }

  // LogicalOr ::= LogicalAnd ('||' LogicalAnd)*
  parseLogicalOr() {
    let expr = this.parseLogicalAnd()
    while (this.match(TOKEN.OR)) {
      const opPos = this.#advanceToken()
      const right = this.parseLogicalAnd()
      expr = this.#node(opPos, OPS['||'], [expr, right], expr.start, right.end)
    }
    return expr
  }

  // LogicalAnd ::= Equality ('&&' Equality)*
  parseLogicalAnd() {
    let expr = this.parseEquality()
    while (this.match(TOKEN.AND)) {
      const opPos = this.#advanceToken()
      const right = this.parseEquality()
      expr = this.#node(opPos, OPS['&&'], [expr, right], expr.start, right.end)
    }
    return expr
  }

  // Equality ::= Relational (('==' | '!=') Relational)*
  parseEquality() {
    let expr = this.parseRelational()
    while (this.match(TOKEN.EQ) || this.match(TOKEN.NE)) {
      const op = OP_FOR_TOKEN[this.type]
      const opPos = this.#advanceToken()
      const right = this.parseRelational()
      expr = this.#node(opPos, op, [expr, right], expr.start, right.end)
    }
    return expr
  }

  // Relational ::= Additive (('<' | '<=' | '>' | '>=' | 'in') Additive)*
  parseRelational() {
    let expr = this.parseAdditive()
    while (
      this.match(TOKEN.LT) ||
      this.match(TOKEN.LE) ||
      this.match(TOKEN.GT) ||
      this.match(TOKEN.GE) ||
      this.match(TOKEN.IN)
    ) {
      const op = OP_FOR_TOKEN[this.type]
      const opPos = this.#advanceToken()
      const right = this.parseAdditive()
      expr = this.#node(opPos, op, [expr, right], expr.start, right.end)
    }
    return expr
  }

  // Additive ::= Multiplicative (('+' | '-') Multiplicative)*
  parseAdditive() {
    let expr = this.parseMultiplicative()
    while (this.match(TOKEN.PLUS) || this.match(TOKEN.MINUS)) {
      const op = OP_FOR_TOKEN[this.type]
      const opPos = this.#advanceToken()
      const right = this.parseMultiplicative()
      expr = this.#node(opPos, op, [expr, right], expr.start, right.end)
    }
    return expr
  }

  // Multiplicative ::= Unary (('*' | '/' | '%') Unary)*
  parseMultiplicative() {
    let expr = this.parseUnary()
    while (this.match(TOKEN.MULTIPLY) || this.match(TOKEN.DIVIDE) || this.match(TOKEN.MODULO)) {
      const op = OP_FOR_TOKEN[this.type]
      const opPos = this.#advanceToken()
      const right = this.parseUnary()
      expr = this.#node(opPos, op, [expr, right], expr.start, right.end)
    }
    return expr
  }

  // Unary ::= ('!' | '-')* Postfix
  parseUnary() {
    if (this.type === TOKEN.NOT) {
      const pos = this.#advanceToken()
      const arg = this.parseUnary()
      return this.#node(pos, OPS.unaryNot, arg, pos, arg.end)
    }
    if (this.type === TOKEN.MINUS) {
      const pos = this.#advanceToken()
      const arg = this.parseUnary()
      return this.#node(pos, OPS.unaryMinus, arg, pos, arg.end)
    }
    return this.parsePostfix()
  }

  // Postfix ::= Primary (('.' IDENTIFIER ('(' ArgumentList ')')? | '[' Expression ']'))*
  parsePostfix() {
    let expr = this.parsePrimary()
    const depth = this.maxDepthRemaining
    while (true) {
      if (this.match(TOKEN.DOT)) {
        const dot = this.#advanceToken()
        if (!this.maxDepthRemaining--) this.#limitExceeded('maxDepth', dot)

        const op =
          this.match(TOKEN.QUESTION) && this.registry.enableOptionalTypes && this.#advanceToken()
            ? OPS.optionalFieldAccess
            : OPS.fieldAccess

        const propertyValue = this.value
        const propertyPos = this.pos
        const propertyEnd = this.end
        this.consume(TOKEN.IDENTIFIER)
        if (op === OPS.fieldAccess && this.match(TOKEN.LPAREN) && this.#advanceToken()) {
          const args = this.parseArgumentList()
          const closeEnd = this.end
          this.consume(TOKEN.RPAREN)
          expr = this.#expandMacro(propertyPos, OPS.rcall, [propertyValue, expr, args], expr.start, closeEnd)
        } else {
          expr = this.#node(propertyPos, op, [expr, propertyValue], expr.start, propertyEnd)
        }
        continue
      }

      if (this.match(TOKEN.LBRACKET)) {
        const bracket = this.#advanceToken()
        if (!this.maxDepthRemaining--) this.#limitExceeded('maxDepth', bracket)

        const op =
          this.match(TOKEN.QUESTION) && this.registry.enableOptionalTypes && this.#advanceToken()
            ? OPS.optionalBracketAccess
            : OPS.bracketAccess

        const index = this.parseExpression()
        const closeEnd = this.end
        this.consume(TOKEN.RBRACKET)
        expr = this.#node(bracket, op, [expr, index], expr.start, closeEnd)
        continue
      }
      break
    }
    this.maxDepthRemaining = depth
    return expr
  }

  // Primary ::= NUMBER | STRING | BOOLEAN | NULL | IDENTIFIER | '(' Expression ')' | Array | Object
  parsePrimary() {
    switch (this.type) {
      case TOKEN.NUMBER:
      case TOKEN.STRING:
      case TOKEN.BYTES:
      case TOKEN.BOOLEAN:
      case TOKEN.NULL:
        return this.#consumeLiteral()
      case TOKEN.IDENTIFIER:
        return this.#parseIdentifierPrimary()
      case TOKEN.LPAREN:
        return this.#parseParenthesizedExpression()
      case TOKEN.LBRACKET:
        return this.parseList()
      case TOKEN.LBRACE:
        return this.parseMap()
    }

    throw new ParseError(`Unexpected token: ${TOKEN_BY_NUMBER[this.type]}`, {
      pos: this.pos,
      start: this.pos,
      end: this.end,
      input: this.input
    })
  }

  #consumeLiteral() {
    return this.#advanceToken(this.#node(this.pos, OPS.value, this.value, this.pos, this.end))
  }

  #parseIdentifierPrimary() {
    const value = this.value
    const pos = this.pos
    const end = this.end
    this.consume(TOKEN.IDENTIFIER)
    if (RESERVED.has(value)) {
      throw new ParseError(`Reserved identifier: ${value}`, {
        pos,
        start: pos,
        end,
        input: this.input
      })
    }

    if (!this.match(TOKEN.LPAREN)) return this.#node(pos, OPS.id, value, pos, end)
    this.#advanceToken()
    const args = this.parseArgumentList()
    const closeEnd = this.end
    this.consume(TOKEN.RPAREN)
    return this.#expandMacro(pos, OPS.call, [value, args], pos, closeEnd)
  }

  #parseParenthesizedExpression() {
    this.consume(TOKEN.LPAREN)
    const expr = this.parseExpression()
    this.consume(TOKEN.RPAREN)
    return expr
  }

  parseList() {
    const token = this.consume(TOKEN.LBRACKET)
    const elements = []
    let remainingElements = this.limits.maxListElements

    if (!this.match(TOKEN.RBRACKET)) {
      elements.push(this.parseExpression())
      if (!remainingElements--) this.#limitExceeded('maxListElements', elements.at(-1).pos)
      while (this.match(TOKEN.COMMA)) {
        this.#advanceToken()
        if (this.match(TOKEN.RBRACKET)) break
        elements.push(this.parseExpression())
        if (!remainingElements--) this.#limitExceeded('maxListElements', elements.at(-1).pos)
      }
    }

    const closeEnd = this.end
    this.consume(TOKEN.RBRACKET)
    return this.#node(token, OPS.list, elements, token, closeEnd)
  }

  parseMap() {
    const token = this.consume(TOKEN.LBRACE)
    const props = []
    let remainingEntries = this.limits.maxMapEntries

    if (!this.match(TOKEN.RBRACE)) {
      props.push(this.parseProperty())
      if (!remainingEntries--) this.#limitExceeded('maxMapEntries', props.at(-1)[0].pos)
      while (this.match(TOKEN.COMMA)) {
        this.#advanceToken()
        if (this.match(TOKEN.RBRACE)) break
        props.push(this.parseProperty())
        if (!remainingEntries--) this.#limitExceeded('maxMapEntries', props.at(-1)[0].pos)
      }
    }

    const closeEnd = this.end
    this.consume(TOKEN.RBRACE)
    return this.#node(token, OPS.map, props, token, closeEnd)
  }

  parseProperty() {
    return [this.parseExpression(), (this.consume(TOKEN.COLON), this.parseExpression())]
  }

  parseArgumentList() {
    const args = []
    let remainingArgs = this.limits.maxCallArguments

    if (!this.match(TOKEN.RPAREN)) {
      args.push(this.parseExpression())
      if (!remainingArgs--) this.#limitExceeded('maxCallArguments', args.at(-1).pos)
      while (this.match(TOKEN.COMMA)) {
        this.#advanceToken()
        if (this.match(TOKEN.RPAREN)) break
        args.push(this.parseExpression())
        if (!remainingArgs--) this.#limitExceeded('maxCallArguments', args.at(-1).pos)
      }
    }
    return args
  }
}
