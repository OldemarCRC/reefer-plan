/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'maritime-dark': '#0A1628',
        'maritime-blue': '#2D7A9B',
        'maritime-steel': '#5B6B7D',
        'maritime-rust': '#D97642',
        'maritime-seafoam': '#4A9B6F',
        
        'temp-frozen-deep': '#1E3A5F',
        'temp-frozen': '#2D5A7B',
        'temp-frozen-light': '#3A7CA5',
        'temp-chilled': '#5FA8D3',
        'temp-cool': '#A8DADC',
        'temp-bananas': '#F4A261',
        'temp-citrus': '#E76F51',
        'temp-ambient': '#D4A574',
      },
    },
  },
}