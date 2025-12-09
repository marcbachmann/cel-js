import {UnsignedInt} from './functions.js'
import {ParseError} from './errors.js'

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

export class ASTNode extends Array {
  #pos
  #input
  constructor(pos, input, elems) {
    super(elems.length)
    this.#pos = pos
    this.#input = input
    /* eslint-disable no-fallthrough */
    switch (elems.length) {
      case 4:
        this[3] = elems[3]
      case 3:
        this[2] = elems[2]
      case 2:
        this[1] = elems[1]
      case 1:
        this[0] = elems[0]
        break
      default:
        throw new Error('Invalid number of elements for ASTNode')
    }
    /* eslint-enable no-fallthrough */
  }

  get input() {
    return this.#input
  }

  get pos() {
    return this.#pos
  }
}

const TOKEN_BY_NUMBER = {}
for (const key in TOKEN) TOKEN_BY_NUMBER[TOKEN[key]] = key

const RESERVED = new Set([
  'as',
  'break',
  'const',
  'continue',
  'else',
  'for',
  'function',
  'if',
  'import',
  'let',
  'loop',
  'package',
  'namespace',
  'return',
  'var',
  'void',
  'while'
])

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

class Lexer {
  constructor(input) {
    this.input = input
    this.pos = 0
    this.length = input.length
  }

  // Read next token
  nextToken() {
    const {pos, input, length} = this
    if (pos >= length) return {type: TOKEN.EOF, value: null, pos}

    const ch = input[pos]
    const next = input[pos + 1]

    switch (ch) {
      // Whitespaces
      case ' ':
      case '\t':
      case '\n':
      case '\r':
        this.pos++
        return this.nextToken()

      // Operators
      case '=':
        if (next !== '=') break
        return {type: TOKEN.EQ, value: '==', pos: (this.pos += 2) - 2}
      case '&':
        if (next !== '&') break
        return {type: TOKEN.AND, value: '&&', pos: (this.pos += 2) - 2}
      case '|':
        if (next !== '|') break
        return {type: TOKEN.OR, value: '||', pos: (this.pos += 2) - 2}
      case '+':
        return {type: TOKEN.PLUS, value: '+', pos: this.pos++}
      case '-':
        return {type: TOKEN.MINUS, value: '-', pos: this.pos++}
      case '*':
        return {type: TOKEN.MULTIPLY, value: '*', pos: this.pos++}
      case '/':
        // Skip comment
        if (next === '/') {
          while (this.pos < length && this.input[this.pos] !== '\n') this.pos++
          return this.nextToken()
        }
        return {type: TOKEN.DIVIDE, value: '/', pos: this.pos++}
      case '%':
        return {type: TOKEN.MODULO, value: '%', pos: this.pos++}
      case '<':
        if (next === '=') return {type: TOKEN.LE, value: '<=', pos: (this.pos += 2) - 2}
        return {type: TOKEN.LT, value: '<', pos: this.pos++}
      case '>':
        if (next === '=') return {type: TOKEN.GE, value: '>=', pos: (this.pos += 2) - 2}
        return {type: TOKEN.GT, value: '>', pos: this.pos++}
      case '!':
        if (next === '=') return {type: TOKEN.NE, value: '!=', pos: (this.pos += 2) - 2}
        return {type: TOKEN.NOT, value: '!', pos: this.pos++}
      case '(':
        return {type: TOKEN.LPAREN, value: '(', pos: this.pos++}
      case ')':
        return {type: TOKEN.RPAREN, value: ')', pos: this.pos++}
      case '[':
        return {type: TOKEN.LBRACKET, value: '[', pos: this.pos++}
      case ']':
        return {type: TOKEN.RBRACKET, value: ']', pos: this.pos++}
      case '{':
        return {type: TOKEN.LBRACE, value: '{', pos: this.pos++}
      case '}':
        return {type: TOKEN.RBRACE, value: '}', pos: this.pos++}
      case '.':
        return {type: TOKEN.DOT, value: '.', pos: this.pos++}
      case ',':
        return {type: TOKEN.COMMA, value: ',', pos: this.pos++}
      case ':':
        return {type: TOKEN.COLON, value: ':', pos: this.pos++}
      case '?':
        return {type: TOKEN.QUESTION, value: '?', pos: this.pos++}

      case `"`:
      case `'`:
        return this.readString(ch)

      // Check for string prefixes (b, B, r, R followed by quote)
      case 'b':
      case 'B':
      case 'r':
      case 'R':
        // This is a prefixed string, advance past the prefix and read string
        if (next === '"' || next === "'") return ++this.pos && this.readString(next, ch)
        return this.readIdentifier()
      default: {
        const code = ch.charCodeAt(0)
        if (code <= 57 && code >= 48) return this.readNumber()
        if (this._isIdentifierCharCode(code)) return this.readIdentifier()
      }
    }

    throw new ParseError(`Unexpected character: ${ch}`, {pos, input})
  }

  // Characters: 0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_
  _isIdentifierCharCode(c) {
    if (c < 48 || c > 122) return false
    return c >= 97 || (c >= 65 && c <= 90) || c <= 57 || c === 95
  }

  _parseAsDouble(start, end) {
    const value = Number(this.input.substring(start, end))
    if (Number.isFinite(value)) return {type: TOKEN.NUMBER, value, pos: start}
    throw new ParseError(`Invalid number: ${value}`, {pos: start, input: this.input})
  }

  _parseAsBigInt(start, end, isHex, unsigned) {
    const string = this.input.substring(start, end)
    if (unsigned === 'u' || unsigned === 'U') {
      this.pos++
      try {
        return {
          type: TOKEN.NUMBER,
          value: new UnsignedInt(string),
          pos: start
        }
      } catch (_err) {}
    } else {
      try {
        return {
          type: TOKEN.NUMBER,
          value: BigInt(string),
          pos: start
        }
      } catch (_err) {}
    }

    throw new ParseError(isHex ? `Invalid hex integer: ${string}` : `Invalid integer: ${string}`, {
      pos: start,
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
      if (start === pos) throw new ParseError('Invalid exponent', {pos, input})
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

  _closeQuotedString(rawValue, prefix) {
    switch (prefix) {
      case 'b':
      case 'B': {
        const processed = this.processEscapes(rawValue, true)
        const bytes = new Uint8Array(processed.length)
        for (let i = 0; i < processed.length; i++) bytes[i] = processed.charCodeAt(i) & 0xff
        return {type: TOKEN.BYTES, value: bytes, pos: this.pos - rawValue.length - 2}
      }
      case 'r':
      case 'R': {
        return {type: TOKEN.STRING, value: rawValue, pos: this.pos - rawValue.length}
      }
      default: {
        const value = this.processEscapes(rawValue, false)
        return {type: TOKEN.STRING, value, pos: this.pos - rawValue.length}
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
          return this._closeQuotedString(rawValue, prefix)
        case '\n':
        case '\r':
          throw new ParseError('Newlines not allowed in single-quoted strings', {pos: start, input})
        case '\\':
          pos++
      }
      pos++
    }
    throw new ParseError('Unterminated string', {pos: start, input})
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
            return this._closeQuotedString(rawValue, prefix)
          }
          break
        case '\\':
          pos++
      }
      pos++
    }
    throw new ParseError('Unterminated triple-quoted string', {pos: start, input})
  }

  processEscapes(str, isBytes) {
    if (!str.includes('\\')) return str

    let result = ''
    let i = 0
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
        if (isBytes) throw new ParseError('\\u not allowed in bytes literals')
        const hex = str.substring(i + 2, i + 6)
        if (hex.length !== 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) {
          throw new ParseError(`Invalid Unicode escape: \\u${hex}`)
        }
        const code = Number.parseInt(hex, 16)
        if (code >= 0xd800 && code <= 0xdfff) {
          throw new ParseError(`Invalid Unicode surrogate: \\u${hex}`)
        }
        result += String.fromCharCode(code)
        i += 6
      } else if (next === 'U') {
        if (isBytes) throw new ParseError('\\U not allowed in bytes literals')
        const hex = str.substring(i + 2, i + 10)
        if (hex.length !== 8 || !/^[0-9a-fA-F]{8}$/.test(hex)) {
          throw new ParseError(`Invalid Unicode escape: \\U${hex}`)
        }
        const code = Number.parseInt(hex, 16)
        if (code > 0x10ffff) throw new ParseError(`Invalid Unicode escape: \\U${hex}`)
        if (code >= 0xd800 && code <= 0xdfff) {
          throw new ParseError(`Invalid Unicode surrogate: \\U${hex}`)
        }
        result += String.fromCodePoint(code)
        i += 10
      } else if (next === 'x' || next === 'X') {
        const hex = str.substring(i + 2, i + 4)
        if (hex.length !== 2 || !/^[0-9a-fA-F]{2}$/.test(hex)) {
          throw new ParseError(`Invalid hex escape: \\${next}${hex}`)
        }
        result += String.fromCharCode(Number.parseInt(hex, 16))
        i += 4
      } else if (next >= '0' && next <= '7') {
        const octal = str.substring(i + 1, i + 4)
        if (octal.length !== 3 || !/^[0-7]{3}$/.test(octal)) {
          throw new ParseError('Octal escape must be 3 digits')
        }
        const value = Number.parseInt(octal, 8)
        if (value > 0xff) {
          throw new ParseError(`Octal escape out of range: \\${octal}`)
        }
        result += String.fromCharCode(value)
        i += 4
      } else {
        throw new ParseError(`Invalid escape sequence: \\${next}`)
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
        return {type: TOKEN.BOOLEAN, value: true, pos}
      case 'false':
        return {type: TOKEN.BOOLEAN, value: false, pos}
      case 'null':
        return {type: TOKEN.NULL, value: null, pos}
      case 'in':
        return {type: TOKEN.IN, value: 'in', pos}
      default:
        return {type: TOKEN.IDENTIFIER, value, pos}
    }
  }
}

export class Parser {
  constructor(limits, registry) {
    this.limits = limits
    this.registry = registry
  }

  #limitExceeded(limitKey, source = this.currentToken) {
    throw new ParseError(`Exceeded ${limitKey} (${this.limits[limitKey]})`, {
      pos: source.pos,
      input: this.input
    })
  }

  #node(pos, elements) {
    const node = new ASTNode(pos, this.input, elements)
    if (!this.astNodesRemaining--) this.#limitExceeded('maxAstNodes', node)
    return node
  }

  #advanceToken() {
    const prev = this.currentToken
    this.type = (this.currentToken = this.lexer.nextToken()).type
    return prev
  }

  consume(expectedType) {
    if (this.type === expectedType) return this.#advanceToken()
    throw new ParseError(
      `Expected ${TOKEN_BY_NUMBER[expectedType]}, got ${TOKEN_BY_NUMBER[this.type]}`,
      {pos: this.currentToken.pos, input: this.input}
    )
  }

  match(type) {
    return this.type === type
  }

  // Parse entry point
  parse(input) {
    this.input = input
    this.lexer = new Lexer(input)
    this.#advanceToken()
    this.maxDepthRemaining = this.limits.maxDepth
    this.astNodesRemaining = this.limits.maxAstNodes

    const result = this.parseExpression()
    if (this.match(TOKEN.EOF)) return result

    throw new ParseError(`Unexpected character: '${this.input[this.lexer.pos - 1]}'`, {
      pos: this.currentToken.pos,
      input: this.input
    })
  }

  #expandCallMacro(ast) {
    const [, methodName, args] = ast
    const decl = this.registry.findMacro(methodName, false, args.length)
    if (decl) ast.macro = decl.handler({ast, args, receiver: null, methodName})
    return ast
  }

  #expandReceiverMacro(ast) {
    const [, methodName, receiver, args] = ast
    const decl = this.registry.findMacro(methodName, true, args.length)
    if (decl) ast.macro = decl.handler({ast, args, receiver, methodName})
    return ast
  }

  // Expression ::= LogicalOr ('?' Expression ':' Expression)?  // Made right-associative
  parseExpression() {
    if (!this.maxDepthRemaining--) this.#limitExceeded('maxDepth')
    const expr = this.parseLogicalOr()
    if (!this.match(TOKEN.QUESTION)) return ++this.maxDepthRemaining && expr

    const question = this.#advanceToken()
    const consequent = this.parseExpression()
    this.consume(TOKEN.COLON)
    const alternate = this.parseExpression()
    this.maxDepthRemaining++
    return this.#node(question.pos, ['?:', expr, consequent, alternate])
  }

  // LogicalOr ::= LogicalAnd ('||' LogicalAnd)*
  parseLogicalOr() {
    let expr = this.parseLogicalAnd()
    while (this.match(TOKEN.OR)) {
      const t = this.#advanceToken()
      expr = this.#node(t.pos, [t.value, expr, this.parseLogicalAnd()])
    }
    return expr
  }

  // LogicalAnd ::= Equality ('&&' Equality)*
  parseLogicalAnd() {
    let expr = this.parseEquality()
    while (this.match(TOKEN.AND)) {
      const t = this.#advanceToken()
      expr = this.#node(t.pos, [t.value, expr, this.parseEquality()])
    }
    return expr
  }

  // Equality ::= Relational (('==' | '!=') Relational)*
  parseEquality() {
    let expr = this.parseRelational()
    while (this.match(TOKEN.EQ) || this.match(TOKEN.NE)) {
      const t = this.#advanceToken()
      expr = this.#node(t.pos, [t.value, expr, this.parseRelational()])
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
      const t = this.#advanceToken()
      expr = this.#node(t.pos, [t.value, expr, this.parseAdditive()])
    }
    return expr
  }

  // Additive ::= Multiplicative (('+' | '-') Multiplicative)*
  parseAdditive() {
    let expr = this.parseMultiplicative()
    while (this.match(TOKEN.PLUS) || this.match(TOKEN.MINUS)) {
      const t = this.#advanceToken()
      expr = this.#node(t.pos, [t.value, expr, this.parseMultiplicative()])
    }
    return expr
  }

  // Multiplicative ::= Unary (('*' | '/' | '%') Unary)*
  parseMultiplicative() {
    let expr = this.parseUnary()
    while (this.match(TOKEN.MULTIPLY) || this.match(TOKEN.DIVIDE) || this.match(TOKEN.MODULO)) {
      const t = this.#advanceToken()
      expr = this.#node(t.pos, [t.value, expr, this.parseUnary()])
    }
    return expr
  }

  // Unary ::= ('!' | '-')* Postfix
  parseUnary() {
    if (this.type === TOKEN.NOT)
      return this.#node(this.#advanceToken().pos, ['!_', this.parseUnary()])
    if (this.type === TOKEN.MINUS)
      return this.#node(this.#advanceToken().pos, ['-_', this.parseUnary()])
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
        const property = this.consume(TOKEN.IDENTIFIER)

        // Check for method call
        if (this.match(TOKEN.LPAREN) && this.#advanceToken()) {
          const args = this.parseArgumentList()
          this.consume(TOKEN.RPAREN)
          expr = this.#expandReceiverMacro(
            this.#node(property.pos, ['rcall', property.value, expr, args])
          )
        } else {
          expr = this.#node(property.pos, ['.', expr, property.value])
        }
        continue
      }

      if (this.match(TOKEN.LBRACKET)) {
        const bracket = this.#advanceToken()
        if (!this.maxDepthRemaining--) this.#limitExceeded('maxDepth', bracket)
        const index = this.parseExpression()
        this.consume(TOKEN.RBRACKET)
        expr = this.#node(bracket.pos, ['[]', expr, index])
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
      pos: this.currentToken.pos,
      input: this.input
    })
  }

  #consumeLiteral() {
    const token = this.#advanceToken()
    return this.#node(token.pos, ['value', token.value])
  }

  #parseIdentifierPrimary() {
    const {value, pos} = this.consume(TOKEN.IDENTIFIER)
    if (RESERVED.has(value)) {
      throw new ParseError(`Reserved identifier: ${value}`, {
        pos: pos,
        input: this.input
      })
    }

    if (!this.match(TOKEN.LPAREN)) return this.#node(pos, ['id', value])
    this.#advanceToken()
    const args = this.parseArgumentList()
    this.consume(TOKEN.RPAREN)
    return this.#expandCallMacro(this.#node(pos, ['call', value, args]))
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
      if (!remainingElements--) this.#limitExceeded('maxListElements', elements.at(-1))
      while (this.match(TOKEN.COMMA)) {
        this.#advanceToken()
        if (this.match(TOKEN.RBRACKET)) break
        elements.push(this.parseExpression())
        if (!remainingElements--) this.#limitExceeded('maxListElements', elements.at(-1))
      }
    }

    this.consume(TOKEN.RBRACKET)
    return this.#node(token.pos, ['list', elements])
  }

  parseMap() {
    const token = this.consume(TOKEN.LBRACE)
    const props = []
    let remainingEntries = this.limits.maxMapEntries

    if (!this.match(TOKEN.RBRACE)) {
      props.push(this.parseProperty())
      if (!remainingEntries--) this.#limitExceeded('maxMapEntries', props.at(-1)[0])
      while (this.match(TOKEN.COMMA)) {
        this.#advanceToken()
        if (this.match(TOKEN.RBRACE)) break
        props.push(this.parseProperty())
        if (!remainingEntries--) this.#limitExceeded('maxMapEntries', props.at(-1)[0])
      }
    }

    this.consume(TOKEN.RBRACE)
    return this.#node(token.pos, ['map', props])
  }

  parseProperty() {
    return [this.parseExpression(), (this.consume(TOKEN.COLON), this.parseExpression())]
  }

  parseArgumentList() {
    const args = []
    let remainingArgs = this.limits.maxCallArguments

    if (!this.match(TOKEN.RPAREN)) {
      args.push(this.parseExpression())
      if (!remainingArgs--) this.#limitExceeded('maxCallArguments', args.at(-1))
      while (this.match(TOKEN.COMMA)) {
        this.#advanceToken()
        if (this.match(TOKEN.RPAREN)) break
        args.push(this.parseExpression())
        if (!remainingArgs--) this.#limitExceeded('maxCallArguments', args.at(-1))
      }
    }
    return args
  }
}
