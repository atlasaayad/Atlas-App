/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#05090F',
          900: '#0C1A2E',
          800: '#0F1F38',
          700: '#142A47',
          600: '#1B3A5C',
        },
        turquoise: {
          DEFAULT: '#2BF0D9',
          dim: '#1B8F84',
          soft: 'rgba(43,240,217,0.12)',
        },
        status: {
          good: '#34D399',
          warn: '#FBBF24',
          bad: '#F87171',
        },
        // Distinct from status.warn on purpose — the early-warning banner is
        // a different signal (a trend, ahead of the normal red/yellow/green
        // snapshot state), so it needs its own visual identity.
        amber: {
          DEFAULT: '#F59E0B',
          soft: 'rgba(245,158,11,0.12)',
        },
        // Gold accent family for the ATLAS PREDICT sub-app (client/src/predict).
        gold: {
          DEFAULT: '#D4AF37',
          bright: '#F5D061',
          dim: '#8A6E1E',
          soft: 'rgba(212,175,55,0.12)',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        sans: ['"Inter"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 24px rgba(43,240,217,0.25)',
        'glow-sm': '0 0 10px rgba(43,240,217,0.35)',
        'glow-bar': '0 0 4px rgba(43,240,217,0.35)',
      },
      backgroundImage: {
        'app-gradient': 'linear-gradient(180deg, #0C1A2E 0%, #05090F 100%)',
      },
    },
  },
  plugins: [],
}
