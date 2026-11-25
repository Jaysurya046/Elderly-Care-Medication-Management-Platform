import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontSize: {
        // Elder-care specific scale (Section 7: 18px base up to 28px)
        'senior-base': ['1.125rem', { lineHeight: '1.75rem' }],
        'senior-lg': ['1.375rem', { lineHeight: '2rem' }],
        'senior-xl': ['1.625rem', { lineHeight: '2.25rem' }],
        'senior-2xl': ['2rem', { lineHeight: '2.5rem' }],
      },
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        border: 'var(--border)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        senior: {
          bg: 'var(--background)',
          text: 'var(--foreground)',
          primary: 'var(--primary)',
          success: '#15803d',
          danger: '#b91c1c',
          warning: '#b45309',
        },
      },
      minHeight: {
        'touch-target': '48px',
      },
      minWidth: {
        'touch-target': '48px',
      },
    },
  },
  plugins: [],
};

export default config;
