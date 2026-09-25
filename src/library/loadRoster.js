import JSZip from "jszip";
import { Create40kRoster11th } from "../roster40k-11th";

export const SUPPORTED_GAME = "Warhammer 40,000 11th Edition";

const isZip = (bytes) => bytes[0] === 0x50 && bytes[1] === 0x4b;

/** `.rosz` is a zip holding one `.ros` XML file; `.ros` is the XML itself. */
export async function readRosterXml(file) {
	const buffer = await file.arrayBuffer();
	const bytes = new Uint8Array(buffer);
	if (!isZip(bytes)) return new TextDecoder("utf-8").decode(bytes);

	const zip = await JSZip.loadAsync(buffer);
	const entry = zip.file(/[^/]+\.ros$/)[0];
	if (!entry) throw new Error("The archive contains no .ros roster.");
	return entry.async("string");
}

export function parseRosterXml(xml) {
	const doc = new DOMParser().parseFromString(xml, "text/xml");
	const info = doc.querySelector("roster");
	if (!info)
		throw new Error("This is not a BattleScribe / New Recruit roster.");

	const gameType = info.getAttribute("gameSystemName") || "unknown system";
	if (gameType !== SUPPORTED_GAME) {
		throw new Error(
			`Only ${SUPPORTED_GAME} rosters are supported (got ${gameType}).`,
		);
	}

	const roster = Create40kRoster11th(doc, gameType);
	if (!roster?.forces?.length) throw new Error("The roster contains no units.");
	return roster;
}

export async function loadRosterFile(file) {
	return parseRosterXml(await readRosterXml(file));
}

export async function loadRosterUrl(url) {
	const response = await fetch(url);
	if (!response.ok)
		throw new Error(`Could not load ${url} (${response.status}).`);
	return loadRosterFile(await response.blob());
}
