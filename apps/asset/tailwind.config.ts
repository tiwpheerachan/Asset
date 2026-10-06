import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans Thai"', '"IBM Plex Sans"', '"Noto Sans SC"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        ink: { DEFAULT: '#101828', 2: '#344054', 3: '#667085', 4: '#98A2B3' },
        line: { DEFAULT: '#E4E7EC', soft: '#F0F2F5' },
        canvas: '#F5F6F8',
        brand: {
          50: '#EEF3FA', 100: '#DCE6F4', 200: '#B7CBE7', 500: '#2F5C9A', 600: '#1F4A85', 700: '#183A69', 800: '#122C50',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,0.04)',
        pop: '0 12px 32px -8px rgba(16,24,40,0.18)',
      },
    },
  },
  plugins: [],
};
export default config;
