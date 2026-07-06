import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#FDFCFA',
          100: '#FBF7F0',
          200: '#F8F1E6',
          300: '#F3E9D8',
          400: '#EDE0C9',
        },
        ink: {
          900: '#2A2620',
          800: '#3A352F',
          700: '#4A453E',
          600: '#5A554D',
          500: '#6A655C',
        },
        warmAccent: {
          500: '#D97A4E',
          600: '#C4683E',
        },
        amber: {
          500: '#E0A458',
          600: '#CC924A',
        },
        success: {
          500: '#10B981',
          600: '#059669',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-fraunces)', 'Georgia', 'serif'],
      },
      borderRadius: {
        'warm': '12px',
        'warm-lg': '16px',
      },
      boxShadow: {
        'warm': '0 2px 8px rgba(42, 38, 32, 0.08)',
        'warm-lg': '0 4px 16px rgba(42, 38, 32, 0.12)',
      },
    },
  },
  plugins: [],
};

export default config;
