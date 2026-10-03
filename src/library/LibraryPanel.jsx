import { useEffect, useRef, useState } from "react";

const dateFormat = new Intl.DateTimeFormat(undefined, {
	day: "2-digit",
	month: "short",
	year: "numeric",
});

/** A panel whose body folds away behind its header. */
function CollapsiblePanel({ title, aside, defaultOpen = false, children }) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<div className="panel flex min-w-0 flex-col overflow-hidden">
			<button
				type="button"
				aria-expanded={open}
				onClick={() => setOpen(!open)}
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

/** "Imperium - Adeptus Astartes - Ultramarines" → "Ultramarines". */
const subfaction = (faction) => faction.split(" - ").at(-1);

export function UploadArea({ onFiles, busy, messages, defaultOpen = false }) {
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
		<CollapsiblePanel title="Add army lists" defaultOpen={defaultOpen}>
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

export function RosterTable({ entries, slots, slotLabel, onRemove }) {
	const [confirmId, setConfirmId] = useState(null);
	const usage = (id) =>
		["A", "B"]
			.filter((slot) => slots[slot] === id)
			.map((slot) => slotLabel(slot));

	return (
		<CollapsiblePanel
			title="Your army lists"
			aside={`${entries.length} saved in this browser`}
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
								<th className="w-[40%] min-w-[10rem] px-4 py-2 font-bold">
									List
								</th>
								<th className="px-3 py-2 font-bold">Faction</th>
								<th className="px-3 py-2 text-right font-bold">Points</th>
								<th className="px-3 py-2 font-bold">Added</th>
								<th className="px-3 py-2 font-bold">In use</th>
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
									<td
										className="max-w-0 truncate px-4 py-2 font-semibold"
										title={entry.name}
									>
										{entry.name}
									</td>
									<td
										className="whitespace-nowrap px-3 py-2 text-muted"
										title={entry.faction}
									>
										{subfaction(entry.faction)}
									</td>
									<td className="px-3 py-2 text-right tabular-nums">
										{entry.points}
									</td>
									<td className="whitespace-nowrap px-3 py-2 text-muted">
										{dateFormat.format(entry.addedAt)}
									</td>
									<td className="px-3 py-2">
										<span className="inline-flex gap-1">
											{usage(entry.id).map((label) => (
												<span
													key={label}
													className={`badge ${label === "Defender" ? "bg-accent-soft text-accent" : ""}`}
												>
													{label}
												</span>
											))}
										</span>
									</td>
									<td className="whitespace-nowrap px-4 py-2 text-right">
										{confirmId === entry.id ? (
											<span className="inline-flex gap-1">
												<button
													type="button"
													className="button-small button-danger"
													onClick={() => {
														onRemove(entry.id);
														setConfirmId(null);
													}}
												>
													Delete
												</button>
												<button
													type="button"
													className="button-small"
													onClick={() => setConfirmId(null)}
												>
													Cancel
												</button>
											</span>
										) : (
											<button
												type="button"
												className="button-small button-danger"
												aria-label={`Delete ${entry.name}`}
												onClick={() => setConfirmId(entry.id)}
											>
												Delete
											</button>
										)}
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
