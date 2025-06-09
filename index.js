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

class Lexer {
  constructor(input) {
    this.input = input
    this.pos = 0
    this.length = input.length
  }

  // Skip whitespace and comments
  skipWhitespace() {
    while (this.pos < this.length) {
      switch (this.input[this.pos]) {
        case ' ':
        case '\t':
        case '\n':
        case '\r':
          this.pos++
          continue

        case '/':
          if (this.input[this.pos + 1] === '/') {
            // Skip comment
            while (this.pos < this.length && this.input[this.pos] !== '\n') this.pos++
            continue
          }
      }
      break
    }
  }

  // Read next token
  nextToken() {
    this.skipWhitespace()

    if (this.pos >= this.length) return {type: TOKEN.EOF, value: null}

    const ch = this.input[this.pos]
    const next = this.input[this.pos + 1]

    switch (ch) {
      case '=':
        if (next !== '=') break
        this.pos += 2
        return {type: TOKEN.EQ, value: '=='}
      case '&':
        if (next !== '&') break
        this.pos += 2
        return {type: TOKEN.AND, value: '&&'}
      case '|':
        if (next !== '|') break
        this.pos += 2
        return {type: TOKEN.OR, value: '||'}
      case '+':
        this.pos++
        return {type: TOKEN.PLUS, value: '+'}
      case '-':
        this.pos++
        return {type: TOKEN.MINUS, value: '-'}
      case '*':
        this.pos++
        return {type: TOKEN.MULTIPLY, value: '*'}
      case '/':
        this.pos++
        return {type: TOKEN.DIVIDE, value: '/'}
      case '%':
        this.pos++
        return {type: TOKEN.MODULO, value: '%'}
      case '<':
        if (next === '=') {
          this.pos += 2
          return {type: TOKEN.LE, value: '<='}
        }
        this.pos++
        return {type: TOKEN.LT, value: '<'}
      case '>':
        if (next === '=') {
          this.pos += 2
          return {type: TOKEN.GE, value: '>='}
        }
        this.pos++
        return {type: TOKEN.GT, value: '>'}
      case '!':
        if (next === '=') {
          this.pos += 2
          return {type: TOKEN.NE, value: '!='}
        }
        this.pos++
        return {type: TOKEN.NOT, value: '!'}
      case '(':
        this.pos++
        return {type: TOKEN.LPAREN, value: '('}
      case ')':
        this.pos++
        return {type: TOKEN.RPAREN, value: ')'}
      case '[':
        this.pos++
        return {type: TOKEN.LBRACKET, value: '['}
      case ']':
        this.pos++
        return {type: TOKEN.RBRACKET, value: ']'}
      case '{':
        this.pos++
        return {type: TOKEN.LBRACE, value: '{'}
      case '}':
        this.pos++
        return {type: TOKEN.RBRACE, value: '}'}
      case '.':
        this.pos++
        return {type: TOKEN.DOT, value: '.'}
      case ',':
        this.pos++
        return {type: TOKEN.COMMA, value: ','}
      case ':':
        this.pos++
        return {type: TOKEN.COLON, value: ':'}
      case '?':
        this.pos++
        return {type: TOKEN.QUESTION, value: '?'}

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
    }

    // Numbers (including hex with 0x prefix)
    if (ch >= '0' && ch <= '9') return this.readNumber()

    // Identifiers and keywords
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      return this.readIdentifier()
    }

    throw new ParseError(`Unexpected character: ${ch}`)
  }

  readNumber() {
    const input = this.input
    const start = this.pos

    let isFloat = false
    const isHex =
      input[start] === '0' &&
      start + 1 < this.length &&
      (input[start + 1] === 'x' || input[start + 1] === 'X')

    if (isHex) this.pos += 2

    while (this.pos < this.length) {
      const ch = input[this.pos]
      if (ch >= '0' && ch <= '9') {
        this.pos++
      } else if (ch === '.') {
        if (isHex) throw new EvaluationError('Invalid hex number: unexpected dot')
        this.pos++
        if (!isFloat) isFloat = true
      } else if ((ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F')) {
        this.pos++
        if (!isHex) throw new EvaluationError('Invalid number: unexpected hex digit')
      } else {
        break
      }
    }

    const isUnsigned = input[this.pos] === 'u' || input[this.pos] === 'U'
    let value = input.substring(isHex ? start + 2 : start, this.pos)

    if (isUnsigned) {
      this.pos++
      if (isFloat) {
        throw new EvaluationError('Invalid float number: unsigned suffix not allowed')
      }
    }

    if (isFloat) value = parseFloat(value)
    else value = parseInt(value, isHex ? 16 : 10)
    if (isNaN(value)) throw new EvaluationError(`Invalid ${isHex ? 'hex ' : ''}number: ${value}`)
    return {type: TOKEN.NUMBER, value: isUnsigned ? value >>> 0 : value}
  }

  readString(prefix) {
    const delimiter = this.input[this.pos]

    // Skip opening quote
    this.pos++

    // Check for triple quotes
    const isTripleQuote =
      this.pos + 1 < this.length &&
      this.input[this.pos] === delimiter &&
      this.input[this.pos + 1] === delimiter

    if (isTripleQuote) {
      this.pos += 2 // Skip the next two quote characters
      return this.readTripleQuotedString(delimiter, prefix)
    } else {
      return this.readSingleQuotedString(delimiter, prefix)
    }
  }

  _closeQuotedString(chars, prefix) {
    const rawValue = chars.join('')

    if (prefix === 'b') {
      // Process escapes and convert to Uint8Array
      const processed = this.processEscapes(rawValue, true)
      const bytes = new Uint8Array(processed.length)
      for (let i = 0; i < processed.length; i++) {
        bytes[i] = processed.charCodeAt(i) & 0xff
      }
      return {type: TOKEN.BYTES, value: bytes}
    } else {
      const value = prefix === 'r' ? rawValue : this.processEscapes(rawValue, false)
      return {type: TOKEN.STRING, value}
    }
  }

  readSingleQuotedString(delimiter, prefix) {
    const chars = []

    while (this.pos < this.length) {
      const ch = this.input[this.pos]

      // Check for closing delimiter
      if (ch === delimiter) {
        this.pos++ // Skip closing quote
        return this._closeQuotedString(chars, prefix)
      }

      // No newlines allowed in single-quoted strings
      if (ch === '\n' || ch === '\r') {
        throw new EvaluationError('Newlines not allowed in single-quoted strings')
      }

      // Handle escape sequences
      if (ch === '\\' && prefix !== 'r') {
        this.pos++ // Skip backslash
        if (this.pos >= this.length) throw new EvaluationError('Unterminated escape sequence')

        chars.push('\\')
        chars.push(this.input[this.pos])
      } else {
        chars.push(ch)
      }

      this.pos++
    }

    throw new EvaluationError('Unterminated string')
  }

  readTripleQuotedString(delimiter, prefix) {
    const chars = []

    while (this.pos < this.length) {
      const ch = this.input[this.pos]

      // Check for closing triple delimiter
      if (
        ch === delimiter &&
        // this.pos + 1 < this.length &&
        this.input[this.pos + 1] === delimiter &&
        // this.pos + 2 < this.length &&
        this.input[this.pos + 2] === delimiter
      ) {
        this.pos += 3 // Skip closing triple quotes
        return this._closeQuotedString(chars, prefix)
      }

      // Handle escape sequences
      if (ch === '\\' && prefix !== 'r') {
        this.pos++ // Skip backslash
        if (this.pos >= this.length) throw new EvaluationError('Unterminated escape sequence')
        chars.push('\\')
        chars.push(this.input[this.pos])
      } else {
        chars.push(ch)
      }

      this.pos++
    }

    throw new EvaluationError('Unterminated triple-quoted string')
  }

  processEscapes(str, isBytes) {
    let result = ''
    let i = 0

    while (i < str.length) {
      if (str[i] === '\\' && i + 1 < str.length) {
        const next = str[i + 1]

        switch (next) {
          case '\\':
            result += '\\'
            i += 2
            break
          case '"':
            result += '"'
            i += 2
            break
          case "'":
            result += "'"
            i += 2
            break
          case 'b':
            result += '\b'
            i += 2
            break
          case 'f':
            result += '\f'
            i += 2
            break
          case 'n':
            result += '\n'
            i += 2
            break
          case 'r':
            result += '\r'
            i += 2
            break
          case 't':
            result += '\t'
            i += 2
            break
          case 'v':
            result += '\v'
            i += 2
            break
          case 'u':
            // Unicode escape \uXXXX
            if (i + 6 <= str.length) {
              const hex = str.substring(i + 2, i + 6)
              if (/^[0-9a-fA-F]{4}$/.test(hex)) {
                const codePoint = parseInt(hex, 16)
                // Reject surrogate code points (CEL standard)
                if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
                  throw new EvaluationError(`Invalid Unicode surrogate code point: \\u${hex}`)
                }
                result += String.fromCharCode(codePoint)
                i += 6
              } else {
                throw new EvaluationError(`Invalid Unicode escape sequence: \\u${hex}`)
              }
            } else {
              throw new EvaluationError('Incomplete Unicode escape sequence')
            }
            break
          case 'U':
            // Unicode escape \UXXXXXXXX (only for strings, not bytes)
            if (isBytes) {
              throw new EvaluationError('\\U escape sequences not allowed in bytes literals')
            }
            if (i + 10 <= str.length) {
              const hex = str.substring(i + 2, i + 10)
              if (/^[0-9a-fA-F]{8}$/.test(hex)) {
                const codePoint = parseInt(hex, 16)
                // Check valid Unicode range
                if (codePoint > 0x10ffff) {
                  throw new EvaluationError(`Invalid Unicode code point: \\U${hex}`)
                }
                // Reject surrogate code points (CEL standard)
                if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
                  throw new EvaluationError(`Invalid Unicode surrogate code point: \\U${hex}`)
                }
                // Use String.fromCodePoint for proper Unicode handling
                result += String.fromCodePoint(codePoint)
                i += 10
              } else {
                throw new EvaluationError(`Invalid Unicode escape sequence: \\U${hex}`)
              }
            } else {
              throw new EvaluationError('Incomplete Unicode escape sequence')
            }
            break
          case 'x':
            // Hex escape \xXX
            if (i + 4 <= str.length) {
              const hex = str.substring(i + 2, i + 4)
              if (/^[0-9a-fA-F]{2}$/.test(hex)) {
                const value = parseInt(hex, 16)
                result += String.fromCharCode(value)
                i += 4
              } else {
                throw new EvaluationError(`Invalid hex escape sequence: \\x${hex}`)
              }
            } else {
              throw new EvaluationError('Incomplete hex escape sequence')
            }
            break
          default:
            throw new EvaluationError(`Invalid escape sequence: \\${next}`)
        }
      } else {
        result += str[i]
        i++
      }
    }

    return result
  }

  readIdentifier() {
    const start = this.pos
    while (this.pos < this.length) {
      const ch = this.input[this.pos]
      if (
        (ch >= 'a' && ch <= 'z') ||
        (ch >= 'A' && ch <= 'Z') ||
        (ch >= '0' && ch <= '9') ||
        ch === '_'
      ) {
        this.pos++
      } else {
        break
      }
    }

    const text = this.input.substring(start, this.pos)

    // Keywords
    switch (text) {
      case 'true':
        return {type: TOKEN.BOOLEAN, value: true}
      case 'false':
        return {type: TOKEN.BOOLEAN, value: false}
      case 'null':
        return {type: TOKEN.NULL, value: null}
      case 'in':
        return {type: TOKEN.IN, value: 'in'}
      default:
        if (!RESERVED.has(text)) return {type: TOKEN.IDENTIFIER, value: text}
        throw new ParseError(`Reserved word not allowed as identifier: ${text}`)
    }
  }
}

class Parser {
  constructor(input) {
    this.lexer = new Lexer(input)
    this.currentToken = this.lexer.nextToken()
  }

  consume(expectedType) {
    if (this.currentToken.type !== expectedType) {
      throw new ParseError(
        `Expected ${TOKEN_BY_NUMBER[expectedType]}, got ${TOKEN_BY_NUMBER[this.currentToken.type]}`
      )
    }
    const token = this.currentToken
    this.currentToken = this.lexer.nextToken()
    return token
  }

  match(type) {
    return this.currentToken.type === type
  }

  // Parse entry point
  parse() {
    const result = this.parseExpression()
    if (!this.match(TOKEN.EOF)) throw new ParseError('Expected end of input')
    return result
  }

  // Expression ::= LogicalOr ('?' Ternary ':' Ternary)?  // Made right-associative
  parseExpression() {
    const expr = this.parseLogicalOr()

    if (this.match(TOKEN.QUESTION)) {
      this.consume(TOKEN.QUESTION)
      const consequent = this.parseExpression() // Right-associative: parse ternary, not expression
      this.consume(TOKEN.COLON)
      const alternate = this.parseExpression() // Right-associative: parse ternary, not expression
      return ['?:', expr, consequent, alternate]
    }

    return expr
  }

  // LogicalOr ::= LogicalAnd ('||' LogicalAnd)*
  parseLogicalOr() {
    let expr = this.parseLogicalAnd()

    while (this.match(TOKEN.OR)) {
      const op = this.consume(TOKEN.OR).value
      const right = this.parseLogicalAnd()
      expr = [op, expr, right]
    }

    return expr
  }

  // LogicalAnd ::= Equality ('&&' Equality)*
  parseLogicalAnd() {
    let expr = this.parseEquality()

    while (this.match(TOKEN.AND)) {
      const op = this.consume(TOKEN.AND).value
      const right = this.parseEquality()
      expr = [op, expr, right]
    }

    return expr
  }

  // Equality ::= Relational (('==' | '!=') Relational)*
  parseEquality() {
    let expr = this.parseRelational()

    while (this.match(TOKEN.EQ) || this.match(TOKEN.NE)) {
      const op = this.currentToken.value
      this.currentToken = this.lexer.nextToken()
      const right = this.parseRelational()
      expr = [op, expr, right]
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
      const op = this.currentToken.value
      this.currentToken = this.lexer.nextToken()
      const right = this.parseAdditive()
      expr = [op, expr, right]
    }

    return expr
  }

  // Additive ::= Multiplicative (('+' | '-') Multiplicative)*
  parseAdditive() {
    let expr = this.parseMultiplicative()

    while (this.match(TOKEN.PLUS) || this.match(TOKEN.MINUS)) {
      const op = this.currentToken.value
      this.currentToken = this.lexer.nextToken()
      const right = this.parseMultiplicative()
      expr = [op, expr, right]
    }

    return expr
  }

  // Multiplicative ::= Unary (('*' | '/' | '%') Unary)*
  parseMultiplicative() {
    let expr = this.parseUnary()

    while (this.match(TOKEN.MULTIPLY) || this.match(TOKEN.DIVIDE) || this.match(TOKEN.MODULO)) {
      const op = this.currentToken.value
      this.currentToken = this.lexer.nextToken()
      const right = this.parseUnary()
      expr = [op, expr, right]
    }

    return expr
  }

  // Unary ::= ('!' | '-' | '+')* Postfix
  parseUnary() {
    if (this.match(TOKEN.NOT) || this.match(TOKEN.MINUS)) {
      const op = this.currentToken.value
      this.currentToken = this.lexer.nextToken()
      const operand = this.parseUnary()
      return [op, operand]
    }

    if (this.match(TOKEN.PLUS)) {
      this.currentToken = this.lexer.nextToken() // Skip unary +
      return this.parseUnary()
    }

    return this.parsePostfix()
  }

  // Postfix ::= Primary (('.' IDENTIFIER ('(' ArgumentList ')')? | '[' Expression ']'))*
  parsePostfix() {
    let expr = this.parsePrimary()

    while (true) {
      if (this.match(TOKEN.DOT)) {
        this.consume(TOKEN.DOT)
        const property = this.consume(TOKEN.IDENTIFIER).value

        // Check for method call
        if (this.match(TOKEN.LPAREN)) {
          this.consume(TOKEN.LPAREN)
          const args = this.parseArgumentList()
          this.consume(TOKEN.RPAREN)
          expr = ['rcall', expr, property, args]
        } else {
          expr = ['.', expr, property]
        }
      } else if (this.match(TOKEN.LBRACKET)) {
        this.consume(TOKEN.LBRACKET)
        const index = this.parseExpression()
        this.consume(TOKEN.RBRACKET)
        expr = ['[]', expr, index]
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

      case TOKEN.IDENTIFIER:
        const identifier = this.consume(TOKEN.IDENTIFIER).value
        // Check if next token is LPAREN for function call
        if (this.match(TOKEN.LPAREN)) {
          this.consume(TOKEN.LPAREN)
          const args = this.parseArgumentList()
          this.consume(TOKEN.RPAREN)
          return ['call', identifier, args]
        } else {
          return ['id', identifier]
        }
      case TOKEN.LPAREN:
        this.consume(TOKEN.LPAREN)
        const expr = this.parseExpression()
        this.consume(TOKEN.RPAREN)
        return expr
      case TOKEN.LBRACKET:
        return this.parseArray()
      case TOKEN.LBRACE:
        return this.parseObject()
    }

    throw new ParseError(`Unexpected token: ${TOKEN_BY_NUMBER[this.currentToken.type]}`)
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

function stringSize(str) {
  let count = 0
  for (const c of str) count++ // eslint-disable-line no-unused-vars
  return count
}

function dateToLocale(d, timeZone) {
  return d.toLocaleString('en-US', {timeZone})
}

function fieldExists(self, [, objectExpr, propertyName]) {
  if (objectExpr?.[0] === '.' && Array.isArray(objectExpr) && !fieldExists(self, objectExpr)) {
    return false
  }
  return objectGet(self.eval(objectExpr), propertyName) !== undefined
}

const DEFAULT_MACROS = Object.assign(Object.create(null), {
  has(args) {
    if (args.length !== 1) throw new EvaluationError('has() requires exactly one argument')

    const arg = args[0]
    if (Array.isArray(arg) && arg[0] === '.') return fieldExists(this, arg)

    if (
      typeof arg === 'string' ||
      typeof arg === 'number' ||
      typeof arg === 'boolean' ||
      arg === null ||
      arg[0] === 'array' ||
      arg[0] === 'object'
    ) {
      throw new EvaluationError('has() does not support atomic expressions')
    }

    throw new EvaluationError('has() requires a field selection')
  },

  // all(list, predicate) - Test if all elements match a predicate
  // Supports both: all(list, var, predicate) and all(list, predicate)
  all(args) {
    const evaluator = new PredicateEvaluator(this, 'all', args)
    for (const item of evaluator.items) {
      if (!evaluator.childEvaluate(item)) return false
    }
    return true
  },

  // exists(list, predicate) - Test if any element matches a predicate
  // Supports both: exists(list, var, predicate) and exists(list, predicate)
  exists(args) {
    const evaluator = new PredicateEvaluator(this, 'exists', args)
    for (const item of evaluator.items) {
      if (evaluator.childEvaluate(item)) return true
    }
    return false
  },

  // exists_one(list, predicate) - Test if exactly one element matches a predicate
  // Supports both: exists_one(list, var, predicate) and exists_one(list, predicate)
  exists_one(args) {
    const evaluator = new PredicateEvaluator(this, 'exists_one', args)

    let count = 0
    for (const item of evaluator.items) {
      if (!evaluator.childEvaluate(item)) continue
      count++
      if (count > 1) return false
    }
    return count === 1
  },

  // map(list, transform) - Transform list/map elements
  // Supports both: map(list, var, transform) and map(list, transform)
  map(args) {
    const evaluator = new PredicateEvaluator(this, 'map', args)
    const results = []
    for (const item of evaluator.items) results.push(evaluator.childEvaluate(item))
    return results
  },

  // filter(list, predicate) - Filter list/map elements
  // Supports both: filter(list, var, predicate) and filter(list, predicate)
  filter(args) {
    const evaluator = new PredicateEvaluator(this, 'filter', args)

    const results = []
    for (const item of evaluator.items) {
      const result = evaluator.childEvaluate(item)
      if (result) results.push(item)
    }

    return results
  }
})

const DEFAULT_FUNCTIONS = Object.assign(Object.create(null), {
  timestamp(v) {
    if (typeof v !== 'string') {
      throw new EvaluationError('timestamp() requires a string argument')
    }

    if (v.length !== 20 && v.length !== 23) {
      throw new EvaluationError('timestamp() requires a string in ISO 8601 format')
    }
    return new Date(v)
  },
  size(v) {
    if (typeof v === 'string') return stringSize(v)
    if (v instanceof Uint8Array) return v.length
    if (v instanceof Set) return v.size
    if (v instanceof Map) return v.size
    if (Array.isArray(v)) return v.length
    if (typeof v === 'object' && v !== null) return Object.keys(v).length
    throw new EvaluationError('size() type error')
  },
  bytes(str) {
    if (typeof str !== 'string') throw new EvaluationError('bytes() requires a string argument')

    const len = str.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) bytes[i] = str.charCodeAt(i) & 0xff
    return bytes
  },
  string(v) {
    switch (typeof v) {
      case 'string':
        return v
      case 'number':
      case 'boolean':
        return String(v)
      case 'undefined':
        return 'undefined'
      case 'object':
        if (v === null) return 'null'
        if (v instanceof Set) v = Array.from(v)
        else if (v instanceof Map) v = Object.fromEntries(v.entries())
        return JSON.stringify(v)
      default:
        return String(v)
    }
  },
  // Type-specific method namespaces
  String: {
    size: stringSize,
    startsWith(a, b) {
      if (typeof b === 'string' && typeof a === 'string') return a.startsWith(b)
      throw new EvaluationError('string.startsWith() requires a string argument')
    },
    endsWith(a, b) {
      if (typeof b === 'string' && typeof a === 'string') return a.endsWith(b)
      throw new EvaluationError('string.endsWith() requires a string argument')
    },
    contains(a, b) {
      if (typeof b === 'string' && typeof a === 'string') return a.includes(b)
      throw new EvaluationError('string.contains() requires a string argument')
    },
    matches(a, b) {
      if (typeof b === 'string' && typeof a === 'string') {
        try {
          return new RegExp(b).test(a)
        } catch (error) {
          throw new EvaluationError(`Invalid regular expression: ${b}`)
        }
      }
      throw new EvaluationError('string.matches() requires a string argument')
    }
  },
  Bytes: {
    toString(bytes, encoding = 'utf-8') {
      if (!(bytes instanceof Uint8Array)) {
        throw new EvaluationError('Bytes.toString() requires a bytes argument')
      }
      if (encoding === 'utf-8') {
        return new TextDecoder().decode(bytes)
      } else if (encoding === 'hex') {
        return Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
      } else if (encoding === 'base64') {
        const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('')
        return btoa(binString)
      }
      throw new EvaluationError(`Unsupported encoding: ${encoding}`)
    },
    at(bytes, index) {
      if (!(bytes instanceof Uint8Array)) {
        throw new EvaluationError('Bytes.at() requires a bytes argument')
      }
      if (index < 0 || index >= bytes.length) {
        throw new EvaluationError('Bytes index out of range')
      }
      return bytes[index]
    }
  },
  Date: {
    getDate(dateObj, timezone) {
      if (timezone) return new Date(dateToLocale(dateObj, timezone)).getDate()
      return dateObj.getUTCDate()
    },
    getDayOfMonth(dateObj, timezone) {
      if (timezone) return new Date(dateToLocale(dateObj, timezone)).getDate() - 1
      return dateObj.getUTCDate() - 1
    },
    getDayOfWeek(dateObj, timezone) {
      if (timezone) return new Date(dateToLocale(dateObj, timezone)).getDay()
      return dateObj.getUTCDay()
    },
    getDayOfYear(dateObj, timezone) {
      let workingDate
      if (timezone) {
        workingDate = new Date(dateToLocale(dateObj, timezone))
      } else {
        workingDate = new Date(
          dateObj.getUTCFullYear(),
          dateObj.getUTCMonth(),
          dateObj.getUTCDate()
        )
      }

      const start = new Date(workingDate.getFullYear(), 0, 0)
      const diff = workingDate - start
      const oneDay = 1000 * 60 * 60 * 24
      return Math.floor(diff / oneDay) - 1
    },
    getFullYear(dateObj, timezone) {
      if (timezone) return new Date(dateToLocale(dateObj, timezone)).getFullYear()
      return dateObj.getUTCFullYear()
    },
    getHours(dateObj, timezone) {
      if (timezone) return new Date(dateToLocale(dateObj, timezone)).getHours()
      return dateObj.getUTCHours()
    },
    getMilliseconds(dateObj) {
      return dateObj.getUTCMilliseconds()
    },
    getMinutes(dateObj, timezone) {
      if (timezone) return new Date(dateToLocale(dateObj, timezone)).getMinutes()
      return dateObj.getUTCMinutes()
    },
    getMonth(dateObj, timezone) {
      if (timezone) return new Date(dateToLocale(dateObj, timezone)).getMonth()
      return dateObj.getUTCMonth()
    },
    getSeconds(dateObj, timezone) {
      if (timezone) return new Date(dateToLocale(dateObj, timezone)).getSeconds()
      return dateObj.getUTCSeconds()
    }
  }
})

class Evaluator {
  constructor(context, functions) {
    if (context !== undefined && typeof context !== 'object')
      throw new EvaluationError('Context must be an object')

    this.ctx = context
    this.macros = DEFAULT_MACROS
    this.fns = functions
      ? Object.assign(Object.create(null), DEFAULT_FUNCTIONS, functions)
      : DEFAULT_FUNCTIONS
  }

  eval(ast) {
    // Primitive values
    if (typeof ast !== 'object' || ast === null || !Array.isArray(ast)) return ast

    switch (ast[0]) {
      case 'id': {
        const val = objectGet(this.ctx, ast[1])
        if (val === undefined) throw new EvaluationError(`Unknown variable: ${ast[1]}`)
        return val
      }
      case '||': {
        const left = this.eval(ast[1])
        if (left !== false && left !== null) return left
        return this.eval(ast[2])
      }
      case '&&': {
        const left = this.eval(ast[1])
        if (left === false || left === null) return left
        return this.eval(ast[2])
      }
      case '==': {
        const left = this.eval(ast[1])
        const right = this.eval(ast[2])
        if (typeof left === 'object' && typeof right === 'object') return isEqual(left, right)
        return left === right
      }
      case '!=': {
        const left = this.eval(ast[1])
        const right = this.eval(ast[2])
        if (typeof left === 'object' && typeof right === 'object') return !isEqual(left, right)
        return left !== right
      }
      case '<': {
        const left = this.eval(ast[1])
        const right = this.eval(ast[2])
        if (typeof left !== typeof right) {
          throw new EvaluationError(`no such overload: ${debugType(left)} < ${debugType(right)}`)
        }
        return left < right
      }
      case '<=': {
        const left = this.eval(ast[1])
        const right = this.eval(ast[2])
        if (typeof left !== typeof right) {
          throw new EvaluationError(`no such overload: ${debugType(left)} <= ${debugType(right)}`)
        }
        return left <= right
      }
      case '>': {
        const left = this.eval(ast[1])
        const right = this.eval(ast[2])
        if (typeof left !== typeof right) {
          throw new EvaluationError(`no such overload: ${debugType(left)} > ${debugType(right)}`)
        }
        return left > right
      }
      case '>=': {
        const left = this.eval(ast[1])
        const right = this.eval(ast[2])
        if (typeof left !== typeof right) {
          throw new EvaluationError(`no such overload: ${debugType(left)} >= ${debugType(right)}`)
        }
        return left >= right
      }
      case '+': {
        const left = this.eval(ast[1])
        const right = this.eval(ast[2])
        if (typeof left !== typeof right) {
          throw new EvaluationError(`no such overload: ${debugType(left)} + ${debugType(right)}`)
        }

        switch (typeof left) {
          case 'number':
            if (Number.isFinite(left) && Number.isFinite(right)) return left + right
            break
          case 'string':
            return left + right
          case 'object':
            if (left === null || right === null || left.constructor !== right.constructor) {
              break
            }

            if (Array.isArray(left)) return [...left, ...right]

            if (left instanceof Uint8Array) {
              const result = new Uint8Array(left.length + right.length)
              result.set(left, 0)
              result.set(right, left.length)
              return result
            }
        }
        throw new EvaluationError(`no such overload: ${debugType(left)} + ${debugType(right)}`)
      }
      case '-': {
        const left = this.eval(ast[1])
        if (ast.length === 2) {
          if (typeof left !== 'number') {
            throw new EvaluationError(`no such overload: -${debugType(left)}`)
          }
          return -left
        }

        const right = this.eval(ast[2])
        if (typeof left !== 'number' || typeof right !== 'number') {
          throw new EvaluationError(`no such overload: ${debugType(left)} - ${debugType(right)}`)
        }
        return left - right
      }
      case '*': {
        const left = this.eval(ast[1])
        const right = this.eval(ast[2])
        if (typeof left !== 'number' || typeof right !== 'number') {
          throw new EvaluationError(`no such overload: ${debugType(left)} * ${debugType(right)}`)
        }
        return left * right
      }
      case '/': {
        const left = this.eval(ast[1])
        const right = this.eval(ast[2])
        if (typeof left !== 'number' || typeof right !== 'number') {
          throw new EvaluationError(`no such overload: ${debugType(left)} / ${debugType(right)}`)
        }
        if (right === 0) throw new EvaluationError('division by zero')
        return left / right
      }
      case '%': {
        const left = this.eval(ast[1])
        const right = this.eval(ast[2])
        if (typeof left !== 'number' || typeof right !== 'number') {
          throw new EvaluationError(`no such overload: ${debugType(left)} % ${debugType(right)}`)
        }
        if (right === 0) throw new EvaluationError('modulo by zero')
        return left % right
      }
      case '!': {
        const operand = this.eval(ast[1])
        return operand === false || operand === null
      }
      case 'in': {
        const left = this.eval(ast[1])
        const right = this.eval(ast[2])

        if (typeof right === 'string') return typeof left === 'string' && right.includes(left)
        if (right instanceof Set) return right.has(left)
        if (Array.isArray(right)) return right.includes(left)
        return objectGet(right, left) !== undefined
      }
      case '.':
      case '[]': {
        const left = this.eval(ast[1])
        const right = this.eval(ast[2])
        const value = objectGet(left, right)
        if (value === undefined) {
          if (Array.isArray(left)) {
            if (right < 0)
              throw new EvaluationError(`No such key: index out of bounds, index ${right} < 0`)
            if (right >= left.length)
              throw new EvaluationError(
                `No such key: index out of bounds, index ${right} >= size ${left.length}`
              )
            if (typeof right !== 'number')
              throw new EvaluationError(`No such key: ${right} (${debugType(right)})`)
          }
          throw new EvaluationError(`No such key: ${right}`)
        }
        return value
      }
      // Receiver call
      case 'rcall': {
        const functionName = ast[2]
        if (this.macros[functionName])
          return this.macros[functionName].call(this, [ast[1], ...ast[3]])

        const value = this.eval(ast[1])
        const fnNs = debugType(value)
        const fn = this.fns[fnNs]?.[functionName]
        if (typeof fn === 'function') return fn(value, ...ast[3].map((arg) => this.eval(arg)))
        throw new EvaluationError(`Function not found: ${functionName} for ${fnNs}`)
      }
      case 'call': {
        const functionName = ast[1]
        if (this.macros[functionName]) return this.macros[functionName].call(this, ast[2])

        const fn = this.fns[functionName]
        if (typeof fn === 'function') return fn(...ast[2].map((arg) => this.eval(arg)))
        throw new EvaluationError(`Function not found: ${functionName}`)
      }
      case 'array':
        return ast[1].map((el) => this.eval(el))

      case 'object': {
        const result = {}
        for (const [key, value] of ast[1]) {
          if (key in result) throw new EvaluationError(`Duplicate key: ${key}`)
          result[this.eval(key)] = this.eval(value)
        }
        return result
      }
      case '?:': {
        const condition = this.eval(ast[1])
        const isTruthy = condition !== false && condition !== null
        return isTruthy ? this.eval(ast[2]) : this.eval(ast[3])
      }
      default:
        throw new EvaluationError(`Unknown operation: ${ast[0]}`)
    }
  }
}

class PredicateEvaluator extends Evaluator {
  constructor(parent, functionName, args) {
    super({...parent.ctx}, parent.fns)

    if (
      args.length < 2 ||
      args.length > 3 ||
      // If we have 2 args and the second is just an identifier, treat it as incomplete 3-arg form
      (args.length === 2 && Array.isArray(args[1]) && args[1][0] === 'id')
    ) {
      throw new EvaluationError(
        `${functionName}(list, var, predicate) requires exactly 3 arguments`
      )
    }

    this.items = this.getIterableItems(functionName, parent.eval(args[0]))

    if (args.length === 3) {
      this.predicateExpression = args[2]
      this.predicateVars = args[1]?.[0] === 'id' ? [args[1][1]] : []
      if (!this.predicateVars.length) throw new EvaluationError('Invalid iteration variable')
    } else {
      this.predicateExpression = args[1]
      this.predicateVars = [...this.extractVariablesOfExpression(this.predicateExpression)]
    }
  }

  getIterableItems(functionName, collection) {
    if (Array.isArray(collection)) return collection
    if (collection instanceof Set) return collection
    if (collection instanceof Map) return collection.keys()
    if (typeof collection === 'object' && collection !== null) return Object.keys(collection)
    throw new EvaluationError(
      `${functionName}() cannot iterate over non-collection type. argument must be a list, map, or object`
    )
  }

  extractVariablesOfExpression(expr, vars = new Set()) {
    if (!Array.isArray(expr) || expr.length === 0) return vars

    if (expr[0] === 'id') {
      if (expr[1]?.length === 1 && !Object.hasOwn(this.ctx, expr[1])) vars.add(expr[1])
      return vars
    }

    for (let i = 1; i < expr.length; i++) this.extractVariablesOfExpression(expr[i], vars)
    return vars
  }

  childEvaluate(item) {
    for (let i = 0; i < this.predicateVars.length; i++) this.ctx[this.predicateVars[i]] = item
    return this.eval(this.predicateExpression)
  }
}

// Get the type name for namespace lookup
function debugType(v) {
  switch (typeof v) {
    case 'string':
      return 'String'
    case 'number':
      return 'Number'
    case 'boolean':
      return 'Boolean'
    case 'object':
      if (v === null) return 'null'
      if (v instanceof Uint8Array) return 'Bytes'
      if (v instanceof Date) return 'Date'
      if (Array.isArray(v)) return 'Array'
      return 'Object'
  }
  return typeof value
}

function isEqual(a, b) {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a == null || b == null) return false
  if (typeof a !== 'object') return a !== a && b !== b // eslint-disable-line no-self-compare
  if (a.constructor !== b.constructor) return false

  if (Array.isArray(a)) {
    const length = a.length
    if (length !== b.length) return false
    for (let i = 0; i < length; i++) {
      if (!isEqual(a[i], b[i])) return false
    }
    return true
  }

  if (a instanceof RegExp) return a.source === b.source && a.flags === b.flags
  if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf()
  if (a.toString !== Object.prototype.toString) return a.toString() === b.toString()

  if (a instanceof Uint8Array) {
    if (!(b instanceof Uint8Array)) return false
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
    }
    return true
  }

  if (a instanceof Map) {
    if (a.size !== b.size) return false
    for (const [key, value] of a) if (!b.has(key) || !isEqual(value, b.get(key))) return false
    return true
  }

  if (a instanceof Set) {
    if (a.size !== b.size) return false
    for (const value of a) if (!b.has(value)) return false
    return true
  }

  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false

  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i]
    if (!(key in b) || !isEqual(a[key], b[key])) return false
  }

  return true
}

export class ParseError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ParseError'
  }
}
export class EvaluationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'EvaluationError'
  }
}

export function parse(expression) {
  const ast = new Parser(expression).parse()
  // eslint-disable-next-line no-shadow
  const evaluate = (context, functions) => new Evaluator(context, functions).eval(ast)
  evaluate.ast = ast
  return evaluate
}

export function evaluate(expression, context, functions) {
  const ast = new Parser(expression).parse()
  return new Evaluator(context, functions).eval(ast)
}

function objectGet(obj, key) {
  if (typeof obj !== 'object' || obj === null) return
  if (Array.isArray(obj)) return typeof key === 'number' ? obj[key] : undefined
  if (obj instanceof Map) return obj.get(key)
  if (obj instanceof Uint8Array) return typeof key === 'number' ? obj[key] : undefined
  return Object.hasOwn(obj, key) ? obj[key] : undefined
}

export default {
  parse,
  evaluate,
  ParseError,
  EvaluationError
}
