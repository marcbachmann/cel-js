import {
  allFunctions,
  objectGet,
  RESERVED,
  TOKEN,
  TOKEN_BY_NUMBER,
  TYPES,
  Type
} from './functions.js'
import {EvaluationError, ParseError, nodePositionCache} from './errors.js'

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
        if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
          return this.readIdentifier()
        }
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
          value: BigInt(Number(BigInt(string)) >>> 0),
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

    while (this.pos < this.length) {
      const ch = input[this.pos]
      if ((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F')) {
        this.pos++
      } else if (ch === '.') {
        throw new EvaluationError('Invalid hex integer: unexpected dot', {
          pos: this.pos,
          input: this.input
        })
      } else {
        break
      }
    }

    return this._parseAsBigInt(start, this.pos, true, input[this.pos])
  }

  readNumber() {
    const input = this.input
    const start = this.pos

    const isHex =
      input[start] === '0' &&
      start + 1 < this.length &&
      (input[start + 1] === 'x' || input[start + 1] === 'X')

    if (isHex) return this.readHex()

    let isDouble = false
    while (this.pos < this.length) {
      const ch = input[this.pos]
      if (ch >= '0' && ch <= '9') {
        this.pos++
      } else if (ch === '.') {
        if (isDouble) {
          throw new EvaluationError('Invalid number: unexpected dot', {
            pos: this.pos,
            input: this.input
          })
        }
        isDouble = true
        this.pos++
      } else if ((ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F')) {
        throw new EvaluationError('Invalid number: unexpected hex digit', {
          pos: this.pos,
          input: this.input
        })
      } else {
        break
      }
    }

    if (!isDouble) return this._parseAsBigInt(start, this.pos, false, input[this.pos])
    const string = input.substring(start, this.pos)
    const value = Number(string)
    if (Number.isFinite(value)) return {type: TOKEN.NUMBER, value, pos: start}
    throw new EvaluationError(`Invalid number: ${value}`, {pos: start, input: this.input})
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
    }
    return this.readSingleQuotedString(delimiter, prefix)
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
      return {type: TOKEN.BYTES, value: bytes, pos: this.pos - chars.length - 2}
    }
    const value = prefix === 'r' ? rawValue : this.processEscapes(rawValue, false)
    return {type: TOKEN.STRING, value, pos: this.pos - chars.length}
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
        throw new EvaluationError('Newlines not allowed in single-quoted strings', {
          pos: this.pos - chars.length - 1,
          input: this.input
        })
      }

      // Handle escape sequences
      if (ch === '\\' && prefix !== 'r') {
        this.pos++ // Skip backslash
        if (this.pos >= this.length) {
          throw new EvaluationError('Unterminated escape sequence', {
            pos: this.pos - chars.length - 1,
            input: this.input
          })
        }

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
                const codePoint = Number.parseInt(hex, 16)
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
                const codePoint = Number.parseInt(hex, 16)
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
                const value = Number.parseInt(hex, 16)
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
    if (this.currentToken.type !== expectedType) {
      throw new ParseError(
        `Expected ${TOKEN_BY_NUMBER[expectedType]}, got ${TOKEN_BY_NUMBER[this.currentToken.type]}`,
        {pos: this.currentToken.pos, input: this.lexer.input}
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
    if (!this.match(TOKEN.EOF)) {
      throw new ParseError(`Unexpected character: '${this.lexer.input[this.lexer.pos - 1]}'`, {
        pos: this.currentToken.pos,
        input: this.lexer.input
      })
    }
    return result
  }

  // Expression ::= LogicalOr ('?' Ternary ':' Ternary)?  // Made right-associative
  parseExpression() {
    const expr = this.parseLogicalOr()

    if (this.match(TOKEN.QUESTION)) {
      const token = this.consume(TOKEN.QUESTION)
      const consequent = this.parseExpression() // Right-associative: parse ternary, not expression
      this.consume(TOKEN.COLON)
      const alternate = this.parseExpression() // Right-associative: parse ternary, not expression
      return this.createNode(token.pos, ['?:', expr, consequent, alternate])
    }

    return expr
  }

  // LogicalOr ::= LogicalAnd ('||' LogicalAnd)*
  parseLogicalOr() {
    let expr = this.parseLogicalAnd()

    while (this.match(TOKEN.OR)) {
      const token = this.consume(TOKEN.OR)
      const right = this.parseLogicalAnd()
      expr = this.createNode(token.pos, [token.value, expr, right])
    }

    return expr
  }

  // LogicalAnd ::= Equality ('&&' Equality)*
  parseLogicalAnd() {
    let expr = this.parseEquality()

    while (this.match(TOKEN.AND)) {
      const token = this.consume(TOKEN.AND)
      const right = this.parseEquality()
      expr = this.createNode(token.pos, [token.value, expr, right])
    }

    return expr
  }

  // Equality ::= Relational (('==' | '!=') Relational)*
  parseEquality() {
    let expr = this.parseRelational()

    while (this.match(TOKEN.EQ) || this.match(TOKEN.NE)) {
      const token = this.currentToken
      this.currentToken = this.lexer.nextToken()
      const right = this.parseRelational()
      expr = this.createNode(token.pos, [token.value, expr, right])
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
      const right = this.parseAdditive()
      expr = this.createNode(token.pos, [token.value, expr, right])
    }

    return expr
  }

  // Additive ::= Multiplicative (('+' | '-') Multiplicative)*
  parseAdditive() {
    let expr = this.parseMultiplicative()

    while (this.match(TOKEN.PLUS) || this.match(TOKEN.MINUS)) {
      const token = this.currentToken
      this.currentToken = this.lexer.nextToken()
      const right = this.parseMultiplicative()
      expr = this.createNode(token.pos, [token.value, expr, right])
    }

    return expr
  }

  // Multiplicative ::= Unary (('*' | '/' | '%') Unary)*
  parseMultiplicative() {
    let expr = this.parseUnary()

    while (this.match(TOKEN.MULTIPLY) || this.match(TOKEN.DIVIDE) || this.match(TOKEN.MODULO)) {
      const token = this.currentToken
      this.currentToken = this.lexer.nextToken()
      const right = this.parseUnary()
      expr = this.createNode(token.pos, [token.value, expr, right])
    }

    return expr
  }

  // Unary ::= ('!' | '-')* Postfix
  parseUnary() {
    if (this.match(TOKEN.NOT) || this.match(TOKEN.MINUS)) {
      const token = this.currentToken
      this.currentToken = this.lexer.nextToken()
      const operand = this.parseUnary()
      return this.createNode(token.pos, [token.value, operand])
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
          expr = this.createNode(property.pos, ['rcall', expr, property.value, args])
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
    '+'(ast, s) {
      const left = s.eval(ast[1])
      const right = s.eval(ast[2])
      const leftType = debugType(left)
      const rightType = debugType(right)
      if (leftType !== rightType) {
        throw new EvaluationError(`no such overload: ${leftType} + ${rightType}`, ast)
      }

      switch (leftType) {
        case 'Integer':
        case 'Double':
        case 'String':
          return left + right
        case 'List':
          return [...left, ...right]
        case 'Bytes': {
          const result = new Uint8Array(left.length + right.length)
          result.set(left, 0)
          result.set(right, left.length)
          return result
        }
      }

      throw new EvaluationError(`no such overload: ${leftType} + ${rightType}`, ast)
    },
    '-'(ast, s) {
      const left = s.eval(ast[1])
      const leftType = debugType(left)
      if (ast.length === 2) {
        if (leftType === 'Double' || leftType === 'Integer') return -left
        throw new EvaluationError(`no such overload: -${leftType}`, ast)
      }

      const right = s.eval(ast[2])
      const rightType = debugType(right)
      if (leftType !== rightType || !(leftType === 'Integer' || leftType === 'Double')) {
        throw new EvaluationError(`no such overload: ${leftType} - ${rightType}`, ast)
      }
      return left - right
    },
    '=='(ast, s) {
      s.__supportsEqualityOperator(ast)
      return isEqual(s.left, s.right)
    },
    '!='(ast, s) {
      s.__supportsEqualityOperator(ast)
      return !isEqual(s.left, s.right)
    },
    '<'(ast, s) {
      s.__supportsRelationalOperator(ast)
      return s.left < s.right
    },
    '<='(ast, s) {
      s.__supportsRelationalOperator(ast)
      return s.left <= s.right
    },
    '>'(ast, s) {
      s.__supportsRelationalOperator(ast)
      return s.left > s.right
    },
    '>='(ast, s) {
      s.__supportsRelationalOperator(ast)
      return s.left >= s.right
    },
    '*'(ast, s) {
      s.__verifyNumberOverload(ast)
      return s.left * s.right
    },
    '/'(ast, s) {
      s.__verifyNumberOverload(ast)
      if (s.right === 0 || s.right === 0n) throw new EvaluationError('division by zero')
      return s.left / s.right
    },
    '%'(ast, s) {
      s.__verifyIntOverload(ast)
      if (s.right === 0 || s.right === 0n) throw new EvaluationError('modulo by zero')
      return s.left % s.right
    },
    '!'(ast, s) {
      const right = s.eval(ast[1])
      if (typeof right === 'boolean') return !right
      throw new EvaluationError('NOT operator can only be applied to boolean values')
    },
    in(ast, s) {
      const left = s.eval(ast[1])
      const right = s.eval(ast[2])

      if (typeof right === 'string') return typeof left === 'string' && right.includes(left)
      if (right instanceof Set) return right.has(left)
      if (Array.isArray(right)) {
        if (typeof left === 'bigint') return right.includes(left) || right.includes(Number(left))
        return right.includes(left)
      }
      return objectGet(right, left) !== undefined
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
      const functionName = ast[2]
      const receiver = s.eval(ast[1])
      const type = debugType(receiver)
      const fn = s.fns.get(functionName, type)
      if (!fn) {
        throw new EvaluationError(
          `Function not found: '${functionName}' for value of type '${type}'`,
          ast
        )
      }

      if (fn.macro) return fn.handler.call(s, receiver, ...ast[3])
      return fn.handler(receiver, ...ast[3].map((arg) => s.eval(arg)))
    },
    call(ast, s) {
      const functionName = ast[1]
      const fn = s.fns.get(functionName)
      if (!fn?.standalone) {
        throw new EvaluationError(`Function not found: '${functionName}'`, ast)
      }

      if (fn.macro) return fn.handler.call(s, ...ast[2])
      return fn.handler(...ast[2].map((arg) => s.eval(arg)))
    },
    array(ast, s) {
      const elements = ast[1]
      const result = new Array(elements.length)
      for (let i = 0; i < elements.length; i++) result[i] = s.eval(elements[i])
      return result
    },
    object(ast, s) {
      const result = {}
      for (let i = 0; i < ast[1].length; i++) {
        const e = ast[1][i]
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
    }
  })
)

// handler aliases
handlers.set('.', handlers.get('[]'))

class Evaluator {
  handlers = handlers
  left = undefined
  right = undefined
  predicateEvaluator(receiver, functionName, args) {
    return new PredicateEvaluator(this, receiver, functionName, args)
  }

  __supportsEqualityOperator(ast) {
    const leftType = debugType((this.left = this.eval(ast[1])))
    const rightType = debugType((this.right = this.eval(ast[2])))
    if (leftType === rightType) return

    // Allow numeric type cross-compatibility for equality/inequality operators
    // when at least one operand is dynamic (contains variable references)
    if (
      (leftType === 'Double' || leftType === 'Integer') &&
      (rightType === 'Double' || rightType === 'Integer') &&
      (this.isDynamic(ast[1]) || this.isDynamic(ast[2]))
    ) {
      return
    }

    throw new EvaluationError(`no such overload: ${leftType} ${ast[0]} ${rightType}`, ast)
  }
  __supportsRelationalOperator(ast) {
    const leftType = debugType((this.left = this.eval(ast[1])))
    const rightType = debugType((this.right = this.eval(ast[2])))

    switch (leftType) {
      case 'Integer':
      case 'Double':
        // Always allow Integer/Double cross-compatibility for relational operators
        if (rightType === 'Integer' || rightType === 'Double') return
        break
      case 'String':
        if (rightType === 'String') return
        break
      case 'Timestamp':
        if (rightType === 'Timestamp') return
        break
    }

    throw new EvaluationError(`no such overload: ${leftType} ${ast[0]} ${rightType}`, ast)
  }
  __verifyNumberOverload(ast) {
    const leftType = debugType((this.left = this.eval(ast[1])))
    const rightType = debugType((this.right = this.eval(ast[2])))
    if (leftType === rightType && (leftType === 'Integer' || leftType === 'Double')) return
    throw new EvaluationError(`no such overload: ${leftType} ${ast[0]} ${rightType}`, ast)
  }
  __verifyIntOverload(ast) {
    const leftType = debugType((this.left = this.eval(ast[1])))
    const rightType = debugType((this.right = this.eval(ast[2])))
    if (leftType === rightType && leftType === 'Integer') return
    throw new EvaluationError(`no such overload: ${leftType} ${ast[0]} ${rightType}`, ast)
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
      case '+':
      case '-':
      case '[]':
        return this.isDynamic(ast[1]) || this.isDynamic(ast[2])
      case '?:':
        return this.isDynamic(ast[2]) || this.isDynamic(ast[3])
      case 'rcall':
      case 'call': {
        for (let i = 1; i < ast.length; i++) {
          if (this.isDynamic(ast[i])) return true
        }
        return false
      }
      case 'array':
        return true
      case 'object':
        return true
    }

    return false
  }
}

class InstanceFunctions {
  constructor(fns) {
    const normalized = Object.create(null)
    for (const key in fns) {
      const fn = fns[key]
      if (typeof fn === 'function') {
        normalized[key] = {
          standalone: true,
          instances: new Set(),
          handler: fn
        }
      } else if (typeof fn === 'object') {
        for (const sfn in fn) {
          normalized[sfn] = {
            standalone: false,
            instances: new Set([key]),
            handler: fn[sfn]
          }
        }
      }
    }

    this.instanceFunctions = normalized
  }

  get(name, type) {
    if (type) return this.instanceFunctions[type]?.[name] || allFunctions[type]?.[name]
    return this.instanceFunctions[name] || allFunctions[name]
  }
}

class PredicateEvaluator extends Evaluator {
  constructor(parent, receiver, functionName, args) {
    if (args.length !== 2) {
      throw new EvaluationError(`${functionName}(var, predicate) requires exactly 2 arguments`)
    }

    if (args[0]?.[0] !== 'id') {
      throw new EvaluationError(
        `${functionName}(var, predicate) invalid predicate iteration variable`
      )
    }

    super()
    this.ctx = {...parent.ctx}
    this.fns = parent.fns
    this.functionName = functionName
    this.predicateVariable = args[0][1]
    this.predicateExpression = args[1]
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

  extractVariablesOfExpression(expr, vars = new Set()) {
    if (!Array.isArray(expr) || expr.length === 0) return vars

    if (expr[0] === 'id') {
      if (expr[1]?.length === 1 && !Object.hasOwn(this.ctx, expr[1])) vars.add(expr[1])
      return vars
    }

    for (let i = 1; i < expr.length; i++) this.extractVariablesOfExpression(expr[i], vars)
    return vars
  }

  childEvaluateBool(item) {
    const bool = this.childEvaluate(item)
    if (typeof bool === 'boolean') return bool
    throw new EvaluationError(`${this.functionName}() predicate result is not a boolean`)
  }

  childEvaluate(item) {
    this.ctx[this.predicateVariable] = item
    return this.eval(this.predicateExpression)
  }
}

// Get the type name for namespace lookup
function debugType(v) {
  switch (typeof v) {
    case 'string':
      return 'String'
    case 'bigint':
      return 'Integer'
    case 'number':
      return 'Double'
    case 'boolean':
      return 'Boolean'
    case 'object':
      if (v === null) return 'null'
      if (v.constructor === Object || v instanceof Map || !v.constructor) return 'Map'
      if (Array.isArray(v)) return 'List'
      if (v instanceof Uint8Array) return 'Bytes'
      if (v instanceof Date) return 'Timestamp'
      if (v instanceof Type) return 'Type'
  }
  throw new EvaluationError(`Unsupported type: ${v?.constructor?.name || typeof v}`)
}

function isEqual(a, b) {
  if (a === b) return true
  switch (debugType(a)) {
    case 'String':
      return false
    case 'Double':
      // eslint-disable-next-line eqeqeq
      if (typeof b === 'bigint') return a == b
      return false
    case 'Integer':
      // eslint-disable-next-line eqeqeq
      return a == b
    case 'Boolean':
      return false
    case 'Type':
      return false
    case 'null':
      return false
    case 'Map': {
      if (debugType(b) !== 'Map') return false

      if (a instanceof Map && b instanceof Map) {
        if (a.size !== b.size) return false
        for (const [key, value] of a) if (!(b.has(key) && isEqual(value, b.get(key)))) return false
        return true
      }

      if (a instanceof Map || b instanceof Map) {
        const obj = a instanceof Map ? b : a
        const map = a instanceof Map ? a : b
        const keysObj = Object.keys(obj)
        if (map.size !== keysObj.length) return false
        for (const [key, value] of map) {
          if (!(key in obj && isEqual(value, obj[key]))) return false
        }
        return true
      }

      const keysA = Object.keys(a)
      const keysB = Object.keys(b)
      if (keysA.length !== keysB.length) return false

      for (let i = 0; i < keysA.length; i++) {
        const key = keysA[i]
        if (!(key in b && isEqual(a[key], b[key]))) return false
      }
      return true
    }
    case 'Bytes': {
      if (a.length !== b.length) return false
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false
      }
      return true
    }
    case 'Timestamp':
      return b instanceof Date && a.getTime() === b.getTime()
    case 'List': {
      if (Array.isArray(a) && Array.isArray(b)) {
        const length = a.length
        if (length !== b.length) return false
        for (let i = 0; i < length; i++) {
          if (!isEqual(a[i], b[i])) return false
        }
        return true
      }

      if (a instanceof Set && b instanceof Set) {
        if (a.size !== b.size) return false
        for (const value of a) if (!b.has(value)) return false
        return true
      }

      const arr = a instanceof Set ? b : a
      const set = a instanceof Set ? a : b
      if (!Array.isArray(arr)) return false
      if (arr.length !== set.size) return false
      for (let i = 0; i < arr.length; i++) if (!set.has(arr[i])) return false
      return true
    }
    default:
      if (a instanceof RegExp) return a.source === b.source && a.flags === b.flags
      throw new EvaluationError(`Cannot compare values of type ${typeof a}`)
  }
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

export {ParseError, EvaluationError}

export default {
  parse,
  evaluate,
  ParseError,
  EvaluationError
}
