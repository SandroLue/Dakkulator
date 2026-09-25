/**
 * Optional PostHog analytics. Disabled unless `VITE_POSTHOG_KEY` is set at
 * build time; `VITE_POSTHOG_HOST` overrides the ingestion host. The loader
 * stub lives in `index.html`.
 */
const key = import.meta.env.VITE_POSTHOG_KEY;
const host = import.meta.env.VITE_POSTHOG_HOST || "https://eu.i.posthog.com";
let enabled = false;

export function initAnalytics() {
	if (!key || window.location.hostname === "localhost") return;
	if (!window.posthog?.init) return;
	window.posthog.init(key, { api_host: host });
	enabled = true;
}

export function track(event, properties) {
	if (enabled) window.posthog.capture(event, properties);
}
