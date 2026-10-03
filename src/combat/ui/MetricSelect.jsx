import { METRICS } from "./metrics";

/** The metric picker; the results matrix and the comparison share one selection. */
export function MetricSelect({ value, onChange, className = "" }) {
	return (
		<select
			aria-label="Metric"
			value={value}
			onChange={(event) => onChange(event.target.value)}
			className={className}
		>
			{Object.entries(METRICS).map(([key, { label }]) => (
				<option key={key} value={key}>
					{label}
				</option>
			))}
		</select>
	);
}
