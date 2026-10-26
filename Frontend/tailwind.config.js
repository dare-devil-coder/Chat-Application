/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary-bg': '#F8FAFC',
        'white': '#FFFFFF',
        'primary-text': '#111827',
        'secondary-text': '#6B7280',
        'muted-text': '#9CA3AF',
        'app-border': '#E5E7EB',
        'light-border': '#F1F5F9',
        'primary-blue': '#2563EB',
        'blue-hover': '#1D4ED8',
        'light-blue': '#EFF6FF',
        'online-green': '#22C55E',
        'offline-gray': '#9CA3AF',
        'incoming-bg': '#F1F5F9',
        'outgoing-bg': '#2563EB',
        'outgoing-text': '#FFFFFF',
        'selected-chat': '#EFF6FF',
        'search-bg': '#F8FAFC',
        'chat-ai-accent': '#4F46E5',
        'chat-ai-bg': '#EEF2FF',
        'chat-ai-border': '#C7D2FE',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      keyframes: {
        sendMsg: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        receiveMsg: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        send: 'sendMsg 180ms ease-out forwards',
        receive: 'receiveMsg 220ms ease-out forwards',
      },
      transitionDuration: {
        'sidebar': '120ms',
      },
    },
  },
  plugins: [],
};
