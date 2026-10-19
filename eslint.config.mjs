import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

/**
 * Every 'use client' module under src. A client module that imports the
 * SPONSOR_OFFERINGS catalog ships its summaries, amounts and priceEnv names to
 * the browser, so those files may not import @/lib/sponsor-offerings (client
 * copy lives in @/lib/sponsor-form-copy). The admin card queue is the one
 * allowed exception: it is behind the admin guard and needs the admin notes.
 * scripts/check-client-bundle.ts backs this up on the built chunks.
 */
const CATALOG_CLIENT_ALLOWED = new Set(['src/components/sponsor-card-queue.tsx'])
/**
 * True when the file's directive prologue contains 'use client'. Next accepts
 * the directive after a BOM, a `#!` first line, comments and other string
 * directives such as 'use strict', so those are skipped first.
 */
export function isClientModuleSource(text) {
  let body = text.replace(/^\uFEFF/, '').replace(/^#![^\n]*/, '')
  const gap = /^(?:\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*/
  for (;;) {
    body = body.replace(gap, '')
    const directive = /^(['"])((?:(?!\1)[^\\\n]|\\.)*)\1[ \t]*(?:;|(?=\s|\/[/*]|$))/.exec(body)
    if (!directive) return false
    if (directive[2] === 'use client') return true
    body = body.slice(directive[0].length)
  }
}
function clientModules(directory) {
  const found = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) found.push(...clientModules(full))
    else if (/\.(tsx?|jsx?|mjs)$/.test(entry.name) && isClientModuleSource(readFileSync(full, 'utf8'))) {
      found.push(path.relative(import.meta.dirname, full).split(path.sep).join('/'))
    }
  }
  return found
}
const CLIENT_MODULES = [
  ...clientModules(path.join(import.meta.dirname, 'src')).filter((file) => !CATALOG_CLIENT_ALLOWED.has(file)),
  // Imported by the client forms, so it must stay catalog-free too.
  'src/lib/sponsor-form-copy.ts',
]

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'data/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
      '.lighthouseci/**',
      'lighthouserc.cjs',
      'lighthouserc.quiz.cjs',
      'lighthouserc.home.cjs',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: CLIENT_MODULES,
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/lib/sponsor-offerings', '**/lib/sponsor-offerings', './sponsor-offerings', '**/sponsor-offerings'],
              allowTypeImports: true,
              message:
                "Client modules must not import the SPONSOR_OFFERINGS catalog (it ships summaries, amounts and priceEnv names to the browser). Import client copy from '@/lib/sponsor-form-copy' instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['lighthouserc.cjs'],
    languageOptions: {
      globals: {
        module: 'readonly',
        process: 'readonly',
      },
    },
  },
)
