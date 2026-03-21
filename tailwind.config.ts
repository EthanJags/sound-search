import type { Config } from "tailwindcss";

export default {
    darkMode: ["class"],
    content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		spacing: {
  			'1': '4px',
  			'2': '8px',
  			'3': '12px',
  			'4': '16px',
  			'5': '20px',
  			'6': '24px',
  			'8': '32px',
  			'10': '40px',
  			'12': '48px',
  			'16': '64px',
  			'20': '80px',
  			'24': '96px',
  		},
  		fontSize: {
  			'caption': ['11px', { lineHeight: '16px', letterSpacing: '0.02em' }],
  			'body-sm': ['12px', { lineHeight: '16px', letterSpacing: '0.01em' }],
  			'body': ['14px', { lineHeight: '20px', letterSpacing: 'normal' }],
  			'body-lg': ['16px', { lineHeight: '24px', letterSpacing: 'normal' }],
  			'title-sm': ['20px', { lineHeight: '24px', letterSpacing: '-0.02em' }],
  			'title': ['24px', { lineHeight: '28px', letterSpacing: '-0.02em' }],
  			'title-lg': ['32px', { lineHeight: '36px', letterSpacing: '-0.04em' }],
  			'display': ['48px', { lineHeight: '52px', letterSpacing: '-0.04em' }],
  		},
  		letterSpacing: {
  			'tighter': '-0.04em',
  			'tight': '-0.02em',
  			'normal': 'normal',
  			'wide': '0.01em',
  			'wider': '0.02em',
  			'widest': '0.1em',
  		},
  		colors: {
  			background: 'var(--background)',
  			foreground: 'var(--foreground)',
  			card: {
  				DEFAULT: 'var(--card)',
  				foreground: 'var(--card-foreground)'
  			},
  			popover: {
  				DEFAULT: 'var(--popover)',
  				foreground: 'var(--popover-foreground)'
  			},
  			primary: {
  				DEFAULT: 'var(--primary)',
  				foreground: 'var(--primary-foreground)'
  			},
  			secondary: {
  				DEFAULT: 'var(--secondary)',
  				foreground: 'var(--secondary-foreground)'
  			},
  			muted: {
  				DEFAULT: 'var(--muted)',
  				foreground: 'var(--muted-foreground)'
  			},
  			accent: {
  				DEFAULT: 'var(--accent)',
  				foreground: 'var(--accent-foreground)'
  			},
  			destructive: {
  				DEFAULT: 'var(--destructive)',
  				foreground: 'var(--destructive-foreground)'
  			},
  			border: 'var(--border)',
  			input: 'var(--input)',
  			ring: 'var(--ring)',
  			chart: {
  				'1': 'var(--chart-1)',
  				'2': 'var(--chart-2)',
  				'3': 'var(--chart-3)',
  				'4': 'var(--chart-4)',
  				'5': 'var(--chart-5)'
  			}
  		},
  		borderRadius: {
  			lg: '8px',
  			md: '6px',
  			sm: '4px',
  			full: '9999px',
  		},
        fontFamily: {
            sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
            display: ['var(--font-work-sans)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
        }
  	}
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
