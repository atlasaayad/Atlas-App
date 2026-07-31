/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Warehouse / denim-inspired palette
        paper: '#F4F4F1',        // app background — warehouse white
        surface: '#FFFFFF',      // card surfaces
        ink: {
          DEFAULT: '#1B1F27',    // graphite text
          soft: '#4A5163',       // secondary text
          faint: '#8A90A0',      // tertiary / placeholder text
        },
        line: '#E4E3DD',         // hairline borders
        indigo: {
          50: '#EEF2FA',
          100: '#D6E0F2',
          300: '#7C9AD1',
          500: '#3A5FA0',
          600: '#2B4C7E',
          700: '#213C64',
          900: '#152744',
        },
        amber: {
          100: '#FBEACB',
          400: '#E8A33D',
          500: '#D4901F',
          600: '#B27314',
        },
        signal: {
          good: '#2F9E64',
          warn: '#D4901F',
          bad: '#C6493F',
          info: '#3A5FA0',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['"Inter"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      backgroundImage: {
        stitch: 'repeating-linear-gradient(90deg, currentColor 0, currentColor 6px, transparent 6px, transparent 12px)',
      },
      boxShadow: {
        card: '0 1px 2px rgba(27,31,39,0.04), 0 1px 12px rgba(27,31,39,0.05)',
      },
      borderRadius: {
        xl: '0.875rem',
      },
    },
  },
  plugins: [],
}
