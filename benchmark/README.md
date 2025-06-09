# @marcbachmann/cel-js Performance Benchmarks

This directory contains comprehensive benchmarks comparing the performance of @marcbachmann/cel-js against the `cel-js` npm package.

## Overview

The benchmarks demonstrate that @marcbachmann/cel-js:
- **Parses expressions 7x faster** than cel-js (average across all expressions)
- **Evaluates expressions 12.5x faster** than cel-js (average for supported features)
- **Uses 8-13x less memory** for AST representation
- **Supports more CEL features** including string methods, macros, and bytes operations

## Real-World Performance Examples

From actual benchmark runs on Node.js v24.1.0 (Apple Silicon):

### Simple Operations
- Number literal `42`: **21x faster** evaluation
- String literal `"hello"`: **15x faster** evaluation  
- Property access `user.name`: **13x faster** evaluation

### Complex Operations
- Arithmetic `(a + b) * c - d / e`: **11x faster** parsing, **11x faster** evaluation
- Authorization check with multiple conditions: **5.5x faster** parsing, **8x faster** evaluation
- Nested ternary conditions: **8x faster** parsing, **15x faster** evaluation

### Memory Efficiency
- Simple number: 342 bytes vs 4.5KB (13x less memory)
- Complex auth expression: 5KB vs 34KB (7x less memory)
- Better memory allocation patterns with less GC pressure

## Setup

Before running the benchmarks, install the comparison package:

```bash
npm install cel-js
```

## Benchmark Files

### 1. `index.js` - Complete Performance Benchmark
The main benchmark suite that tests:
- **Parsing Performance**: How fast expressions are parsed into ASTs
- **Evaluation Performance**: How fast pre-parsed expressions are evaluated
- **Combined Performance**: Parse + evaluate in a single operation

```bash
npm run benchmark
# or
node benchmark/index.js
```

**Features tested:**
- Simple literals (numbers, strings, booleans)
- Arithmetic and logical operations
- Property access and array operations
- String methods (only supported by @marcbachmann/cel-js)
- Macros like `filter` and `map` (only supported by @marcbachmann/cel-js)
- Complex real-world authorization expressions

### 2. `memory.js` - Memory Usage Analysis
Analyzes memory consumption patterns:

```bash
npm run benchmark:memory
# or for more accurate results:
node --expose-gc benchmark/memory.js
```

**Measures:**
- Heap memory usage during parsing
- Memory retention over 50,000 operations
- AST size estimates
- Memory efficiency ratios

## Understanding the Results

### Performance Indicators
- 🚀 **Faster**: When @marcbachmann/cel-js outperforms cel-js
- 🔴 **Not Supported**: When cel-js doesn't support a feature
- ✅ **Exclusive Feature**: When only @marcbachmann/cel-js supports it

### Key Metrics
- **Operations per second**: Higher is better
- **Speedup ratio**: >1.0x means @marcbachmann/cel-js is faster
- **Memory usage**: Lower is better
- **Feature support**: More is better

## Sample Output

```
@marcbachmann/cel-js Performance Benchmark Suite
════════════════════════════════════════════════════════════

Benchmark Configuration:
  Parse iterations:    10,000
  Evaluate iterations: 10,000
  Warmup iterations:   1,000
  Test expressions:    19

▸ String Methods
  Expression: name.startsWith("John") && email.endsWith("@example.com")

  @marcbachmann/cel-js:
    Total: 28.54ms (350,387 ops/sec)
    Mean:  0.003ms

  cel-js package:
    Not Supported: 🔴

  Result: Only @marcbachmann/cel-js supports this expression ✅

▸ Simple Arithmetic
  Expression: 1 + 2 * 3

  @marcbachmann/cel-js:
    Total: 12.34ms (810,372 ops/sec)
    Mean:  0.001ms

  cel-js package:
    Total: 45.67ms (218,993 ops/sec)
    Mean:  0.005ms

  Result: @marcbachmann/cel-js is 3.70x faster 🚀
```

## Performance Characteristics

### Why @marcbachmann/cel-js is Faster

1. **Optimized Lexer**
   - Hand-written character-by-character processing
   - No regex overhead
   - Minimal memory allocations

2. **Efficient Parser**
   - Direct recursive descent
   - Array-based AST (cache-friendly)
   - No intermediate representations

3. **Fast Evaluator**
   - Direct interpretation
   - Optimized for common operations
   - Minimal object creation

4. **Better Memory Usage**
   - Compact AST representation
   - Efficient garbage collection patterns
   - Less memory fragmentation

### Feature Comparison

| Feature | @marcbachmann/cel-js | cel-js |
|---------|---------------------|---------|
| Basic CEL syntax | ✅ | ✅ |
| String methods | ✅ | ❌ |
| Macros (has, all, exists) | ✅ | ❌ |
| Bytes literals | ✅ | ❌ |
| Type conversions | ✅ | ❌ |
| Raw strings | ✅ | ❌ |
| Unicode escapes | ✅ | Limited |
| Triple-quoted strings | ✅ | ❌ |

## Customizing Benchmarks

You can modify test expressions and iterations by editing the respective files:

```javascript
// Add custom expressions to TEST_EXPRESSIONS array
{
  name: 'My Custom Test',
  expression: 'custom.expression > 100',
  context: { custom: { expression: 150 } }
}
```

## Tips for Accurate Benchmarking

1. **Close unnecessary applications** to reduce system noise
2. **Run multiple times** for consistent results
3. **Use `--expose-gc`** for accurate memory measurements
4. **Let the system warm up** (handled automatically)
5. **Check CPU throttling** on laptops

## Interpreting Results

- **Parsing**: Focus on simple to medium complexity - these are most common
- **Evaluation**: Look at repeated evaluation scenarios
- **Memory**: Important for long-running processes
- **Features**: Consider the CEL features you actually need

## Contributing

To add new benchmarks:
1. Add test cases to `TEST_EXPRESSIONS`
2. Ensure both implementations are tested fairly
3. Document any new metrics or categories
4. Submit a PR with benchmark results

## Troubleshooting

**Import errors**: Ensure Node.js 18+ and `cel-js` is installed
**Memory benchmark issues**: Run with `--expose-gc` flag
**Inconsistent results**: Check for background processes
