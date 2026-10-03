import { METRICS } from "./metrics";

/** The metric picker above the results matrix. */
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
