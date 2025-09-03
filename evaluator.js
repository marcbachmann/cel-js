import {allFunctions, objectGet, RESERVED, TOKEN, TOKEN_BY_NUMBER} from './functions.js'
import {EvaluationError, ParseError} from './errors.js'

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

class Evaluator {
  predicateEvaluator(receiver, functionName, args) {
    return new PredicateEvaluator(this, receiver, functionName, args)
  }

  eval(ast) {
    if (typeof ast === 'object' && Array.isArray(ast)) {
      switch (ast[0]) {
        case 'id': {
          const val = objectGet(this.ctx, ast[1])
          if (val === undefined) throw new EvaluationError(`Unknown variable: ${ast[1]}`)
          return val
        }
        case '||': {
          try {
            const left = this.eval(ast[1])
            if (left === true) return true
            if (typeof left !== 'boolean')
              throw new EvaluationError('Left operand of || is not a boolean')
          } catch (err) {
            if (err.message.includes('Unknown variable')) throw err
            if (err.message.includes('is not a boolean')) throw err

            const right = this.eval(ast[2])
            if (right === true) return true
            if (right === false) throw err

            if (typeof right !== 'boolean')
              throw new EvaluationError('Right operand of || is not a boolean')
          }

          const right = this.eval(ast[2])
          if (typeof right === 'boolean') return right
          throw new EvaluationError('Right operand of || is not a boolean')
        }
        case '&&': {
          try {
            const left = this.eval(ast[1])
            if (left === false) return false
            if (typeof left !== 'boolean') {
              throw new EvaluationError('Left operand of && is not a boolean')
            }
          } catch (err) {
            if (err.message.includes('Unknown variable')) throw err
            if (err.message.includes('is not a boolean')) throw err

            const right = this.eval(ast[2])
            if (right === false) return false
            if (right === true) throw err
            throw new EvaluationError('Right operand of && is not a boolean')
          }

          const right = this.eval(ast[2])
          if (typeof right === 'boolean') return right
          throw new EvaluationError('Right operand of && is not a boolean')
        }
        case '+': {
          const left = this.eval(ast[1])
          const right = this.eval(ast[2])
          if (typeof left !== typeof right) {
            throw new EvaluationError(`no such overload: ${debugType(left)} + ${debugType(right)}`)
          }

          switch (typeof left) {
            case 'number':
              if (Number.isFinite(right) && Number.isFinite(left)) return left + right
              break
            case 'string':
              return left + right
            case 'object':
              if (!left || left.constructor !== right?.constructor) break

              if (left instanceof Uint8Array && right instanceof Uint8Array) {
                const result = new Uint8Array(left.length + right.length)
                result.set(left, 0)
                result.set(right, left.length)
                return result
              }

              if (
                (Array.isArray(left) || left instanceof Set) &&
                (Array.isArray(right) || right instanceof Set)
              ) {
                return [...left, ...right]
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
        case '==':
        case '!=':
        case '<':
        case '<=':
        case '>':
        case '>=': {
          const left = this.eval(ast[1])
          const right = this.eval(ast[2])

          const op = ast[0]
          if (
            (typeof left === 'string' || typeof left === 'number') &&
            typeof left !== typeof right
          ) {
            throw new EvaluationError(
              `no such overload: ${debugType(left)} ${op} ${debugType(right)}`
            )
          }

          switch (op) {
            case '==':
              return isEqual(left, right)
            case '!=':
              return !isEqual(left, right)
            case '<':
              return left < right
            case '<=':
              return left <= right
            case '>':
              return left > right
            case '>=':
              return left >= right
            default:
              throw new EvaluationError(`Unknown operator: ${op}`)
          }
        }
        case '*':
        case '/':
        case '%': {
          const left = this.eval(ast[1])
          const right = this.eval(ast[2])
          const op = ast[0]
          if (typeof left !== 'number' || typeof right !== 'number') {
            throw new EvaluationError(
              `no such overload: ${debugType(left)} ${op} ${debugType(right)}`
            )
          }

          switch (op) {
            case '*':
              return left * right
            case '/':
              if (right === 0) throw new EvaluationError('division by zero')
              return left / right
            case '%':
              if (right === 0) throw new EvaluationError('modulo by zero')
              return left % right
            default:
              throw new EvaluationError(`Unknown operator: ${op}`)
          }
        }
        case '!': {
          const right = this.eval(ast[1])
          if (typeof right === 'boolean') return !right
          throw new EvaluationError('NOT operator can only be applied to boolean values')
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
          const receiver = this.eval(ast[1])
          const type = debugType(receiver)
          const fn = this.fns.get(functionName, type)
          if (!fn) {
            throw new EvaluationError(
              `Function not found: '${functionName}' for value of type '${type}'`
            )
          }

          if (fn.macro) return fn.handler.call(this, receiver, ...ast[3])
          return fn.handler(receiver, ...ast[3].map((arg) => this.eval(arg)))
        }
        case 'call': {
          const functionName = ast[1]
          const fn = this.fns.get(functionName)
          if (!fn?.standalone) {
            throw new EvaluationError(`Function not found: '${functionName}'`)
          }

          if (fn.macro) return fn.handler.call(this, ...ast[2])
          return fn.handler(...ast[2].map((arg) => this.eval(arg)))
        }
        case 'array':
          return ast[1].map((el) => this.eval(el))

        case 'object': {
          const result = {}
          for (const [key, value] of ast[1]) {
            result[this.eval(key)] = this.eval(value)
          }
          return result
        }
        case '?:': {
          const condition = this.eval(ast[1])
          if (typeof condition !== 'boolean') {
            throw new EvaluationError('Ternary condition must be a boolean')
          }
          return condition ? this.eval(ast[2]) : this.eval(ast[3])
        }
        default:
          throw new EvaluationError(`Unknown operation: ${ast[0]}`)
      }
    } else {
      // Primitive values
      return ast
    }
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
    case 'number':
      return 'Number'
    case 'boolean':
      return 'Boolean'
    case 'object':
      if (v === null) return 'null'
      if (v instanceof Uint8Array) return 'Bytes'
      if (v instanceof Date) return 'Timestamp'
      if (Array.isArray(v)) return 'List'
      return 'Map'
  }
  return typeof value
}

function isEqual(a, b) {
  if (a === b) return true
  switch (typeof a) {
    case 'string':
      return false
    case 'number':
      // isNaN check
      // eslint-disable-next-line no-self-compare
      return a === b || (a !== a && b !== b)
    case 'boolean':
      return false
    case 'object': {
      if (a === null || typeof b !== 'object' || a.constructor !== b.constructor) return a === b

      if (a.constructor === Object || !a.constructor) {
        const keysA = Object.keys(a)
        const keysB = Object.keys(b)
        if (keysA.length !== keysB.length) return false

        for (let i = 0; i < keysA.length; i++) {
          const key = keysA[i]
          if (!(key in b) || !isEqual(a[key], b[key])) return false
        }
        return true
      }

      if (Array.isArray(a)) {
        const length = a.length
        if (length !== b.length) return false
        for (let i = 0; i < length; i++) {
          if (!isEqual(a[i], b[i])) return false
        }
        return true
      }

      if (a instanceof RegExp) {
        return a.source === b.source && a.flags === b.flags
      }

      if (a instanceof Uint8Array) {
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

      throw new EvaluationError(`Cannot compare values of object ${a.constructor.name || b}`)
    }
    default:
      if (a === null) return a === b
      throw new EvaluationError(`Cannot compare values of type ${typeof a}`)
  }
}

const globalEvaluator = new Evaluator()
function evaluateAST(ast, context, instanceFunctions) {
  if (context !== undefined && typeof context !== 'object')
    throw new EvaluationError('Context must be an object')

  const evaluator = globalEvaluator
  evaluator.ctx = context
  evaluator.fns = new InstanceFunctions(instanceFunctions)
  return evaluator.eval(ast)
}

export function parse(expression) {
  const ast = new Parser(expression).parse()
  // eslint-disable-next-line no-shadow
  const evaluate = (context, functions) => evaluateAST(ast, context, functions)
  evaluate.ast = ast
  return evaluate
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
