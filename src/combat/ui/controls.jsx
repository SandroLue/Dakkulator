export function Toggle({
	pressed,
	onChange,
	className = "",
	children,
	...rest
}) {
	return (
		<button
			type="button"
			aria-pressed={Boolean(pressed)}
			onClick={() => onChange(!pressed)}
			className={`toggle ${className}`}
			{...rest}
		>
			{children}
		</button>
	);
}

export function Segmented({ value, options, onChange, label, className = "" }) {
	return (
		<fieldset className={`segmented ${className}`} aria-label={label}>
			{options.map(([key, text, hint]) => (
				<button
					type="button"
					key={key}
					aria-pressed={value === key}
					onClick={() => onChange(key)}
				>
					{text}
					{hint && <span className="hint">{hint}</span>}
				</button>
			))}
		</fieldset>
	);
}

export const REROLL_OPTIONS = [
	["none", "None"],
	["ones", "1s"],
	["all", "All"],
];
