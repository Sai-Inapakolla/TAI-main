/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        fintech: {
          primary: '#0056b3', // Dark Blue
          secondary: '#00daa3', // Teal
          accent: '#007bff',
          dark: '#1a1a2e',
          light: '#f4f6f9'
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
