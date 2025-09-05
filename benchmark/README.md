# @marcbachmann/cel-js Performance Benchmarks

This directory contains comprehensive benchmarks comparing the performance of @marcbachmann/cel-js against the `cel-js` npm package.

## Overview

The benchmarks demonstrate that @marcbachmann/cel-js:
- **Parses expressions 3.38x faster** on average (range: 1.62x - 10.91x)
- **Evaluates expressions 12.94x faster** on average (range: 5.88x - 28.54x)
- **Combined parse+eval 6.10x faster** on average (range: 1.07x - 18.92x)
- **Supports more CEL features** including string methods, macros, and bytes operations

## Real-World Performance Examples

From actual benchmark runs on Node.js v24.6.0 (Darwin ARM64):

### Simple Operations
- Number literal `42`: **5.36x faster** parsing, **17.88x faster** evaluation
- Boolean literal `true`: **5.85x faster** parsing, **19.66x faster** evaluation
- String literal `"hello world"`: **2.60x faster** parsing, **15.16x faster** evaluation
- Property access `user.name`: **2.70x faster** parsing, **10.28x faster** evaluation

### Collection Operations  
- Array creation `[1,2,3,4,5]`: **10.91x faster** parsing, **28.54x faster** evaluation
- Map creation `{"foo": 1, ...}`: **6.69x faster** parsing, **21.80x faster** evaluation
- Array membership `"admin" in roles`: **1.91x faster** parsing, **12.07x faster** evaluation
- Map access `config["timeout"]`: **2.31x faster** parsing, **11.04x faster** evaluation

### Complex Operations
- Arithmetic `(a + b) * c - (d / e)`: **2.19x faster** parsing, **7.30x faster** evaluation
- Authorization check: **1.63x faster** parsing, **5.88x faster** evaluation
- Nested ternary conditions: **2.84x faster** parsing, **12.35x faster** evaluation
- List comprehension `filter().map()`: **2.29x faster** parsing, **7.46x faster** evaluation

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
  Warmup iterations:   5,000
  Test expressions:    21

Comparing against: cel-js package
Platform: darwin arm64
Node.js: v24.6.0

============================================================
EVALUATION PERFORMANCE
============================================================

▸ Array Creation
  Expression: [1, 2, 3, 4, 5]

  @marcbachmann/cel-js:
    Total: 0.71ms (14,046,581 ops/sec)
    Mean:  0.000ms

  cel-js package:
    Total: 20.32ms (492,192 ops/sec)
    Mean:  0.002ms

  Result: @marcbachmann/cel-js is 28.54x faster 🚀

▸ String Methods
  Expression: name.startsWith("John") && email.endsWith("@example.com")

  @marcbachmann/cel-js:
    Total: 2.60ms (3,839,324 ops/sec)
    Mean:  0.000ms

  cel-js package:
    Not Supported: 🔴

  Result: Only @marcbachmann/cel-js supports this expression ✅
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
| **Basic Operations** | | |
| Basic CEL syntax | ✅ | ✅ |
| Arithmetic operators | ✅ | ✅ |
| Logical operators | ✅ | ✅ |
| Comparison operators | ✅ | ✅ |
| **Advanced Features** | | |
| String methods (`startsWith`, `endsWith`, `contains`, `matches`) | ✅ | ❌ |
| Macros (`has`, `all`, `exists`, `exists_one`, `map`, `filter`) | ✅ | ❌ |
| Bytes literals (e.g., `b"hello"`) | ✅ | ❌ |
| Type conversions (`string()`, `bytes()`, `timestamp()`) | ✅ | ❌ |
| Function calls (`size()`, etc.) | ✅ | ❌ |
| Raw strings (e.g., `r"\n"`) | ✅ | ❌ |
| Unicode escapes (`\u`, `\U`) | ✅ | Limited |
| Triple-quoted strings | ✅ | ❌ |

### Performance Summary Table

| Expression Type | Parse Speedup | Evaluate Speedup | Combined Speedup |
|----------------|---------------|------------------|------------------|
| Simple Number (42) | 5.36x | 17.88x | 17.87x |
| Simple Boolean (true) | 5.85x | 19.66x | 18.92x |
| Simple String | 2.60x | 15.16x | 5.57x |
| Basic Arithmetic | 2.77x | 11.08x | 5.63x |
| Complex Arithmetic | 2.19x | 7.30x | 3.49x |
| Variable Access | 2.70x | 10.28x | 4.23x |
| Deep Property Access | 1.62x | 8.12x | 2.49x |
| Array Index Access | 3.96x | 13.54x | 6.69x |
| Array Creation | 10.91x | 28.54x | 13.72x |
| Map Creation | 6.69x | 21.80x | 9.28x |
| Logical Expression | 2.31x | 9.90x | 4.19x |
| Complex Authorization | 1.63x | 5.88x | 2.16x |
| List Comprehension | 2.29x | 7.46x | 3.59x |
| **Average** | **3.38x** | **12.94x** | **6.10x** |

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
