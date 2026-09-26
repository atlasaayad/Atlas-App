// ESLint 9 flat config for the Vite/React client. Real errors (undefined
// variables, broken hook rules, duplicate keys, unreachable code, ...) fail
// `npm run lint`; purely stylistic findings are reported as warnings only.
import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      'react-hooks/rules-of-hooks': 'error',
      // Style / hygiene → warnings, never a failed lint run.
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': 'warn',
      'react/prop-types': 'off', // the project doesn't use PropTypes
      'react/no-unescaped-entities': 'warn',
    },
  },
  {
    // Node-side config files (vite, tailwind, postcss, this file).
    files: ['*.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
]
