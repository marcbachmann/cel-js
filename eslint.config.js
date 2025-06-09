import globals from 'globals'
import eslintConfigPrettier from 'eslint-config-prettier'

function toNewGlobalsConfig(obj) {
  for (const key in obj) {
    if (obj[key] === true) obj[key] = 'writable'
    else if (obj[key] === false) obj[key] = 'readonly'
  }
  return obj
}

export default [
  {
    ignores: ['**/.nyc_output', '**/coverage', '**/node_modules', 'bin/tag-latest.mjs']
  },
  {
    languageOptions: {
      globals: toNewGlobalsConfig({
        ...globals.node,
        ...globals.mocha,
        expect: false,
        sinon: false
      }),

      ecmaVersion: 2024,
      sourceType: 'module'
    },

    rules: {
      'accessor-pairs': 2,
      camelcase: [
        2,
        {
          properties: 'never'
        }
      ],
      'constructor-super': 2,
      curly: [2, 'multi-line', 'consistent'], // overwritten with 0 in eslintConfigPrettier
      eqeqeq: [2, 'allow-null'],
      'callback-return': [1, ['callback', 'cb', 'done']],
      'handle-callback-err': [2, '^(err|error)$'],
      'max-len': [
        'error',
        {
          code: 100,
          ignoreRegExpLiterals: true,
          ignorePattern: [
            '\\s+require\\(',
            '\\s+require\\.resolve\\(',
            'https?://',
            '\\s+it\\(',
            '\\s+import\\(',
            '\\s+describe\\('
          ].join('|')
        }
      ], // overwritten with 0 in eslintConfigPrettier
      'max-nested-callbacks': 2,
      'new-cap': [
        2,
        {
          newIsCap: true,
          capIsNew: false
        }
      ],
      'newline-per-chained-call': [
        2,
        {
          ignoreChainWithDepth: 4
        }
      ],

      'no-array-constructor': 2,
      'no-async-promise-executor': 2,
      'no-await-in-loop': 0,
      'no-caller': 2,
      'no-class-assign': 2,
      'no-cond-assign': 2,
      'no-console': [
        1,
        {
          allow: ['error']
        }
      ],
      'no-const-assign': 2,
      'no-constant-condition': [
        2,
        {
          checkLoops: false
        }
      ],
      'no-control-regex': 2,
      'no-debugger': 2,
      'no-delete-var': 2,
      'no-dupe-args': 2,
      'no-dupe-class-members': 2,
      'no-dupe-keys': 2,
      'no-duplicate-case': 2,
      'no-duplicate-imports': 2,
      'no-empty-character-class': 2,
      'no-empty-pattern': 2,
      'no-eval': 2,
      'no-ex-assign': 2,
      'no-extend-native': 2,
      'no-extra-bind': 2,
      'no-extra-boolean-cast': 2,
      'no-fallthrough': 2,
      'no-func-assign': 2,
      'no-global-assign': 2,
      'no-implied-eval': 2,
      'no-inner-declarations': [2, 'functions'],
      'no-invalid-regexp': 2,
      'no-irregular-whitespace': 2,
      'no-iterator': 2,
      'no-label-var': 2,
      'no-labels': [
        2,
        {
          allowLoop: false,
          allowSwitch: false
        }
      ],
      'no-lone-blocks': 2,
      'no-lonely-if': 2,
      'no-mixed-operators': [
        2,
        {
          groups: [
            ['+', '-', '*', '/', '%', '**'],
            ['&', '|', '^', '~', '<<', '>>', '>>>'],
            ['==', '!=', '===', '!==', '>', '>=', '<', '<='],
            ['&&', '||'],
            ['in', 'instanceof']
          ],

          allowSamePrecedence: false
        }
      ],
      'no-multi-str': 2,
      'no-native-reassign': 2,
      'no-negated-in-lhs': 2,
      'no-nested-ternary': 2,
      'no-new': 2,
      'no-new-func': 2,
      'no-new-object': 2,
      'no-new-require': 2,
      'no-new-symbol': 2,
      'no-new-wrappers': 2,
      'no-obj-calls': 2,
      'no-octal': 2,
      'no-octal-escape': 2,
      'no-path-concat': 2,
      'no-proto': 2,
      'no-promise-executor-return': 0,
      'no-redeclare': 2,
      'no-regex-spaces': 2,
      'no-return-assign': [2, 'except-parens'],
      'no-return-await': 2,
      'no-self-assign': 2,
      'no-self-compare': 2,
      'no-sequences': 2,
      'no-shadow-restricted-names': 2,
      'no-shadow': [
        'error',
        {
          allow: ['argv', 'callback', 'cb', 'done', 'err', 'params']
        }
      ],
      'no-sparse-arrays': 2,
      'no-tabs': 2, // overwritten with 0 in eslintConfigPrettier
      'no-template-curly-in-string': 2,
      'no-this-before-super': 2,
      'no-throw-literal': 2,
      'no-undef': 2,
      'no-undef-init': 2,
      'no-unexpected-multiline': 2, // overwritten with 0 in eslintConfigPrettier
      'no-unmodified-loop-condition': 2,
      'no-unneeded-ternary': [
        2,
        {
          defaultAssignment: false
        }
      ],
      'no-unreachable': 2,
      'no-unsafe-finally': 2,
      'no-unsafe-negation': 2,
      'no-unused-vars': [
        2,
        {
          vars: 'all',
          args: 'none',
          caughtErrors: 'none'
        }
      ],
      'no-useless-call': 2,
      'no-useless-computed-key': 2,
      'no-useless-constructor': 2,
      'no-useless-escape': 2,
      'no-useless-rename': 2,
      'no-var': 2,
      'no-with': 2,
      'one-var': [
        2,
        {
          initialized: 'never'
        }
      ],
      'prefer-const': [
        2,
        {
          destructuring: 'any',
          ignoreReadBeforeAssign: true
        }
      ],
      'prefer-promise-reject-errors': 2,
      'prefer-template': 2,
      quotes: [
        2,
        'single',
        {
          avoidEscape: true,
          allowTemplateLiterals: true
        }
      ], // overwritten with 0 in eslintConfigPrettier
      'require-atomic-updates': 0,
      'spaced-comment': [
        2,
        'always',
        {
          line: {
            markers: ['*package', '!', ',']
          },

          block: {
            balanced: true,
            markers: ['*package', '!', ','],
            exceptions: ['*']
          }
        }
      ],
      strict: [2, 'global'],
      'unicode-bom': [2, 'never'],
      'use-isnan': 2,
      'valid-typeof': 2,
      yoda: [2, 'never']
    }
  },
  eslintConfigPrettier // eslint-config-prettier last to overwrite conflicting rules
]
