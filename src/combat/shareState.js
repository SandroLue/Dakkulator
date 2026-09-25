import { REROLL_MODES, normalizeModifier } from "./modifiers";
import { defaultContext } from "./resolve";

/**
 * Shareable calculator state in the URL hash (`#share=<base64url JSON>`).
 *
 * Rosters are uploaded files and stay out of the link; the recipient loads the
 * same rosters, and the selection is only restored when the roster names match.
 */

const PREFIX = "#share=";
const VERSION = 1;
const MAX_HASH_LENGTH = 50000;
const MAX_MODIFIERS = 100;
const UNIT_KEY = /^\d{1,4}:\d{1,4}$/;
const PHASES = ["shooting", "fight"];

function toBase64Url(text) {
	let binary = "";
	for (const byte of new TextEncoder().encode(text)) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function fromBase64Url(value) {
	const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
	const binary = atob(base64 + "===".slice((base64.length + 3) % 4));
	return new TextDecoder().decode(
		Uint8Array.from(binary, (c) => c.charCodeAt(0)),
	);
}

/** Only the options that differ from the defaults, to keep links short. */
function compactContext(ctx) {
	const defaults = defaultContext();
	return Object.fromEntries(
		Object.entries(ctx || {}).filter(
			([key, value]) => key in defaults && defaults[key] !== value,
		),
	);
}

function compactModifier(modifier) {
	const blank = normalizeModifier({ id: "-" });
	return Object.fromEntries(
		Object.entries(normalizeModifier(modifier)).filter(
			([key, value]) => key !== "id" && value !== blank[key],
		),
	);
}

export function encodeShareState({
	rosterNames = {},
	selected = {},
	attachments = {},
	ctx,
	reversed = false,
	modifiers = [],
}) {
	const payload = {
		v: VERSION,
		rosters: { A: rosterNames.A ?? "", B: rosterNames.B ?? "" },
		selected: { A: [...(selected.A || [])], B: [...(selected.B || [])] },
		attachments: { A: attachments.A || {}, B: attachments.B || {} },
		ctx: compactContext(ctx),
		reversed: Boolean(reversed),
		modifiers: modifiers.map(compactModifier),
	};
	return `${PREFIX}${toBase64Url(JSON.stringify(payload))}`;
}

export function hasShareHash(hash) {
	return typeof hash === "string" && hash.startsWith(PREFIX);
}

function validKeys(value) {
	return Array.isArray(value)
		? value.filter((key) => typeof key === "string" && UNIT_KEY.test(key))
		: [];
}

function validAttachments(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return Object.fromEntries(
		Object.entries(value).filter(
			([leader, bodyguard]) =>
				UNIT_KEY.test(leader) &&
				typeof bodyguard === "string" &&
				UNIT_KEY.test(bodyguard),
		),
	);
}

function validContext(value) {
	const defaults = defaultContext();
	const ctx = {};
	if (!value || typeof value !== "object") return defaults;
	for (const [key, raw] of Object.entries(value)) {
		if (!(key in defaults) || typeof raw !== typeof defaults[key]) continue;
		if (typeof raw === "number") {
			if (Number.isFinite(raw)) ctx[key] = Math.max(-6, Math.min(6, raw));
		} else if (key === "phase") {
			if (PHASES.includes(raw)) ctx[key] = raw;
		} else if (key.startsWith("reroll")) {
			if (REROLL_MODES.includes(raw)) ctx[key] = raw;
		} else {
			ctx[key] = raw;
		}
	}
	return defaultContext(ctx);
}

/** @returns the decoded state, or `null` when the hash is absent or invalid */
export function decodeShareState(hash) {
	if (!hasShareHash(hash) || hash.length > MAX_HASH_LENGTH) return null;
	let payload;
	try {
		payload = JSON.parse(fromBase64Url(hash.slice(PREFIX.length)));
	} catch {
		return null;
	}
	if (!payload || typeof payload !== "object" || payload.v !== VERSION) {
		return null;
	}
	const name = (value) => (typeof value === "string" ? value : "");
	return {
		rosterNames: {
			A: name(payload.rosters?.A),
			B: name(payload.rosters?.B),
		},
		selected: {
			A: validKeys(payload.selected?.A),
			B: validKeys(payload.selected?.B),
		},
		attachments: {
			A: validAttachments(payload.attachments?.A),
			B: validAttachments(payload.attachments?.B),
		},
		ctx: validContext(payload.ctx),
		reversed: payload.reversed === true,
		modifiers: Array.isArray(payload.modifiers)
			? payload.modifiers
					.slice(0, MAX_MODIFIERS)
					.filter((m) => m && typeof m === "object")
					.map((m) => normalizeModifier({ ...m, id: undefined }))
			: [],
	};
}

const signature = (modifier) =>
	JSON.stringify({ ...compactModifier(modifier), enabled: undefined });

/**
 * Brings the shared modifiers into the user's own list without deleting any:
 * matching ones take the shared on/off state, new ones are appended, and the
 * user's others are switched off so the numbers match the sender's.
 */
export function mergeSharedModifiers(existing, shared) {
	const bySignature = new Map(shared.map((m) => [signature(m), m]));
	let disabled = 0;
	const merged = existing.map((m) => {
		const match = bySignature.get(signature(m));
		if (match) {
			bySignature.delete(signature(m));
			return { ...m, enabled: match.enabled };
		}
		if (m.enabled) disabled++;
		return { ...m, enabled: false };
	});
	const added = [...bySignature.values()];
	return { modifiers: [...merged, ...added], added: added.length, disabled };
}
