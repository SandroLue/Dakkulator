import { useMemo, useState } from "react";
import { attachLeaders, canLead, isLeader } from "../attach";
import { buildDefenderProfiles, getUnitTotalModels } from "../profiles";

export function unitKey(forceIndex, unitIndex) {
	return `${forceIndex}:${unitIndex}`;
}

const unitSignature = (unit) =>
	JSON.stringify(unit, (_key, value) =>
		value instanceof Map || value instanceof Set ? [...value] : value,
	);

/** Gives entries that share a name a "#n" suffix so they can be told apart. */
function numberLabels(entries, baseOf) {
	const totals = new Map();
	for (const entry of entries) {
		const base = baseOf(entry);
		totals.set(base, (totals.get(base) || 0) + 1);
	}
	const seen = new Map();
	for (const entry of entries) {
		const base = baseOf(entry);
		const ordinal = (seen.get(base) || 0) + 1;
		seen.set(base, ordinal);
		entry.label = totals.get(base) > 1 ? `${base} #${ordinal}` : base;
	}
	return entries;
}

/**
 * Lists every unit in the roster, identical copies included, so each copy can
 * take its own leader. `applyAttachments` groups identical units afterwards.
 */
export function listUnits(roster) {
	const entries = [];
	(roster?.forces || []).forEach((force, forceIndex) => {
		(force.units || []).forEach((unit, unitIndex) => {
			entries.push({
				key: unitKey(forceIndex, unitIndex),
				force: force.catalog || force.name,
				role: unit.role || "NONE",
				unit,
				baseLabel: unit.name,
			});
		});
	});
	return numberLabels(entries, (entry) => entry.baseLabel);
}

/**
 * Replaces every led unit with the attached unit it forms and drops the leaders
 * that joined it, so the rest of the calculator sees one unit. Units that are
 * then identical — e.g. two Custodian Guard squads, or two Custodian Guard
 * squads each led by a Blade Champion — are shown once; `key` is the first
 * copy's, `copies` counts them.
 */
export function applyAttachments(entries, attachments = {}) {
	const byKey = new Map(entries.map((entry) => [entry.key, entry]));
	const leadersFor = new Map();
	const attached = new Set();

	for (const [leaderKey, bodyguardKey] of Object.entries(attachments)) {
		const leader = byKey.get(leaderKey);
		const bodyguard = byKey.get(bodyguardKey);
		if (!leader || !bodyguard || leaderKey === bodyguardKey) continue;
		if (!leadersFor.has(bodyguardKey)) leadersFor.set(bodyguardKey, []);
		leadersFor.get(bodyguardKey).push(leader);
		attached.add(leaderKey);
	}

	const formed = entries
		.filter((entry) => !attached.has(entry.key))
		.map((entry) => {
			const leaders = leadersFor.get(entry.key);
			if (!leaders) return entry;
			return {
				...entry,
				unit: attachLeaders(
					entry.unit,
					leaders.map((leader) => leader.unit),
				),
				baseLabel: [entry.unit.name, ...leaders.map((l) => l.unit.name)].join(
					" + ",
				),
			};
		});

	const grouped = [];
	const bySignature = new Map();
	for (const entry of formed) {
		const signature = `${entry.force}|${unitSignature(entry.unit)}`;
		const existing = bySignature.get(signature);
		if (existing) {
			existing.copies++;
			continue;
		}
		const group = { ...entry, copies: 1 };
		bySignature.set(signature, group);
		grouped.push(group);
	}
	// Copies with different gear or size stay apart; number those.
	return numberLabels(grouped, (entry) => entry.baseLabel);
}

function AttachControls({ entries, attachments, onChange }) {
	const leaders = entries.filter((entry) => isLeader(entry.unit));
	if (!leaders.length) return null;

	const setLeader = (leaderKey, bodyguardKey) => {
		const next = { ...attachments };
		if (bodyguardKey) next[leaderKey] = bodyguardKey;
		else delete next[leaderKey];
		onChange(next);
	};

	return (
		<details className="border-t border-line px-4 py-2">
			<summary className="section-label cursor-pointer hover:text-ink">
				Attach leaders ({Object.keys(attachments).length})
			</summary>
			<p className="hint py-2">
				Rosters do not record this — leaders join a unit before the battle.
			</p>
			<div className="flex flex-col gap-1.5 pb-1">
				{leaders.map((leader) => {
					const options = entries.filter((entry) =>
						canLead(leader.unit, entry.unit),
					);
					return (
						<label key={leader.key} className="flex items-center gap-3 text-sm">
							<span className="min-w-0 flex-1 truncate">{leader.label}</span>
							<select
								value={attachments[leader.key] ?? ""}
								onChange={(event) => setLeader(leader.key, event.target.value)}
								disabled={!options.length}
								className="w-[40%] shrink-0 text-xs"
							>
								<option value="">
									{options.length ? "— on its own —" : "— no eligible unit —"}
								</option>
								{options.map((entry) => (
									<option key={entry.key} value={entry.key}>
										{entry.label}
									</option>
								))}
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
