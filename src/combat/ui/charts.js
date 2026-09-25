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

/** Distinct on the dark theme and still readable when printed. */
export const SERIES_COLORS = [
	"#7cb342",
	"#f5c518",
	"#5b9bd5",
	"#e5493c",
	"#b57edc",
	"#4dd0c8",
	"#ff9f43",
	"#ece9d8",
];
