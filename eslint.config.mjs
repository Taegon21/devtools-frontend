import typescriptPlugin from '@typescript-eslint/eslint-plugin';
import mochaPlugin from 'eslint-plugin-mocha';
import rulesdirPlugin from 'eslint-plugin-rulesdir';
import importPlugin from 'eslint-plugin-import';
import jsdocPlugin from 'eslint-plugin-jsdoc';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import { join } from 'path';

rulesdirPlugin.RULES_DIR = join(
  import.meta.dirname,
  'scripts',
  'eslint_rules',
  'lib',
);

/**
 * @type {import('eslint').Linter.Config[]}
 */
export default [
  {
    ignores: [
      'front_end/diff/diff_match_patch.jD',
      'front_end/models/javascript_metadata/NativeFunctions.js',
      // All of these scripts are auto-generated so don't lint them.
      'front_end/generated/ARIAProperties.js',
      'front_end/generated/Deprecation.ts',
      'front_end/generated/InspectorBackendCommands.js',
      'front_end/generated/protocol-mapping.d.ts',
      'front_end/generated/protocol-proxy-api.d.ts',
      'front_end/generated/protocol.ts',
      // Any third_party addition has its source code checked out into
      // third_party/X/package, so we ignore that code as it's not code we author or
      // own.
      'front_end/third_party/*/package/',
      // Any JS files are also not authored by devtools-frontend, so we ignore those.
      'front_end/third_party/**/*.js',
      // Lighthouse doesn't have a package/ folder but has other nested folders, so
      // we ignore any folders within the lighthouse directory.
      'front_end/third_party/lighthouse/*/',
      // The CodeMirror bundle file is auto-generated and rolled-up as part of the',
      // install script, so we don't need to lint it.
      'front_end/third_party/codemirror.next/bundle.ts',
      // Lit lib files are auto-generated and rolled up as part of the install script.
      'front_end/third_party/lit/src/*.ts',
      // @puppeteer/replay is auto-generated.
      'front_end/third_party/puppeteer-replay/**/*.ts',

      '**/node_modules',
      'scripts/build/typescript/tests',
      'scripts/migration/**/*.js',
      'scripts/protocol_typescript/*.js',
      'scripts/deps/tests/fixtures',
      'test/**/fixtures/',
      'test/e2e/**/*.js',
      'test/shared/**/*.js',
      '**/*.d.ts',
    ],
  },
  {
    plugins: {
      '@typescript-eslint': typescriptPlugin,
      mocha: mochaPlugin,
      rulesdir: rulesdirPlugin,
      import: importPlugin,
      jsdoc: jsdocPlugin,
    },

    languageOptions: {
      globals: {
        ...globals.browser,
      },

      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },

    rules: {
      // syntax preferences
      quotes: [
        'error',
        'single',
        {
          avoidEscape: true,
          allowTemplateLiterals: false,
        },
      ],

      semi: 'error',
      'no-extra-semi': 'error',
      'comma-style': ['error', 'last'],
      'wrap-iife': ['error', 'inside'],

      'spaced-comment': [
        'error',
        'always',
        {
          markers: ['*'],
        },
      ],

      eqeqeq: 'error',

      'accessor-pairs': [
        'error',
        {
          getWithoutSet: false,
          setWithoutGet: false,
        },
      ],

      curly: 'error',
      'new-parens': 'error',
      'func-call-spacing': 'error',
      'arrow-parens': ['error', 'as-needed'],
      'eol-last': 'error',
      'object-shorthand': ['error', 'properties'],
      'no-useless-rename': 'error',

      // anti-patterns
      'no-caller': 'error',
      'no-case-declarations': 'error',
      'no-cond-assign': 'error',

      'no-console': [
        'error',
        {
          allow: [
            'assert',
            'context',
            'error',
            'timeStamp',
            'time',
            'timeEnd',
            'warn',
          ],
        },
      ],

      'no-debugger': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',

      'no-else-return': [
        'error',
        {
          allowElseIf: false,
        },
      ],

      'no-empty-character-class': 'error',
      'no-global-assign': 'error',
      'no-implied-eval': 'error',
      'no-labels': 'error',
      'no-multi-str': 'error',
      'no-new-object': 'error',
      'no-octal-escape': 'error',
      'no-self-compare': 'error',
      'no-shadow-restricted-names': 'error',
      'no-unreachable': 'error',
      'no-unsafe-negation': 'error',

      'no-unused-vars': [
        'error',
        {
          args: 'none',
          vars: 'local',
        },
      ],

      'no-var': 'error',
      'no-with': 'error',
      'prefer-const': 'error',
      radix: 'error',
      'valid-typeof': 'error',
      'no-return-assign': ['error', 'always'],
      'no-implicit-coercion': 'error',

      // es2015 features
      'require-yield': 'error',
      'template-curly-spacing': ['error', 'never'],

      // file whitespace
      'no-multiple-empty-lines': [
        'error',
        {
          max: 1,
        },
      ],
      'no-mixed-spaces-and-tabs': 'error',
      'no-trailing-spaces': 'error',
      'linebreak-style': ['error', 'unix'],

      /**
       * Disabled, aspirational rules
       */
      indent: [
        'off',
        2,
        {
          SwitchCase: 1,
          CallExpression: {
            arguments: 2,
          },
          MemberExpression: 2,
        },
      ],

      // brace-style is disabled, as eslint cannot enforce 1tbs as default, but allman for functions
      'brace-style': [
        'off',
        'allman',
        {
          allowSingleLine: true,
        },
      ],

      // key-spacing is disabled, as some objects use value-aligned spacing, some not.
      'key-spacing': [
        'off',
        {
          beforeColon: false,
          afterColon: true,
          align: 'value',
        },
      ],

      'quote-props': ['error', 'as-needed'],

      // no-implicit-globals will prevent accidental globals
      'no-implicit-globals': 'off',
      'no-unused-private-class-members': 'error',

      // Closure does not properly typecheck default exports
      'import/no-default-export': 'error',
      /**
       * Catch duplicate import paths. For example this would catch the following example:
       * import {Foo} from './foo.js'
       * import * as FooModule from './foo.js'
       **/
      'import/no-duplicates': 'error',
      // Try to spot '// console.log()' left over from debugging
      'rulesdir/no-commented-out-console': 'error',
      // Prevent imports being commented out rather than deleted.
      'rulesdir/no-commented-out-import': 'error',
      // DevTools specific rules
      'rulesdir/es-modules-import': 'error',
      'rulesdir/check-license-header': 'error',
      'rulesdir/html-tagged-template': 'error',
      /**
       * Ensures that JS Doc comments are properly aligned - all the starting
       * `*` are in the right place.
       */
      'jsdoc/check-alignment': 'error',
    },
  },
  {
    name: 'TypeScript files',
    files: ['**/*.ts'],

    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',

      parserOptions: {
        allowAutomaticSingleRunInference: true,
        project: join(
          import.meta.dirname,
          'config',
          'typescript',
          'tsconfig.eslint.json',
        ),
      },
    },

    rules: {
      // Forbids interfaces starting with an I prefix.
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'interface',
          format: ['PascalCase'],

          custom: {
            regex: '^I[A-Z]',
            match: false,
          },
        },
      ],
      '@typescript-eslint/no-explicit-any': [
        'error',
        {
          ignoreRestArgs: true,
        },
      ],

      '@typescript-eslint/explicit-member-accessibility': [
        'error',
        {
          accessibility: 'no-public',
        },
      ],

      'comma-dangle': 'off',
      '@typescript-eslint/comma-dangle': ['error', 'always-multiline'],

      // run just the TypeScript unused-vars rule, else we get duplicate errors
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
        },
      ],

      // run just the TypeScript semi rule, else we get duplicate errors
      semi: 'off',
      '@typescript-eslint/semi': 'error',

      '@typescript-eslint/member-delimiter-style': [
        'error',
        {
          multiline: {
            delimiter: 'semi',
            requireLast: true,
          },

          singleline: {
            delimiter: 'comma',
            requireLast: false,
          },

          overrides: {
            interface: {
              singleline: {
                delimiter: 'semi',
                requireLast: false,
              },

              multiline: {
                delimiter: 'semi',
                requireLast: true,
              },
            },

            typeLiteral: {
              singleline: {
                delimiter: 'comma',
                requireLast: false,
              },

              multiline: {
                delimiter: 'comma',
                requireLast: true,
              },
            },
          },
        },
      ],

      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          ignoreVoid: true,
        },
      ],

      // func-call-spacing doesn't work well with .ts
      'func-call-spacing': 'off',
      '@typescript-eslint/func-call-spacing': 'error',
      /**
       * Enforce that enum members are explicitly defined:
       * const enum Foo { A = 'a' } rather than const enum Foo { A }
       */
      '@typescript-eslint/prefer-enum-initializers': 'error',
      /**
       * Ban non-null assertion operator, e.g.:
       * this.foo!.toLowerCase()
       */
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',

      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: [
            'function',
            'accessor',
            'method',
            'property',
            'parameterProperty',
          ],
          format: ['camelCase'],
        },
        {
          selector: 'variable',

          filter: {
            // Ignore localization variables.
            regex: '^(UIStrings|str_)$',
            match: false,
          },

          format: ['camelCase'],
        },
        {
          // We are using camelCase, PascalCase and UPPER_CASE for top-level constants, allow the for now.
          selector: 'variable',
          modifiers: ['const'],
          filter: {
            // Ignore localization variables.
            regex: '^(UIStrings|str_)$',
            match: false,
          },

          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
        },
        {
          selector: 'classProperty',
          modifiers: ['static', 'readonly'],
          format: ['UPPER_CASE', 'camelCase'],
        },
        {
          selector: 'enumMember',
          format: ['UPPER_CASE'],
        },
        {
          selector: ['typeLike'],
          format: ['PascalCase'],
        },
        {
          selector: 'parameter',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
        {
          // Public methods are currently in transition and may still have leading underscores.
          selector: 'method',
          modifiers: ['public'],
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
        {
          selector: 'property',
          modifiers: ['public'],
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
        {
          // Object literals may be constructed as arguments to external libraries which follow different styles.
          selector: ['objectLiteralMethod', 'objectLiteralProperty'],
          modifiers: ['public'],
          format: null,
        },
        {
          // Ignore type properties that require quotes
          selector: 'typeProperty',
          format: null,
          modifiers: ['requiresQuotes'],
        },
      ],

      'rulesdir/no-underscored-properties': 'error',
      'rulesdir/prefer-readonly-keyword': 'error',
      'rulesdir/inline-type-imports': 'error',

      'rulesdir/enforce-default-import-name': [
        'error',
        {
          // Enforce that any import of models/trace/trace.js names the import Trace.
          modulePath: join(
            import.meta.dirname,
            'front_end',
            'models',
            'trace',
            'trace.js',
          ),
          importName: 'Trace',
        },
      ],
    },
  },

  {
    name: 'Scripts files',
    files: ['scripts/**/*'],
    rules: {
      'no-console': 'off',
    },
  },

  {
    name: 'Front-end files',
    files: ['front_end/**/*'],
    rules: {
      // L10n rules are only relevant in 'front_end'.
      'rulesdir/l10n-filename-matches': [
        'error',
        {
          rootFrontendDirectory: join(import.meta.dirname, 'front_end'),
        },
      ],
      'rulesdir/l10n-i18nString-call-only-with-uistrings': 'error',
      'rulesdir/l10n-no-i18nString-calls-module-instantiation': 'error',
      'rulesdir/l10n-no-locked-or-placeholder-only-phrase': 'error',
      'rulesdir/l10n-no-uistrings-export': 'error',
      'rulesdir/l10n-no-unused-message': 'error',
    },
  },

  {
    name: 'Front-end TypeScript files',
    files: ['front_end/**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowConciseArrowFunctionExpressionsStartingWithVoid: true,
          allowIIFEs: true,
        },
      ],
      'rulesdir/no-importing-images-from-src': 'error',
      'rulesdir/enforce-bound-render-for-schedule-render': 'error',
      'rulesdir/enforce-custom-event-names': 'error',
      'rulesdir/set-data-type-reference': 'error',
      'rulesdir/no-bound-component-methods': 'error',
      'rulesdir/no-customized-builtin-elements': 'error',
      'rulesdir/no-self-closing-custom-element-tagnames': 'error',
      'rulesdir/no-style-tags-in-lit-html': 'error',
      'rulesdir/no-a-tags-in-lit-html': 'error',
      'rulesdir/check-css-import': 'error',
      'rulesdir/enforce-optional-properties-last': 'error',
      'rulesdir/check-enumerated-histograms': 'error',
      'rulesdir/check-was-shown-methods': 'error',
      'rulesdir/static-custom-event-names': 'error',
      'rulesdir/lit-html-host-this': 'error',
      'rulesdir/lit-html-no-attribute-quotes': 'error',
      'rulesdir/lit-template-result-or-nothing': 'error',
      'rulesdir/inject-checkbox-styles': 'error',
      'rulesdir/jslog-context-list': 'error',
    },
  },

  {
    name: 'Front-end meta files',
    files: ['front_end/**/*-meta.ts'],
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'parameter',
          format: ['camelCase', 'PascalCase'],
          leadingUnderscore: 'allow',
        },
      ],
    },
  },

  {
    name: 'TypeScript test files',
    files: [
      '*.test.ts',
      // This makes the specificity greater than the front-end ts files
      'front_end/**/*.test.ts',
      'test/**/*.ts',
      '**/testing/*.ts',
      'scripts/eslint_rules/test/**/*.js',
    ],

    rules: {
      // errors on it('test') with no body
      'mocha/no-pending-tests': 'error',

      // errors on {describe, it}.only
      'mocha/no-exclusive-tests': 'error',

      'mocha/no-async-describe': 'error',
      'mocha/no-global-tests': 'error',
      'mocha/no-nested-tests': 'error',

      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',

      'rulesdir/check-test-definitions': 'error',
      'rulesdir/no-assert-strict-equal-for-arrays-and-objects': 'error',
      'rulesdir/no-assert-deep-strict-equal': 'error',
      'rulesdir/no-assert-equal': 'error',
      'rulesdir/no-assert-equal-boolean-null-undefined': 'error',
      'rulesdir/no-screenshot-test-outside-perf-panel': 'error',
      'rulesdir/prefer-assert-instance-of': 'error',
      'rulesdir/prefer-assert-is-ok': 'error',
      'rulesdir/prefer-assert-length-of': 'error',
      'rulesdir/trace-engine-test-timeouts': 'error',
    },

    settings: {
      'mocha/additionalCustomNames': [
        {
          name: 'describeWithDevtoolsExtension',
          type: 'suite',
          interfaces: ['BDD', 'TDD'],
        },
        {
          name: 'describeWithEnvironment',
          type: 'suite',
          interfaces: ['BDD', 'TDD'],
        },
        {
          name: 'describeWithLocale',
          type: 'suite',
          interfaces: ['BDD', 'TDD'],
        },
        {
          name: 'describeWithMockConnection',
          type: 'suite',
          interfaces: ['BDD', 'TDD'],
        },
        {
          name: 'describeWithRealConnection',
          type: 'suite',
          interfaces: ['BDD', 'TDD'],
        },
        {
          name: 'itScreenshot',
          type: 'testCase',
          interfaces: ['BDD', 'TDD'],
        },
      ],
    },
  },

  {
    files: [
      'front_end/panels/**/components/*.ts',
      'front_end/ui/components/**/*.ts',
      'front_end/entrypoints/**/*.ts',
    ],

    rules: {
      'rulesdir/prefer-private-class-members': 'error',
    },
  },

  {
    files: [
      'front_end/panels/recorder/**/*.ts',
      'front_end/panels/protocol_monitor/**/*.ts',
      'front_end/ui/components/suggestion_input/*.ts',
    ],
    rules: {
      // TODO(crbug/1402569): Reenable once https://github.com/microsoft/TypeScript/issues/48885 is closed.
      'rulesdir/prefer-private-class-members': 'off',
    },
  },

  {
    files: ['front_end/generated/SupportedCSSProperties.js'],
    rules: {
      'rulesdir/jslog-context-list': 'error',
    },
  },

  {
    name: 'EsLint rules test',
    files: ['scripts/eslint_rules/test/**/*.js'],
    rules: {
      'rulesdir/no-only-eslint-tests': 'error',
    },
  },

  {
    name: 'Legacy test runner',
    files: ['front_end/legacy_test_runner/**/*'],
    rules: {
      'rulesdir/es-modules-import': 'off',
    },
  },
  {
    name: 'Front end component docs',
    files: ['front_end/ui/components/docs/**/*.ts'],
    rules: {
      // This makes the component doc examples very verbose and doesn't add
      // anything, so we leave return types to the developer within the
      // component_docs folder.
      '@typescript-eslint/explicit-function-return-type': 'off',
      'rulesdir/no-style-tags-in-lit-html': 'off',
      // We use LitHtml to help render examples sometimes and we don't use
      // {host: this} as often the `this` is the window.
      'rulesdir/lit-html-host-this': 'off',
    },
  },
  {
    files: ['front_end/models/trace/handlers/**/*.ts'],
    rules: {
      'rulesdir/no-imports-in-directory': [
        'error',
        {
          bannedImportPaths: [
            join(import.meta.dirname, 'front_end', 'core', 'sdk', 'sdk.js'),
          ],
        },
      ],
    },
  },
  {
    files: ['front_end/panels/recorder/injected/**/*.ts'],
    rules: {
      // The code is rolled up and tree-shaken independently from the regular entrypoints.
      'rulesdir/es-modules-import': 'off',
    },
  },
  {
    files: ['front_end/ui/legacy/components/perf_ui/**/*.ts'],
    rules: {
      // Enable tracking of canvas save() and
      // restore() calls to try and catch bugs. Only
      // enabled in this folder because it is an
      // expensive rule to run and we do not need it
      // for any code that doesn't use Canvas.
      'rulesdir/canvas-context-tracking': 'error',
    },
  },
];
