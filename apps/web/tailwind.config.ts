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
        'senior-base': ['18px', { lineHeight: '28px' }],
        'senior-lg': ['22px', { lineHeight: '32px' }],
        'senior-xl': ['26px', { lineHeight: '36px' }],
        'senior-2xl': ['32px', { lineHeight: '42px' }],
      },
      colors: {
        senior: {
          bg: '#f8fafc',
          text: '#0f172a',
          primary: '#1d4ed8',
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
