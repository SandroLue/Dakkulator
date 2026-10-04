import { useEffect, useRef, useState } from "react";

const dateFormat = new Intl.DateTimeFormat(undefined, {
	day: "2-digit",
	month: "short",
	year: "numeric",
});

/** A panel whose body folds away behind its header; the caller owns `open`. */
function CollapsiblePanel({ title, aside, open, onOpenChange, children }) {
	return (
		<div className="panel flex min-w-0 flex-col overflow-hidden">
			<button
				type="button"
				aria-expanded={open}
				onClick={() => onOpenChange?.(!open)}
				className={`panel-header w-full cursor-pointer justify-start rounded-none border-0 bg-transparent text-left font-normal hover:bg-surface-muted ${
					open ? "" : "border-b-0"
				}`}
			>
				<svg
					viewBox="0 0 24 24"
					aria-hidden="true"
					className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`}
					fill="none"
					stroke="currentColor"
					strokeWidth="2.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="m9 6 6 6-6 6" />
				</svg>
				<span className="panel-title">{title}</span>
				{aside && <span className="hint ml-auto">{aside}</span>}
			</button>
			{open && children}
		</div>
	);
}

/** Both library panels share one body height (about 6 list rows), so they line up. */
const BODY_HEIGHT = "h-[19.5rem]";

/** The lists loaded on a first visit, as opposed to the user's own uploads. */
const isExample = (entry) => String(entry.source ?? "").startsWith("example:");

/** "Imperium - Adeptus Astartes - Ultramarines" → "Ultramarines". */
const subfaction = (faction) => faction.split(" - ").at(-1);

/** The two slots, attacker first (the swap button decides which slot that is). */
const roleSlots = (slotLabel) =>
	["A", "B"].sort(
		(a, b) =>
			Number(slotLabel(b) === "Attacker") - Number(slotLabel(a) === "Attacker"),
	);

export function UploadArea({
	onFiles,
	busy,
	messages,
	open = false,
	onOpenChange,
}) {
	const inputRef = useRef(null);
	const [dragging, setDragging] = useState(false);

	useEffect(() => {
		// Safari rejects every file when `accept` lists extensions (caniuse: input-file-accept).
		const safari =
			/AppleWebKit.*Safari/.test(navigator.userAgent) &&
			!navigator.userAgent.includes("Chrome");
		if (safari) inputRef.current?.removeAttribute("accept");
	}, []);

	const onDrop = (event) => {
		event.preventDefault();
		setDragging(false);
		if (event.dataTransfer.files?.length)
			onFiles([...event.dataTransfer.files]);
	};

	return (
		<CollapsiblePanel
			title="Add army lists"
			open={open}
			onOpenChange={onOpenChange}
		>
			<div className={`flex ${BODY_HEIGHT} flex-col gap-3 overflow-auto p-4`}>
				<label
					htmlFor="roster-upload"
					onDragEnter={(event) => {
						event.preventDefault();
						setDragging(true);
					}}
					onDragOver={(event) => event.preventDefault()}
					onDragLeave={(event) => {
						if (!event.currentTarget.contains(event.relatedTarget)) {
							setDragging(false);
						}
					}}
					onDrop={onDrop}
					className={`flex min-h-[150px] flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-5 text-center transition-colors ${
						dragging
							? "border-primary bg-primary-soft"
							: "border-line-strong bg-surface-muted hover:border-primary hover:bg-primary-soft"
					}`}
				>
					<input
						ref={inputRef}
						id="roster-upload"
						type="file"
						accept=".ros,.rosz"
						multiple
						className="sr-only"
						onChange={(event) => {
							if (event.target.files?.length) onFiles([...event.target.files]);
							event.target.value = "";
						}}
					/>
					<svg
						viewBox="0 0 24 24"
						aria-hidden="true"
						className="h-9 w-9 text-primary"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
					</svg>
					<span className="text-base font-bold">
						{busy ? "Reading…" : "Drop army lists here"}
					</span>
					<span className="hint max-w-[34ch]">
						or click to browse — .ros / .rosz from New Recruit or BattleScribe,
						11th edition
					</span>
				</label>
				{messages.map((message) => (
					<div
						key={message.id}
						className={`text-sm ${message.error ? "text-danger" : "text-muted"}`}
					>
						{message.text}
					</div>
				))}
			</div>
		</CollapsiblePanel>
	);
}

export function RosterTable({
	entries,
	slots,
	slotLabel,
	onAssign,
	onRemove,
	open = false,
	onOpenChange,
}) {
	return (
		<CollapsiblePanel
			title="Your army lists"
			aside={`${entries.length} saved in this browser`}
			open={open}
			onOpenChange={onOpenChange}
		>
			{entries.length === 0 ? (
				<div
					className={`flex ${BODY_HEIGHT} items-center justify-center p-6 text-sm text-muted`}
				>
					No lists yet — upload one to get started.
				</div>
			) : (
				<div className={`${BODY_HEIGHT} overflow-auto`}>
					<table className="w-full border-collapse text-sm">
						<thead className="section-label sticky top-0 bg-surface-muted text-left">
							<tr>
								{/* The list column takes what the others leave, so actions never scroll away. */}
								<th className="w-full px-4 py-2 font-bold">List</th>
								<th className="px-3 py-2 text-right font-bold">Points</th>
								<th className="px-3 py-2 font-bold">Use as</th>
								<th className="px-4 py-2">
									<span className="sr-only">Actions</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{entries.map((entry) => (
								<tr
									key={entry.id}
									className="border-t border-line transition-colors hover:bg-surface-muted"
								>
									{/* max-w-0 lets the column width decide, so long names truncate. */}
									<td className="max-w-0 px-4 py-2">
										<div className="truncate font-semibold" title={entry.name}>
											{entry.name}
										</div>
										{/* Faction and date tell look-alike lists apart. */}
										<div
											className="truncate text-xs text-muted"
											title={entry.faction}
										>
											{subfaction(entry.faction)} ·{" "}
											{isExample(entry)
												? "Example"
												: dateFormat.format(entry.addedAt)}
										</div>
									</td>
									<td className="px-3 py-2 text-right tabular-nums">
										{entry.points}
									</td>
									<td className="whitespace-nowrap px-3 py-2">
										<span className="inline-flex gap-1">
											{/* The list's role is a badge; the other role is one click away. */}
											{roleSlots(slotLabel).map((slot) => {
												const label = slotLabel(slot);
												return slots[slot] === entry.id ? (
													<span
														key={slot}
														className={`badge ${label === "Defender" ? "bg-accent-soft text-accent" : ""}`}
													>
														{label}
													</span>
												) : (
													<button
														type="button"
														key={slot}
														className="button-small rounded-full py-0 text-xs text-muted"
														title={`Use ${entry.name} as the ${label.toLowerCase()}`}
														onClick={() => onAssign?.(slot, entry.id)}
													>
														{label}
													</button>
												);
											})}
										</span>
									</td>
									<td className="whitespace-nowrap px-4 py-2 text-right">
										<button
											type="button"
											className="button-small button-danger px-1.5"
											aria-label={`Delete ${entry.name}`}
											title="Delete this list"
											onClick={() => onRemove(entry.id)}
										>
											<svg
												viewBox="0 0 24 24"
												aria-hidden="true"
												className="h-4 w-4"
												fill="none"
												stroke="currentColor"
												strokeWidth="2"
												strokeLinecap="round"
												strokeLinejoin="round"
											>
												<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" />
											</svg>
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</CollapsiblePanel>
	);
}

export function SlotSelect({ slot, label, entries, value, onChange }) {
	const id = `slot-${slot}`;
	return (
		<div className="flex min-w-0 flex-1 items-center gap-3">
			<label htmlFor={id} className="panel-title w-24 shrink-0">
				{label}
			</label>
			<select
				id={id}
				className="min-w-0 flex-1"
				value={value ?? ""}
				onChange={(event) => onChange(event.target.value || null)}
				disabled={!entries.length}
			>
				<option value="">
					{entries.length ? "— choose an army list —" : "Upload a list first"}
				</option>
				{entries.map((entry) => (
					<option key={entry.id} value={entry.id}>
						{entry.name} · {entry.points} pts
					</option>
				))}
			</select>
		</div>
	);
}
