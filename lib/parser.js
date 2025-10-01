import {UnsignedInt} from './functions.js'
import {EvaluationError, ParseError, nodePositionCache} from './errors.js'

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

const HEX_CODES = new Uint8Array(256)
for (const ch of '0123456789abcdefABCDEF') HEX_CODES[ch.charCodeAt(0)] = 1

const IDENTIFIER_CODES = new Uint8Array(256)
for (const ch of '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_') {
  IDENTIFIER_CODES[ch.charCodeAt(0)] = 1
}

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
    if (this.pos >= this.length) return {type: TOKEN.EOF, value: null, pos: this.pos}

    const ch = this.input[this.pos]
    const next = this.input[this.pos + 1]

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
          while (this.pos < this.length && this.input[this.pos] !== '\n') this.pos++
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
        return this.readString()

      // Check for string prefixes (b, B, r, R followed by quote)
      case 'b':
      case 'B':
      case 'r':
      case 'R':
        // This is a prefixed string, advance past the prefix and read string
        if (next === '"' || next === "'") {
          this.pos++
          return this.readString(ch.toLowerCase())
        }
        return this.readIdentifier()
      default: {
        // Numbers (including hex with 0x prefix)
        if (ch >= '0' && ch <= '9') return this.readNumber()

        // Identifiers and keywords
        if (IDENTIFIER_CODES[ch.charCodeAt(0)]) return this.readIdentifier()
      }
    }

    throw new ParseError(`Unexpected character: ${ch}`, {pos: this.pos, input: this.input})
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

    throw new EvaluationError(
      isHex ? `Invalid hex integer: ${string}` : `Invalid integer: ${string}`,
      {pos: start, input: this.input}
    )
  }

  readNumber() {
    const {input, length, pos: start} = this

    if (input[start] === '0' && (input[start + 1] === 'x' || input[start + 1] === 'X')) {
      this.pos += 2
      while (this.pos < length && HEX_CODES[input[this.pos].charCodeAt(0)]) this.pos++
      return this._parseAsBigInt(start, this.pos, true, input[this.pos])
    }

    let ch
    while (this.pos < length && (ch = input[this.pos]) >= '0' && ch <= '9') this.pos++

    if (ch === '.' && (ch = input[this.pos + 1]) >= '0' && ch <= '9') {
      this.pos++
      while (this.pos < length && (ch = input[this.pos]) >= '0' && ch <= '9') this.pos++
      const string = input.substring(start, this.pos)
      const value = Number(string)
      if (Number.isFinite(value)) return {type: TOKEN.NUMBER, value, pos: start}
      throw new EvaluationError(`Invalid number: ${value}`, {pos: start, input: this.input})
    }

    return this._parseAsBigInt(start, this.pos, false, input[this.pos])
  }

  readString(prefix) {
    const delimiter = this.input[this.pos++]

    // Check for triple quotes
    if (this.input[this.pos] === delimiter && this.input[this.pos + 1] === delimiter) {
      this.pos += 2 // Skip the next two quote characters
      return this.readTripleQuotedString(delimiter, prefix)
    }

    return this.readSingleQuotedString(delimiter, prefix)
  }

  _closeQuotedString(rawValue, prefix) {
    if (prefix === 'b') {
      // Process escapes and convert to Uint8Array
      const processed = this.processEscapes(rawValue, true)
      const bytes = new Uint8Array(processed.length)
      for (let i = 0; i < processed.length; i++) {
        bytes[i] = processed.charCodeAt(i) & 0xff
      }
      return {type: TOKEN.BYTES, value: bytes, pos: this.pos - rawValue.length - 2}
    }
    const value = prefix === 'r' ? rawValue : this.processEscapes(rawValue, false)
    return {type: TOKEN.STRING, value, pos: this.pos - rawValue.length}
  }

  readSingleQuotedString(delimiter, prefix) {
    const {input, length, pos: start} = this
    const needsEscapeHandling = prefix !== 'r'

    while (this.pos < length) {
      const ch = input[this.pos]

      // Check for closing delimiter
      if (ch === delimiter) {
        const rawValue = input.slice(start, this.pos)
        this.pos++
        return this._closeQuotedString(rawValue, prefix)
      }

      // No newlines allowed in single-quoted strings
      if (ch === '\n' || ch === '\r') {
        throw new EvaluationError('Newlines not allowed in single-quoted strings', {
          pos: start - 1,
          input
        })
      }

      // Handle escape sequences
      if (ch === '\\' && needsEscapeHandling) {
        this.pos += 2
        if (this.pos > length) {
          throw new EvaluationError('Unterminated escape sequence', {
            pos: start - 1,
            input
          })
        }
        continue
      }

      this.pos++
    }

    throw new EvaluationError('Unterminated string')
  }

  readTripleQuotedString(delimiter, prefix) {
    const start = this.pos
    const needsEscapeHandling = prefix !== 'r'

    while (this.pos < this.length) {
      const ch = this.input[this.pos]

      // Check for closing triple delimiter
      if (
        ch === delimiter &&
        this.input[this.pos + 1] === delimiter &&
        this.input[this.pos + 2] === delimiter
      ) {
        const rawValue = this.input.slice(start, this.pos)
        this.pos += 3 // Skip closing triple quotes
        return this._closeQuotedString(rawValue, prefix)
      }

      // Handle escape sequences
      if (ch === '\\' && needsEscapeHandling) {
        this.pos += 2 // Skip backslash and next char
        if (this.pos > this.length) {
          throw new EvaluationError('Unterminated escape sequence', {
            pos: start - 3,
            input: this.input
          })
        }
        continue
      }

      this.pos++
    }

    throw new EvaluationError('Unterminated triple-quoted string')
  }

  processEscapes(str, isBytes) {
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
    const start = this.pos

    while (this.pos < this.length && IDENTIFIER_CODES[this.input[this.pos].charCodeAt(0)])
      this.pos++

    const text = this.input.substring(start, this.pos)

    // Keywords
    switch (text) {
      case 'true':
        return {type: TOKEN.BOOLEAN, value: true, pos: start}
      case 'false':
        return {type: TOKEN.BOOLEAN, value: false, pos: start}
      case 'null':
        return {type: TOKEN.NULL, value: null, pos: start}
      case 'in':
        return {type: TOKEN.IN, value: 'in', pos: start}
      default:
        return {type: TOKEN.IDENTIFIER, value: text, pos: start}
    }
  }
}

export default class Parser {
  constructor(input) {
    this.lexer = new Lexer(input)
    this.currentToken = this.lexer.nextToken()
  }

  createNode(pos, node) {
    nodePositionCache.set(node, {pos, input: this.lexer.input})
    return node
  }

  consume(expectedType) {
    const token = this.currentToken
    this.currentToken = this.lexer.nextToken()
    if (token.type === expectedType) return token

    throw new ParseError(
      `Expected ${TOKEN_BY_NUMBER[expectedType]}, got ${TOKEN_BY_NUMBER[token.type]}`,
      {pos: token.pos, input: this.lexer.input}
    )
  }

  match(type) {
    return this.currentToken.type === type
  }

  // Parse entry point
  parse() {
    const result = this.parseExpression()
    if (!this.match(TOKEN.EOF)) {
      throw new ParseError(`Unexpected character: '${this.lexer.input[this.lexer.pos - 1]}'`, {
        pos: this.currentToken.pos,
        input: this.lexer.input
      })
    }
    return result
  }

  // Expression ::= LogicalOr ('?' Expression ':' Expression)?  // Made right-associative
  parseExpression() {
    const expr = this.parseLogicalOr()

    if (this.match(TOKEN.QUESTION)) {
      const token = this.consume(TOKEN.QUESTION)
      const consequent = this.parseExpression()
      this.consume(TOKEN.COLON)
      return this.createNode(token.pos, ['?:', expr, consequent, this.parseExpression()])
    }

    return expr
  }

  // LogicalOr ::= LogicalAnd ('||' LogicalAnd)*
  parseLogicalOr() {
    let expr = this.parseLogicalAnd()

    while (this.match(TOKEN.OR)) {
      const token = this.consume(TOKEN.OR)
      expr = this.createNode(token.pos, [token.value, expr, this.parseLogicalAnd()])
    }

    return expr
  }

  // LogicalAnd ::= Equality ('&&' Equality)*
  parseLogicalAnd() {
    let expr = this.parseEquality()

    while (this.match(TOKEN.AND)) {
      const token = this.consume(TOKEN.AND)
      expr = this.createNode(token.pos, [token.value, expr, this.parseEquality()])
    }

    return expr
  }

  // Equality ::= Relational (('==' | '!=') Relational)*
  parseEquality() {
    let expr = this.parseRelational()

    while (this.match(TOKEN.EQ) || this.match(TOKEN.NE)) {
      const token = this.currentToken
      this.currentToken = this.lexer.nextToken()
      expr = this.createNode(token.pos, [token.value, expr, this.parseRelational()])
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
      const token = this.currentToken
      this.currentToken = this.lexer.nextToken()
      expr = this.createNode(token.pos, [token.value, expr, this.parseAdditive()])
    }

    return expr
  }

  // Additive ::= Multiplicative (('+' | '-') Multiplicative)*
  parseAdditive() {
    let expr = this.parseMultiplicative()

    while (this.match(TOKEN.PLUS) || this.match(TOKEN.MINUS)) {
      const token = this.currentToken
      this.currentToken = this.lexer.nextToken()
      expr = this.createNode(token.pos, [token.value, expr, this.parseMultiplicative()])
    }

    return expr
  }

  // Multiplicative ::= Unary (('*' | '/' | '%') Unary)*
  parseMultiplicative() {
    let expr = this.parseUnary()

    while (this.match(TOKEN.MULTIPLY) || this.match(TOKEN.DIVIDE) || this.match(TOKEN.MODULO)) {
      const token = this.currentToken
      this.currentToken = this.lexer.nextToken()
      expr = this.createNode(token.pos, [token.value, expr, this.parseUnary()])
    }

    return expr
  }

  // Unary ::= ('!' | '-')* Postfix
  parseUnary() {
    const token = this.currentToken
    if (token.type === TOKEN.NOT) {
      this.currentToken = this.lexer.nextToken()
      return this.createNode(token.pos, ['!_', this.parseUnary()])
    }

    if (token.type === TOKEN.MINUS) {
      this.currentToken = this.lexer.nextToken()
      return this.createNode(token.pos, ['-_', this.parseUnary()])
    }

    return this.parsePostfix()
  }

  assertReservedIdentifier(property) {
    if (!RESERVED.has(property.value)) return
    throw new ParseError(`Reserved identifier: ${property.value}`, {
      pos: property.pos,
      input: this.input
    })
  }

  // Postfix ::= Primary (('.' IDENTIFIER ('(' ArgumentList ')')? | '[' Expression ']'))*
  parsePostfix() {
    let expr = this.parsePrimary()

    while (true) {
      if (this.match(TOKEN.DOT)) {
        this.consume(TOKEN.DOT)
        const property = this.consume(TOKEN.IDENTIFIER)

        // Check for method call
        if (this.match(TOKEN.LPAREN)) {
          this.consume(TOKEN.LPAREN)
          const args = this.parseArgumentList()
          this.consume(TOKEN.RPAREN)
          expr = this.createNode(property.pos, ['rcall', property.value, expr, args])
        } else {
          expr = this.createNode(property.pos, ['.', expr, property.value])
        }
      } else if (this.match(TOKEN.LBRACKET)) {
        const token = this.consume(TOKEN.LBRACKET)
        const index = this.parseExpression()
        this.consume(TOKEN.RBRACKET)
        expr = this.createNode(token.pos, ['[]', expr, index])
      } else {
        break
      }
    }

    return expr
  }

  // Primary ::= NUMBER | STRING | BOOLEAN | NULL | IDENTIFIER | '(' Expression ')' | Array | Object
  parsePrimary() {
    switch (this.currentToken.type) {
      case TOKEN.NUMBER:
        return this.consume(TOKEN.NUMBER).value
      case TOKEN.STRING:
        return this.consume(TOKEN.STRING).value
      case TOKEN.BYTES:
        return this.consume(TOKEN.BYTES).value
      case TOKEN.BOOLEAN:
        return this.consume(TOKEN.BOOLEAN).value
      case TOKEN.NULL:
        return this.consume(TOKEN.NULL).value

      case TOKEN.IDENTIFIER: {
        const identifier = this.consume(TOKEN.IDENTIFIER)
        this.assertReservedIdentifier(identifier)

        // Check if next token is LPAREN for function call
        if (this.match(TOKEN.LPAREN)) {
          this.consume(TOKEN.LPAREN)
          const args = this.parseArgumentList()
          this.consume(TOKEN.RPAREN)
          return this.createNode(identifier.pos, ['call', identifier.value, args])
        }

        return this.createNode(identifier.pos, ['id', identifier.value])
      }
      case TOKEN.LPAREN: {
        this.consume(TOKEN.LPAREN)
        const expr = this.parseExpression()
        this.consume(TOKEN.RPAREN)
        return expr
      }
      case TOKEN.LBRACKET:
        return this.parseList()
      case TOKEN.LBRACE:
        return this.parseMap()
    }

    throw new ParseError(`Unexpected token: ${TOKEN_BY_NUMBER[this.currentToken.type]}`, {
      pos: this.currentToken.pos,
      input: this.lexer.input
    })
  }

  parseList() {
    this.consume(TOKEN.LBRACKET)
    const elements = []

    if (!this.match(TOKEN.RBRACKET)) {
      elements.push(this.parseExpression())
      while (this.match(TOKEN.COMMA)) {
        this.consume(TOKEN.COMMA)
        if (!this.match(TOKEN.RBRACKET)) {
          elements.push(this.parseExpression())
        }
      }
    }

    this.consume(TOKEN.RBRACKET)
    return ['list', elements]
  }

  parseMap() {
    this.consume(TOKEN.LBRACE)
    const properties = []

    if (!this.match(TOKEN.RBRACE)) {
      properties.push(this.parseProperty())
      while (this.match(TOKEN.COMMA)) {
        this.consume(TOKEN.COMMA)
        if (!this.match(TOKEN.RBRACE)) {
          // Allow trailing comma
          properties.push(this.parseProperty())
        }
      }
    }

    this.consume(TOKEN.RBRACE)
    return ['map', properties]
  }

  parseProperty() {
    const key = this.parseExpression()
    this.consume(TOKEN.COLON)
    const value = this.parseExpression()
    return [key, value]
  }

  parseArgumentList() {
    const args = []

    if (!this.match(TOKEN.RPAREN)) {
      args.push(this.parseExpression())
      while (this.match(TOKEN.COMMA)) {
        this.consume(TOKEN.COMMA)
        if (!this.match(TOKEN.RPAREN)) {
          args.push(this.parseExpression())
        }
      }
    }

    return args
  }
}
