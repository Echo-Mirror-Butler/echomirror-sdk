/* eslint-env node */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  env: {
    browser: true,
    node: true,
    es2021: true,
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    'no-empty': ['error', { allowEmptyCatch: true }],
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.stories.tsx',
    '**/test/**',
  ],
}
