const c = (v) => `rgb(var(--${v}) / <alpha-value>)`
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: { page: c('page'), card: c('card'), soft: c('soft'), line: c('line'), ink: c('ink'), mute: c('mute'),
        brand: '#4f46e5', brand2: '#7c3aed', accent: c('accent'), accent2: c('accent2'), good: c('good'), bad: c('bad'), warn: c('warn') },
      boxShadow: { card: '0 1px 2px rgb(0 0 0 / .04), 0 4px 16px rgb(0 0 0 / .04)' },
      keyframes: {
        rise: { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } },
        blink: { '50%': { opacity: 0 } },
        dots: { '0%,80%,100%': { transform: 'scale(.6)', opacity: .4 }, '40%': { transform: 'scale(1)', opacity: 1 } },
      },
      animation: { rise: 'rise .25s ease-out both', blink: 'blink 1s steps(2) infinite', dots: 'dots 1.2s infinite ease-in-out both' },
    },
  },
  plugins: [],
}
