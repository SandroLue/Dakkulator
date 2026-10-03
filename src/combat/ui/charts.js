/** Recharts styling shared by the breakdown and the comparison view. */

export const percent = (value) => `${(value * 100).toFixed(1)}%`;

export const AXIS = {
	stroke: "var(--color-muted)",
	tick: { fill: "var(--color-muted)" },
};

export const axisLabel = (value, position = "insideBottom") => ({
	value,
	position,
	offset: -8,
	fill: "var(--color-muted)",
});

export const GRID = {
	strokeDasharray: "3 3",
	stroke: "var(--color-border)",
};

export const TOOLTIP = {
	cursor: { fill: "var(--primary-color-transparent)" },
	contentStyle: {
		background: "var(--color-surface-raised)",
		border: "1px solid var(--color-border-strong)",
		borderRadius: 8,
		color: "var(--color-text)",
	},
};

const reducedMotion =
	typeof window !== "undefined" &&
	window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Bars glide from the previous values to the new ones when the data changes
 * (e.g. after a battlefield toggle) instead of being redrawn from scratch.
 */
export const BAR_ANIMATION = {
	isAnimationActive: !reducedMotion,
	animationDuration: 300,
	animationEasing: "ease-out",
};
