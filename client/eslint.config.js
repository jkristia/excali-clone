// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Framework boundary: only src/app/ (the React shell) may import React.
    // Everything else is the framework-agnostic core the Angular shell will
    // reuse untouched — see REFACTOR_PLAN.md §7.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/app/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react/*', 'react-dom', 'react-dom/*', 'zustand/react'],
              message: 'Framework-agnostic core code may not import React — see REFACTOR_PLAN.md §7. Move this logic under src/app/.',
            },
          ],
        },
      ],
    },
  },
);
