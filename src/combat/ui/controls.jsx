import { useState } from "react";

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

/**
 * A text field with suggestions in a list styled like the selects' popups
 * (a `<datalist>` popup cannot be styled). Typing stays free-form; the list
 * filters nothing, it only offers the common values.
 */
export function ComboBox({
	id,
	value,
	selected = value,
	onChange,
	suggestions,
	placeholder,
	className = "",
	...rest
}) {
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(-1);
	const listId = `${id}-suggestions`;
	const pick = (option) => {
		onChange(option);
		setOpen(false);
	};
	const onKeyDown = (event) => {
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			const step = event.key === "ArrowDown" ? 1 : -1;
			setOpen(true);
			setActive(
				(current) => (current + step + suggestions.length) % suggestions.length,
			);
		} else if (event.key === "Enter" && open && active >= 0) {
			event.preventDefault();
			pick(suggestions[active]);
		} else if (event.key === "Escape") {
			setOpen(false);
		}
	};
	return (
		<div className="relative">
			<input
				id={id}
				type="text"
				role="combobox"
				aria-expanded={open}
				aria-controls={listId}
				aria-autocomplete="list"
				aria-activedescendant={
					open && active >= 0 ? `${listId}-${active}` : undefined
				}
				autoComplete="off"
				placeholder={placeholder}
				value={value}
				onChange={(event) => {
					onChange(event.target.value);
					setOpen(true);
				}}
				onClick={() => setOpen((current) => !current)}
				onKeyDown={onKeyDown}
				onBlur={() => setOpen(false)}
				className={`combo-input ${className}`}
				{...rest}
			/>
			{/* Focus stays in the input (aria-activedescendant), as the combobox pattern
			    asks, and a <select> cannot take free text: hence the ARIA roles. */}
			{open && (
				// biome-ignore lint/a11y: listbox of an input-driven combobox
				<div id={listId} role="listbox" className="combo-list">
					{suggestions.map((option, index) => (
						// biome-ignore lint/a11y/useFocusableInteractive: focus stays in the input
						<div
							key={option}
							// biome-ignore lint/a11y/useSemanticElements: an <option> needs a <select>
							id={`${listId}-${index}`}
							role="option"
							aria-selected={option === selected}
							data-active={index === active || undefined}
							// Before the input's blur, which would close the list first.
							onMouseDown={(event) => {
								event.preventDefault();
								pick(option);
							}}
							onMouseEnter={() => setActive(index)}
						>
							{option}
						</div>
					))}
				</div>
			)}
		</div>
	);
}

/**
 * Whether a collapsible panel is open: closed until opened, then remembered
 * per browser. Only a click stores anything, so the default can still change.
 */
export function usePanelOpen(key) {
	// A new key: the first version stored "true" for everyone on load.
	const storageKey = `panelExpanded:${key}`;
	const [open, setOpen] = useState(() => {
		try {
			return localStorage.getItem(storageKey) === "true";
		} catch {
			return false;
		}
	});
	const toggle = (next) => {
		setOpen(next);
		try {
			localStorage.setItem(storageKey, String(next));
		} catch {
			// Private mode or blocked storage: it just is not remembered.
		}
	};
	return [open, toggle];
}

/** A panel's title as the button that opens and closes it. */
export function PanelToggle({ open, onToggle, controls, children }) {
	return (
		<button
			type="button"
			aria-expanded={open}
			aria-controls={controls}
			onClick={() => onToggle(!open)}
			className="flex items-center gap-2 rounded-none border-0 bg-transparent p-0 text-inherit hover:text-primary"
		>
			<svg
				viewBox="0 0 24 24"
				aria-hidden="true"
				className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`}
				fill="none"
				stroke="currentColor"
				strokeWidth="2.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path d="m6 9 6 6 6-6" />
			</svg>
			<span className="panel-title">{children}</span>
		</button>
	);
}

/**
 * Props for a collapsible panel's header: a click anywhere on it, except on
 * its buttons and fields, opens or closes the panel. Keyboard users have the
 * `PanelToggle` button in it.
 */
export function collapsibleHeader(open, setOpen) {
	return {
		className: `panel-header cursor-pointer select-none ${open ? "" : "border-b-0"}`,
		onClick: (event) => {
			if (event.target.closest("button, a, input, select, textarea, label"))
				return;
			setOpen(!open);
		},
	};
}
