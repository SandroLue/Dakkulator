import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		react({
			babel: {
				plugins: [["babel-plugin-react-compiler"]],
			},
		}),
	],
	base: "/Dakkulator/",
	test: {
		coverage: {
			provider: "v8",
			include: ["src/**"],
			exclude: ["src/**/*.test.*", "src/**/__fixtures__/**", "src/main.jsx"],
			reporter: ["text-summary", "text"],
			// The engine and the list handling must stay well covered; the UI has
			// a smoke test (Calculator.test.jsx) and no minimum yet.
			thresholds: {
				"src/combat/*.js": { lines: 95, functions: 95, branches: 80 },
				"src/library/*.js": { lines: 95, functions: 90, branches: 80 },
			},
		},
	},
});
