import baseConfig from './base.mjs';
import tseslint from 'typescript-eslint';

export const nestConfig = tseslint.config(...baseConfig, {
  files: ['**/*.ts'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
});

export default nestConfig;
