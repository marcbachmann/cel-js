import overloads from './overloads.js'
import {allFunctions, objectGet, TYPES, debugType, Duration, UnsignedInt} from './functions.js'
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

  readHex() {
    const input = this.input
    const start = this.pos
    this.pos += 2

    while (this.pos < this.length && HEX_CODES[input[this.pos].charCodeAt(0)]) {
      this.pos++
    }

    return this._parseAsBigInt(start, this.pos, true, input[this.pos])
  }

  readNumber() {
    const input = this.input
    const start = this.pos
    const isHex = input[start] === '0' && (input[start + 1] === 'x' || input[start + 1] === 'X')

    if (isHex) return this.readHex()

    let isDouble = false
    while (this.pos < this.length) {
      const ch = input[this.pos]
      if (ch >= '0' && ch <= '9') {
        this.pos++
        continue
      }

      if (!isDouble && ch === '.') {
        const next = input[this.pos + 1]
        if (next >= '0' && next <= '9') {
          isDouble = true
          this.pos++
          continue
        }
      }
      break
    }

    if (!isDouble) return this._parseAsBigInt(start, this.pos, false, input[this.pos])
    const string = input.substring(start, this.pos)
    const value = Number(string)
    if (Number.isFinite(value)) return {type: TOKEN.NUMBER, value, pos: start}
    throw new EvaluationError(`Invalid number: ${value}`, {pos: start, input: this.input})
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
    const start = this.pos
    const needsEscapeHandling = prefix !== 'r'

    while (this.pos < this.length) {
      const ch = this.input[this.pos]

      // Check for closing delimiter
      if (ch === delimiter) {
        const rawValue = this.input.slice(start, this.pos)
        this.pos++ // Skip closing quote
        return this._closeQuotedString(rawValue, prefix)
      }

      // No newlines allowed in single-quoted strings
      if (ch === '\n' || ch === '\r') {
        throw new EvaluationError('Newlines not allowed in single-quoted strings', {
          pos: start - 1,
          input: this.input
        })
      }

      // Handle escape sequences
      if (ch === '\\' && needsEscapeHandling) {
        this.pos += 2 // Skip backslash and next char
        if (this.pos > this.length) {
          throw new EvaluationError('Unterminated escape sequence', {
            pos: start - 1,
            input: this.input
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
        if (!RESERVED.has(text)) return {type: TOKEN.IDENTIFIER, value: text, pos: start}
        throw new ParseError(`Reserved word not allowed as identifier: ${text}`, {
          pos: start,
          input: this.input
        })
    }
  }
}

class Parser {
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
        this.consume(TOKEN.NULL)
        return null

      case TOKEN.IDENTIFIER: {
        const identifier = this.consume(TOKEN.IDENTIFIER)
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
        return this.parseArray()
      case TOKEN.LBRACE:
        return this.parseObject()
    }

    throw new ParseError(`Unexpected token: ${TOKEN_BY_NUMBER[this.currentToken.type]}`, {
      pos: this.currentToken.pos,
      input: this.lexer.input
    })
  }

  parseArray() {
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
    return ['array', elements]
  }

  parseObject() {
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
    return ['object', properties]
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

function firstNode(a, b) {
  return Array.isArray(a) ? a : b
}

const handlers = new Map(
  Object.entries({
    id(ast, s) {
      const val = objectGet(s.ctx, ast[1])
      if (val === undefined) throw new EvaluationError(`Unknown variable: ${ast[1]}`, ast)
      return val
    },
    '||'(ast, s) {
      try {
        const left = s.eval(ast[1])
        if (left === true) return true
        if (left !== false) {
          throw new EvaluationError('Left operand of || is not a boolean', firstNode(ast[1], ast))
        }
      } catch (err) {
        if (err.message.includes('Unknown variable')) throw err
        if (err.message.includes('is not a boolean')) throw err

        const right = s.eval(ast[2])
        if (right === true) return true
        if (right === false) throw err
        throw new EvaluationError('Right operand of || is not a boolean', firstNode(ast[2], ast))
      }

      const right = s.eval(ast[2])
      if (typeof right === 'boolean') return right
      throw new EvaluationError('Right operand of || is not a boolean', firstNode(ast[2], ast))
    },
    '&&'(ast, s) {
      try {
        const left = s.eval(ast[1])
        if (left === false) return false
        if (left !== true) {
          throw new EvaluationError('Left operand of && is not a boolean', firstNode(ast[1], ast))
        }
      } catch (err) {
        if (err.message.includes('Unknown variable')) throw err
        if (err.message.includes('is not a boolean')) throw err

        const right = s.eval(ast[2])
        if (right === false) return false
        if (right === true) throw err
        throw new EvaluationError('Right operand of && is not a boolean', firstNode(ast[2], ast))
      }

      const right = s.eval(ast[2])
      if (typeof right === 'boolean') return right
      throw new EvaluationError('Right operand of && is not a boolean', firstNode(ast[2], ast))
    },
    '[]'(ast, s) {
      const left = s.eval(ast[1])
      const right = s.eval(ast[2])
      const value = objectGet(left, right)
      if (value !== undefined) return value

      if (Array.isArray(left)) {
        if (!(typeof right === 'number' || typeof right === 'bigint')) {
          throw new EvaluationError(`No such key: ${right} (${debugType(right)})`, ast)
        }
        if (right < 0) {
          throw new EvaluationError(`No such key: index out of bounds, index ${right} < 0`, ast)
        }
        if (right >= left.length) {
          throw new EvaluationError(
            `No such key: index out of bounds, index ${right} >= size ${left.length}`,
            ast
          )
        }
      }
      throw new EvaluationError(`No such key: ${right}`, ast)
    },
    rcall(ast, s) {
      const functionName = ast[1]
      const receiver = s.eval(ast[2])
      const receiverType = debugType(receiver)
      let fn = s.fns.get(functionName, receiverType)
      if (!fn) {
        throw new EvaluationError(
          `Function not found: '${functionName}' for value of type '${receiverType}'`,
          ast
        )
      }

      if (fn.macro) {
        if (fn.argCount !== ast[3].length) {
          throw new EvaluationError(
            `found no matching overload for '${receiverType}.${functionName}(${ast[3]
              .map(() => 'ast')
              .join(', ')})'`,
            ast
          )
        }

        return fn.handler.call(s, receiver, ...ast[3])
      }

      try {
        const args = ast[3].map((arg) => s.eval(arg))
        fn = resolveFunction(fn, args)
        if (!fn?.handler) {
          throw new EvaluationError(
            `found no matching overload for '${receiverType}.${functionName}(${args
              .map(debugType)
              .join(', ')})'`,
            ast
          )
        }

        return fn.handler(receiver, ...args)
      } catch (err) {
        if (err instanceof EvaluationError) throw err.withAst(ast)
        throw new EvaluationError(err.message, ast, err)
      }
    },
    call(ast, s) {
      const functionName = ast[1]
      let fn = s.fns.get(functionName)
      if (!fn || fn.standalone === false) {
        throw new EvaluationError(`Function not found: '${functionName}'`, ast)
      }

      if (fn.macro) {
        if (fn.argCount !== ast[2].length) {
          throw new EvaluationError(
            `found no matching overload for '${functionName}(${ast[2]
              .map(() => 'ast')
              .join(', ')})'`,
            ast
          )
        }

        return fn.handler.call(s, ...ast[2])
      }

      try {
        const args = ast[2].map((arg) => s.eval(arg))
        fn = resolveFunction(fn, args)
        if (!fn?.handler || fn.standalone === false) {
          throw new EvaluationError(
            `found no matching overload for '${functionName}(${args.map(debugType).join(', ')})'`,
            ast
          )
        }

        return fn.handler.apply(fn.handler, args)
      } catch (err) {
        if (err instanceof EvaluationError) throw err.withAst(ast)
        throw new EvaluationError(err.message, ast, err)
      }
    },
    array(ast, s) {
      const elements = ast[1]
      const result = new Array(elements.length)
      for (let i = 0; i < elements.length; i++) result[i] = s.eval(elements[i])
      return result
    },
    object(ast, s) {
      const result = {}
      const props = ast[1]
      for (let i = 0; i < props.length; i++) {
        const e = props[i]
        result[s.eval(e[0])] = s.eval(e[1])
      }
      return result
    },
    '?:'(ast, s) {
      const condition = s.eval(ast[1])
      if (typeof condition !== 'boolean') {
        throw new EvaluationError('Ternary condition must be a boolean')
      }
      return condition ? s.eval(ast[2]) : s.eval(ast[3])
    },
    '!_': unaryOverload,
    '-_': unaryOverload,
    '!=': anyOverload,
    '==': anyOverload,
    in: anyOverload,
    '+': anyOverload,
    '-': anyOverload,
    '*': anyOverload,
    '/': anyOverload,
    '%': anyOverload,
    '<': anyOverload,
    '<=': anyOverload,
    '>': anyOverload,
    '>=': anyOverload
  })
)

// handler aliases
handlers.set('.', handlers.get('[]'))

function unaryOverload(ast, s) {
  const left = s.eval(ast[1])
  const leftType = debugType(left)
  const overload = overloads[ast[0]]?.[leftType]
  if (!overload) throw new EvaluationError(`no such overload: ${ast[0][0]}${leftType}`, ast)
  return overload(left)
}

const kAstCache = Symbol('astCache')
function getOverload(s, ast, leftType, rightType) {
  const cache =
    (ast[kAstCache] ??= new Map()).get(leftType) || ast[kAstCache].set(leftType, {}).get(leftType)

  const cached = cache[rightType]
  if (cached !== undefined) return cached

  const overload = computeDynamicOverload(s, ast, leftType, rightType)
  cache[rightType] = overload
  return overload
}

function computeDynamicOverload(s, ast, leftType, rightType) {
  const op = overloads[ast[0]]
  const leftDynamic = s.isDynamic(ast[1])
  const rightDynamic = s.isDynamic(ast[2])
  if (!leftDynamic && !rightDynamic) return false

  return (
    (leftDynamic && rightDynamic && op[`dyn<${leftType}>`]?.[`dyn<${rightType}>`]) ||
    (leftDynamic && op[`dyn<${leftType}>`]?.[rightType]) ||
    (rightDynamic && op[leftType]?.[`dyn<${rightType}>`]) ||
    (leftDynamic && op['dyn']?.[rightType]) ||
    (rightDynamic && op[leftType]?.['dyn']) ||
    (leftDynamic && rightDynamic && op['dyn']?.['dyn']) ||
    false
  )
}

function anyOverload(ast, s) {
  const left = s.eval(ast[1])
  const right = s.eval(ast[2])
  const leftType = debugType(left)
  const rightType = debugType(right)
  const overload =
    overloads[ast[0]][leftType]?.[rightType] || getOverload(s, ast, leftType, rightType)
  if (overload) return overload(left, right, ast, s)

  throw new EvaluationError(`no such overload: ${leftType} ${ast[0]} ${rightType}`, ast)
}

class Evaluator {
  handlers = handlers
  predicateEvaluator(receiver, functionName, identifier, predicate) {
    return new PredicateEvaluator(this, receiver, functionName, identifier, predicate)
  }
  eval(ast) {
    if (!Array.isArray(ast)) return ast

    const handler = this.handlers.get(ast[0])
    if (handler) return handler(ast, this)
    throw new EvaluationError(`Unknown operation: ${ast[0]}`, ast)
  }

  // Check if an AST node contains any variable references (making it dynamic)
  isDynamic(ast) {
    if (!Array.isArray(ast)) return false

    switch (ast[0]) {
      case 'id':
        return true
      case '.':
      case '[]':
        return this.isDynamic(ast[1])
      case '+':
      case '-':
      case '-_':
        return false
      case '?:':
        return this.isDynamic(ast[2]) || this.isDynamic(ast[3])
      case 'rcall':
      case 'call': {
        const functionName = ast[1]
        if (functionName === 'dyn') return true

        switch (allFunctions.returnTypes[functionName]) {
          case undefined: {
            for (let i = 1; i < ast.length; i++) {
              if (this.isDynamic(ast[i])) return true
            }
            return false
          }
          case 'list':
          case 'map':
            return this.isDynamic(ast[2])
          default:
            return false
        }
      }
      case 'array': {
        const elements = ast[1]
        for (let i = 0; i < elements.length; i++) {
          if (this.isDynamic(elements[i])) return true
        }
        return false
      }
      case 'object': {
        const props = ast[1]
        for (let i = 0; i < props.length; i++) {
          const p = props[i]
          if (this.isDynamic(p[0]) || this.isDynamic(p[1])) return true
        }
        return false
      }
      default:
        return false
    }
  }
}

class InstanceFunctions {
  constructor(fns) {
    const normalized = Object.create(null)
    normalized.standalone = Object.create(null)

    for (const key in fns) {
      const fn = fns[key]
      if (typeof fn === 'function') {
        normalized.standalone[key] = {
          standalone: true,
          unknownargs: true,
          handler: fn
        }
      } else if (typeof fn === 'object') {
        const namespace = (normalized[key] ??= Object.create(null))

        for (const functionName in fn) {
          namespace[functionName] = {
            standalone: false,
            unknownargs: true,
            handler: fn[functionName]
          }
        }
      }
    }

    this.instanceFunctions = normalized
  }

  get(name, type) {
    if (!type) return this.instanceFunctions.standalone[name] || allFunctions.standalone[name]
    return this.instanceFunctions[type]?.[name] || allFunctions[type]?.[name]
  }
}

class PredicateEvaluator extends Evaluator {
  constructor(parent, receiver, functionName, identifier, predicate) {
    if (identifier?.[0] !== 'id') {
      throw new EvaluationError(
        `${functionName}(var, predicate) invalid predicate iteration variable`,
        identifier
      )
    }

    super()
    this.ctx = {...parent.ctx}
    this.fns = parent.fns
    this.functionName = functionName
    this.predicateVariable = identifier[1]
    this.predicateExpression = predicate
    this.items = this.getIterableItems(functionName, receiver)
  }

  getIterableItems(functionName, collection) {
    if (Array.isArray(collection)) return collection
    if (collection instanceof Set) return [...collection]
    if (collection instanceof Map) return [...collection.keys()]
    if (typeof collection === 'object' && collection !== null) return Object.keys(collection)
    throw new EvaluationError(
      `${functionName}() cannot iterate over non-collection type. argument must be a list, map, or object`
    )
  }

  childEvaluateBool(item) {
    const bool = this.childEvaluate(item)
    if (typeof bool === 'boolean') return bool
    throw new EvaluationError(
      `${this.functionName}() predicate result is not a boolean`,
      this.predicateExpression
    )
  }

  childEvaluate(item) {
    this.ctx[this.predicateVariable] = item
    return this.eval(this.predicateExpression)
  }
}

function resolveFunction(fn, args) {
  if (fn.unknownargs) return fn

  let resolved = fn
  for (const arg of args) {
    resolved = resolved?.[debugType(arg)]
    if (!resolved) return null
  }
  return resolved
}

const globalEvaluator = new Evaluator()
const globalInstanceFunctions = new InstanceFunctions({})

function evaluateAST(ast, context, instanceFunctions) {
  if (context !== undefined && typeof context !== 'object')
    throw new EvaluationError('Context must be an object')

  const evaluator = globalEvaluator
  evaluator.ctx = context ? {...context, ...TYPES} : TYPES
  evaluator.fns = instanceFunctions
    ? new InstanceFunctions(instanceFunctions)
    : globalInstanceFunctions

  return evaluator.eval(ast)
}

export function parse(expression) {
  const ast = new Parser(expression).parse()
  const evaluateParsed = (context, functions) => evaluateAST(ast, context, functions)
  evaluateParsed.ast = ast
  return evaluateParsed
}

export function evaluate(expression, context, functions) {
  const ast = new Parser(expression).parse()
  return evaluateAST(ast, context, functions)
}

export {ParseError, EvaluationError, Duration, UnsignedInt}

export default {
  parse,
  evaluate,
  ParseError,
  EvaluationError,
  Duration,
  UnsignedInt
}
