import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['extension/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script', // MV3 service workers are classic scripts, not ES modules
      globals: {
        ...globals.browser,
        chrome: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef':       'error',
      'no-console':     'off',
      'eqeqeq':         'error',
      'prefer-const':   'error',
    },
  },
];
