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

/** Lists the roster's units, keeping one of each set of identical copies. */
export function listUnits(roster) {
	const entries = [];
	const bySignature = new Map();
	(roster?.forces || []).forEach((force, forceIndex) => {
		(force.units || []).forEach((unit, unitIndex) => {
			const signature = unitSignature(unit);
			const existing = bySignature.get(signature);
			if (existing) {
				existing.copies++;
				return;
			}
			const entry = {
				key: unitKey(forceIndex, unitIndex),
				force: force.catalog || force.name,
				role: unit.role || "NONE",
				unit,
				copies: 1,
			};
			bySignature.set(signature, entry);
			entries.push(entry);
		});
	});

	// Copies of a datasheet with different gear or size remain; number them so
	// the attachment dropdowns can tell them apart.
	const totals = new Map();
	for (const entry of entries) {
		totals.set(entry.unit.name, (totals.get(entry.unit.name) || 0) + 1);
	}
	const seen = new Map();
	for (const entry of entries) {
		const ordinal = (seen.get(entry.unit.name) || 0) + 1;
		seen.set(entry.unit.name, ordinal);
		entry.label =
			totals.get(entry.unit.name) > 1
				? `${entry.unit.name} #${ordinal}`
				: entry.unit.name;
	}
	return entries;
}

/**
 * Replaces every led unit with the attached unit it forms and drops the leaders
 * that joined it, so the rest of the calculator sees one unit.
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
	if (!attached.size) return entries;

	return entries
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
				label: [entry.label, ...leaders.map((l) => l.label)].join(" + "),
			};
		});
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
		<details className="border-b border-line px-4 py-2">
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
								className="max-w-[55%] text-xs"
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

	const toggle = (key) => {
		const next = new Set(selected);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		onChange(next);
	};

	return (
		<div className="panel flex min-w-0 flex-1 flex-col overflow-hidden">
			<div className="panel-header items-end">
				<div className="min-w-0 flex-1">{header}</div>
				{roster && (
					<span className="flex items-center gap-2 pb-1">
						<span className={`badge ${selected.size ? "" : "opacity-60"}`}>
							{selected.size} selected
						</span>
						<button
							type="button"
							className="button-small button-ghost"
							title={
								search ? "Select every unit matching the search" : undefined
							}
							onClick={() =>
								onChange(
									new Set([...selected, ...filtered.map((entry) => entry.key)]),
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
							disabled={!selected.size}
						>
							Clear
						</button>
					</span>
				)}
			</div>
			{!roster ? (
				<div className="px-4 py-10 text-center text-sm text-muted">
					Choose an army list to pick its units.
				</div>
			) : (
				<>
					<div className="border-b border-line px-4 py-3">
						<input
							type="search"
							value={search}
							placeholder="Search units…"
							aria-label="Search units"
							onChange={(e) => setSearch(e.target.value)}
							className="w-full"
						/>
					</div>
					{onAttachmentsChange && (
						<AttachControls
							entries={raw}
							attachments={attachments}
							onChange={onAttachmentsChange}
						/>
					)}
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
												onClick={() => toggle(entry.key)}
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
						{!filtered.length && (
							<div className="px-4 py-6 text-sm text-muted">No units.</div>
						)}
					</div>
				</>
			)}
		</div>
	);
}
