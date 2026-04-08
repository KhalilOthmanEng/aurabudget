/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Syne", "sans-serif"],
        body: ["DM Sans", "sans-serif"],
      },
      colors: {
        aura: {
          bg:       "#080b14",
          surface:  "#0e1422",
          card:     "#141927",
          border:   "#1e2a3d",
          muted:    "#2a3a55",
          text:     "#e2e8f8",
          subtle:   "#7a8aa8",
          teal:     "#00d4aa",
          tealDim:  "#00d4aa22",
          amber:    "#f59e0b",
          amberDim: "#f59e0b22",
          red:      "#ff4d6d",
          redDim:   "#ff4d6d22",
          blue:     "#3b82f6",
        },
      },
      boxShadow: {
        glow:      "0 0 40px rgba(0,212,170,0.15)",
        glowAmber: "0 0 40px rgba(245,158,11,0.12)",
        card:      "0 4px 24px rgba(0,0,0,0.4)",
        deep:      "0 8px 48px rgba(0,0,0,0.6)",
      },
      backgroundImage: {
        "noise": "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")",
      },
      animation: {
        "fade-in":    "fadeIn 0.5s ease forwards",
        "slide-up":   "slideUp 0.4s ease forwards",
        "pulse-slow": "pulse 3s ease-in-out infinite",
        "spin-slow":  "spin 8s linear infinite",
      },
      keyframes: {
        fadeIn:  { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: "translateY(16px)" }, to: { opacity: 1, transform: "translateY(0)" } },
      },
    },
  },
  plugins: [],
};
