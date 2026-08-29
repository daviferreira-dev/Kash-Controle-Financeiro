import type { Config } from 'tailwindcss';

/**
 * Tokens do design system "Premium Editorial Finance".
 * Os valores vivem em src/styles/tokens.css como custom properties, para que o
 * tema escuro futuro troque apenas o bloco de variáveis (decisão R-007).
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: 'var(--color-surface)',
        'surface-dim': 'var(--color-surface-dim)',
        // Os nomes espelham exatamente as custom properties, para não haver
        // divergência entre o token CSS e a classe usada nos componentes.
        'surface-container-lowest': 'var(--color-surface-container-lowest)',
        'surface-container-low': 'var(--color-surface-container-low)',
        'surface-container': 'var(--color-surface-container)',
        'surface-container-high': 'var(--color-surface-container-high)',
        'surface-container-highest': 'var(--color-surface-container-highest)',
        'on-surface': 'var(--color-on-surface)',
        'on-surface-variant': 'var(--color-on-surface-variant)',
        primary: 'var(--color-primary)',
        'on-primary': 'var(--color-on-primary)',
        'primary-container': 'var(--color-primary-container)',
        'on-primary-container': 'var(--color-on-primary-container)',
        secondary: 'var(--color-secondary)',
        tertiary: 'var(--color-tertiary)',
        'tertiary-container': 'var(--color-tertiary-container)',
        outline: 'var(--color-outline)',
        'outline-variant': 'var(--color-outline-variant)',
        error: 'var(--color-error)',
        'on-error': 'var(--color-on-error)',
        'error-container': 'var(--color-error-container)',
        'on-error-container': 'var(--color-on-error-container)',
        income: 'var(--color-income)',
        'income-container': 'var(--color-income-container)',
        expense: 'var(--color-expense)',
        'expense-container': 'var(--color-expense-container)',
        warning: 'var(--color-warning)',
        'warning-container': 'var(--color-warning-container)',
        // Cores já com alfa embutido: o modificador de opacidade do Tailwind
        // (bg-x/30) não funciona sobre cores declaradas como var(), então os
        // casos que precisam de transparência ganham um token próprio.
        scrim: 'var(--color-scrim)',
        placeholder: 'var(--color-placeholder)',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', '"Times New Roman"', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        label: ['"Archivo Narrow"', 'Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-hero': ['3rem', { lineHeight: '3.5rem', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-hero-mobile': ['2.25rem', { lineHeight: '2.625rem', fontWeight: '700' }],
        'financial-data': ['1.5rem', { lineHeight: '2rem', fontWeight: '600' }],
        'section-header': ['0.875rem', { lineHeight: '1.25rem', letterSpacing: '0.05em', fontWeight: '700' }],
        'label-caps': ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.03em', fontWeight: '600' }],
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        sm: '0.125rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
      },
      spacing: {
        gutter: '1.5rem',
        'margin-mobile': '1.25rem',
        'margin-desktop': '4rem',
      },
      boxShadow: {
        ambient: '0 8px 32px rgba(60, 57, 52, 0.06)',
      },
    },
  },
  plugins: [],
};

export default config;
