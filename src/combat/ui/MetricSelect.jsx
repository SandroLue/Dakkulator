import { METRICS } from "./metrics";

/** The metric picker; the results matrix and the comparison share one selection. */
export function MetricSelect({ value, onChange, className = "" }) {
	return (
		<label className={`flex items-center gap-2 ${className}`}>
			<span className="text-muted">Show</span>
			<select value={value} onChange={(event) => onChange(event.target.value)}>
				{Object.entries(METRICS).map(([key, { label }]) => (
					<option key={key} value={key}>
						{label}
					</option>
				))}
			</select>
		</label>
	);
}
