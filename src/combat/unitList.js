import { attachLeaders, canLead, isLeader } from "./attach";

/**
 * A roster's units as the calculator lists them: every copy separately (so each
 * can take a leader), then grouped again once leaders are attached.
 */

function unitKey(forceIndex, unitIndex) {
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

/**
 * Attachments that leave no real choice: a leader that may only join one
 * datasheet goes to the first copy of it no other leader has taken. Leaders
 * already attached keep their pairing.
 * @returns the attachments to add, `{ leaderKey: bodyguardKey }`
 */
export function suggestAttachments(entries, attachments = {}) {
	const taken = new Set(Object.values(attachments));
	const suggested = {};
	for (const leader of entries) {
		if (!isLeader(leader.unit) || leader.key in attachments) continue;
		const options = entries.filter(
			(entry) => !isLeader(entry.unit) && canLead(leader.unit, entry.unit),
		);
		const datasheets = new Set(options.map((entry) => entry.unit.name));
		if (datasheets.size !== 1) continue;
		const free = options.find((entry) => !taken.has(entry.key));
		if (!free) continue;
		suggested[leader.key] = free.key;
		taken.add(free.key);
	}
	return suggested;
}
