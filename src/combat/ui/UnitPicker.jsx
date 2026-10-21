import { useMemo, useState } from "react";
import { canLead, isLeader } from "../attach";
import { buildDefenderProfiles, getUnitTotalModels } from "../profiles";
import { applyAttachments, listUnits } from "../unitList";
import { Toggle } from "./controls";

// Both sides' sections open together, so the caller owns `open`.
function AttachControls({
	entries,
	attachments,
	onChange,
	open = false,
	onOpenChange,
}) {
	// Units the datasheet does not list stay out of the dropdowns until asked for.
	const [showUnlisted, setShowUnlisted] = useState(false);
	const leaders = entries.filter((entry) => isLeader(entry.unit));
	if (!leaders.length) return null;

	const setLeader = (leaderKey, bodyguardKey) => {
		const next = { ...attachments };
		if (bodyguardKey) next[leaderKey] = bodyguardKey;
		else delete next[leaderKey];
		onChange(next);
	};

	return (
		<details
			open={open}
			onToggle={(event) => {
				// Fires for the open prop as well, so only report a real change.
				if (event.currentTarget.open !== open) {
					onOpenChange?.(event.currentTarget.open);
				}
			}}
			className="border-t border-line px-4 py-2"
		>
			<summary className="section-label cursor-pointer hover:text-ink">
				Attach leaders ({Object.keys(attachments).length})
				{/* In the header row while open; its click must not fold the section. */}
				{open && (
					// biome-ignore lint/a11y/useKeyWithClickEvents: only stops the summary's own toggle
					<span
						className="float-right -mt-1"
						onClick={(event) => event.preventDefault()}
					>
						<Toggle
							pressed={showUnlisted}
							onChange={setShowUnlisted}
							className="button-small normal-case tracking-normal"
							title="Also offer units the datasheet does not list; roster data can lag behind a new codex"
						>
							Allow attaching to all units
						</Toggle>
					</span>
				)}
			</summary>
			<div className="clear-both flex flex-col gap-1.5 pb-1 pt-2">
				{leaders.map((leader) => {
					const options = entries.filter((entry) =>
						canLead(leader.unit, entry.unit),
					);
					// Roster data can lag behind a new codex, so any other unit can still be
					// chosen. A unit already attached this way always stays in the list.
					const others = entries.filter(
						(entry) =>
							entry !== leader &&
							!isLeader(entry.unit) &&
							!options.includes(entry) &&
							(showUnlisted || attachments[leader.key] === entry.key),
					);
					return (
						<label key={leader.key} className="flex items-center gap-3 text-sm">
							<span className="min-w-0 flex-1 truncate">{leader.label}</span>
							<select
								value={attachments[leader.key] ?? ""}
								onChange={(event) => setLeader(leader.key, event.target.value)}
								disabled={!options.length && !others.length}
								className="w-[40%] shrink-0 text-xs"
							>
								<option value="">— on its own —</option>
								{options.map((entry) => (
									<option key={entry.key} value={entry.key}>
										{entry.label}
									</option>
								))}
								{others.length > 0 && (
									<optgroup label="Not listed on the datasheet">
										{others.map((entry) => (
											<option key={entry.key} value={entry.key}>
												{entry.label}
											</option>
										))}
									</optgroup>
								)}
							</select>
						</label>
					);
				})}
			</div>
		</details>
	);
}

const ROLE_GROUPS = {
	Character: "Character",
	Battleline: "Battleline",
	TR: "Dedicated Transport",
};
const TYPE_GROUPS = [
	"Infantry",
	"Mounted",
	"Beast",
	"Swarm",
	"Monster",
	"Vehicle",
	"Fortification",
];
const GROUP_ORDER = [...Object.values(ROLE_GROUPS), ...TYPE_GROUPS, "Other"];

function unitGroup(entry) {
	if (ROLE_GROUPS[entry.role]) return ROLE_GROUPS[entry.role];
	const keywords = new Set(
		[...(entry.unit.keywords || [])].map((k) => String(k).toLowerCase()),
	);
	return TYPE_GROUPS.find((t) => keywords.has(t.toLowerCase())) ?? "Other";
}

function summarise(unit) {
	const [group] = buildDefenderProfiles(unit);
	if (!group) return "";
	const models = getUnitTotalModels(unit) || 1;
	const invuln = group.invuln ? `/${String(group.invuln).trim()}+` : "";
	return `${models} model${models === 1 ? "" : "s"} · T${group.toughness} · Sv${group.save}${invuln} · W${group.wounds}`;
}

export function UnitPicker({
	header,
	roster,
	selected,
	onChange,
	attachments = {},
	onAttachmentsChange,
	// Both pickers open together, so the caller owns this.
	open = false,
	onOpenChange,
	attachOpen = false,
	onAttachOpenChange,
}) {
	const [search, setSearch] = useState("");
	const raw = useMemo(() => listUnits(roster), [roster]);
	const entries = useMemo(
		() => applyAttachments(raw, attachments),
		[raw, attachments],
	);

	const filtered = entries.filter((entry) =>
		entry.label.toLowerCase().includes(search.toLowerCase()),
	);

	const forces = [...new Set(raw.map((entry) => entry.force))];
	const grouped = new Map();
	for (const entry of filtered) {
		const group = unitGroup(entry);
		const key = forces.length > 1 ? `${entry.force} — ${group}` : group;
		if (!grouped.has(key))
			grouped.set(key, { force: entry.force, group, entries: [] });
		grouped.get(key).entries.push(entry);
	}
	const groups = [...grouped.entries()].sort(
		([, a], [, b]) =>
			forces.indexOf(a.force) - forces.indexOf(b.force) ||
			GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group),
	);

	// `selected` keeps the keys of attached leaders too; count the units as shown.
	const selectedCount = entries.filter((entry) =>
		selected.has(entry.key),
	).length;

	const toggle = (key) => {
		const next = new Set(selected);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		onChange(next);
	};

	return (
		<div className="panel flex min-w-0 flex-1 flex-col overflow-hidden">
			<div className="panel-header flex-nowrap border-b-0">
				<div className="flex min-w-0 flex-1">{header}</div>
				{roster && (
					<span className="flex shrink-0 items-center gap-2">
						{open && (
							<>
								<button
									type="button"
									className="button-small button-ghost"
									title={
										search ? "Select every unit matching the search" : undefined
									}
									onClick={() =>
										onChange(
											new Set([
												...selected,
												...filtered.map((entry) => entry.key),
											]),
										)
									}
									disabled={filtered.every((entry) => selected.has(entry.key))}
								>
									All
								</button>
								<button
									type="button"
									className="button-small button-ghost"
									onClick={() => onChange(new Set())}
									disabled={!selectedCount}
								>
									Clear
								</button>
							</>
						)}
						<button
							type="button"
							className="button-small"
							aria-expanded={open}
							onClick={() => onOpenChange?.(!open)}
						>
							{open ? "Done" : "Choose units"}
						</button>
					</span>
				)}
			</div>
			{roster && onAttachmentsChange && (
				<AttachControls
					entries={raw}
					attachments={attachments}
					onChange={onAttachmentsChange}
					open={attachOpen}
					onOpenChange={onAttachOpenChange}
				/>
			)}
			{roster && open && (
				<UnitList
					search={search}
					onSearch={setSearch}
					groups={groups}
					empty={!filtered.length}
					selected={selected}
					onToggle={toggle}
				/>
			)}
		</div>
	);
}

function UnitList({ search, onSearch, groups, empty, selected, onToggle }) {
	return (
		<>
			<div className="border-y border-line px-4 py-3">
				<input
					type="search"
					value={search}
					placeholder="Search units…"
					aria-label="Search units"
					onChange={(e) => onSearch(e.target.value)}
					className="w-full"
				/>
			</div>
			<div className="max-h-96 overflow-y-auto pb-2">
				{groups.map(([group, { entries: groupEntries }]) => (
					<div key={group}>
						<div className="section-label sticky top-0 z-10 border-b border-line bg-surface-muted px-4 py-1.5">
							{group}
						</div>
						<div className="flex flex-col gap-1 px-2 py-1.5">
							{groupEntries.map((entry) => {
								const on = selected.has(entry.key);
								return (
									<button
										type="button"
										key={entry.key}
										aria-pressed={on}
										onClick={() => onToggle(entry.key)}
										className="pick text-sm"
									>
										<span className="min-w-0 flex-1">
											<span className="flex items-center gap-1.5">
												<span
													className={`truncate ${on ? "font-bold text-primary" : "font-medium"}`}
												>
													{entry.label}
												</span>
												{entry.copies > 1 && (
													<span
														className="badge shrink-0"
														title={`${entry.copies} identical units in this list — shown once`}
													>
														{entry.copies} in list
													</span>
												)}
											</span>
											<span className="hint block">
												{summarise(entry.unit)}
											</span>
										</span>
										<span className="hint shrink-0 tabular-nums">
											{entry.unit.cost?.points ?? 0} pts
										</span>
									</button>
								);
							})}
						</div>
					</div>
				))}
				{empty && <div className="px-4 py-6 text-sm text-muted">No units.</div>}
			</div>
		</>
	);
}
