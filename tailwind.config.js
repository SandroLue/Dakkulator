/** @type {import('tailwindcss').Config} */
export default {
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
	theme: {
		extend: {
			colors: {
				bg: "var(--color-bg)",
				surface: {
					DEFAULT: "var(--color-surface)",
					muted: "var(--color-surface-muted)",
					raised: "var(--color-surface-raised)",
				},
				line: {
					DEFAULT: "var(--color-border)",
					strong: "var(--color-border-strong)",
				},
				ink: "var(--color-text)",
				muted: "var(--color-muted)",
				primary: {
					DEFAULT: "var(--primary-color)",
					hover: "var(--primary-color-hover)",
					soft: "var(--primary-color-transparent)",
					ink: "var(--primary-ink)",
				},
				accent: {
					DEFAULT: "var(--color-accent)",
					soft: "var(--color-accent-transparent)",
				},
				danger: {
					DEFAULT: "var(--color-danger)",
					soft: "var(--color-danger-transparent)",
				},
				info: {
					DEFAULT: "var(--color-info)",
					soft: "var(--color-info-transparent)",
				},
			},
			fontFamily: {
				display: ["Bangers", "Impact", "sans-serif"],
			},
		},
	},
	plugins: [],
};
