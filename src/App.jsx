import { useEffect, useState } from "react";
import { Calculator } from "./combat/ui/Calculator";
import { track } from "./helpers/analytics";
import { RosterTable, SlotSelect, UploadArea } from "./library/LibraryPanel";
import { loadRosterFile, loadRosterUrl } from "./library/loadRoster";
import { isFirstVisit, useRosterLibrary } from "./library/rosterLibrary";

const roleLabel = (slot, reversed) =>
	`List ${slot} — ${(slot === "A") !== reversed ? "attacker" : "defender"}`;
const EXAMPLES = [
	{ slot: "A", source: "example:custodes", file: "Custodes.rosz" },
	{ slot: "B", source: "example:tyranids", file: "Tyranids.rosz" },
];
const STORAGE_FULL =
	"The browser's storage is full — delete a list and try again.";

let messageId = 0;
const message = (text, error = false) => ({ id: ++messageId, text, error });

// Module-level so StrictMode's double effect run does not add the examples twice.
let examplesRequested = false;

async function loadExamples(library) {
	const errors = [];
	for (const example of EXAMPLES) {
		try {
			const roster = await loadRosterUrl(
				`${import.meta.env.BASE_URL}${example.file}`,
			);
			const entry = library.add(roster, example.source);
			if (!entry) {
				errors.push(message(STORAGE_FULL, true));
				break;
			}
			library.assign(example.slot, entry.id);
		} catch (error) {
			errors.push(message(error.message, true));
		}
	}
	return errors;
}

function App() {
	const library = useRosterLibrary();
	const [busy, setBusy] = useState(false);
	const [messages, setMessages] = useState([]);
	const [reversed, setReversed] = useState(false);

	useEffect(() => {
		if (examplesRequested || !isFirstVisit()) return;
		examplesRequested = true;
		setBusy(true);
		loadExamples(library).then((errors) => {
			setMessages(errors);
			setBusy(false);
		});
	}, [library]);

	const handleFiles = async (files) => {
		setBusy(true);
		const next = [];
		for (const file of files) {
			try {
				const roster = await loadRosterFile(file);
				const entry = library.add(roster);
				if (!entry) {
					next.push(message(`${file.name}: ${STORAGE_FULL}`, true));
					continue;
				}
				library.assignIfEmpty(entry.id);
				next.push(message(`Added “${roster.name}”.`));
				track("user_uploaded_roster", {
					roster_faction: roster.forces[0].catalog,
					roster_type: roster.gameType,
					name: roster.name,
				});
			} catch (error) {
				next.push(message(`${file.name}: ${error.message}`, true));
			}
		}
		setMessages(next);
		setBusy(false);
	};

	return (
		<div id="js_app" className="App">
			<div className="header print-display-none">
				<a href={import.meta.env.BASE_URL}>Dakkulator</a>
				<div className="subheader">Warhammer 40,000 combat calculator</div>
			</div>

			<div className="body">
				<section className="print-display-none grid w-full gap-5 md:grid-cols-2">
					<UploadArea onFiles={handleFiles} busy={busy} messages={messages} />
					<RosterTable
						entries={library.entries}
						slots={library.slots}
						onRemove={library.remove}
					/>
				</section>

				<Calculator
					rosterA={library.rosters.A}
					rosterB={library.rosters.B}
					listIds={library.slots}
					reversed={reversed}
					onReversedChange={setReversed}
					listSelect={(slot) => (
						<SlotSelect
							slot={slot}
							label={roleLabel(slot, reversed)}
							entries={library.entries}
							value={library.slots[slot]}
							onChange={(id) => library.assign(slot, id)}
						/>
					)}
				/>

				<footer className="print-display-none max-w-[95vw] pt-6 text-center text-sm text-muted">
					Reads{" "}
					<a href="https://www.newrecruit.eu/" target="_blank" rel="noreferrer">
						New Recruit
					</a>{" "}
					and{" "}
					<a
						href="https://www.battlescribe.net/"
						target="_blank"
						rel="noreferrer"
					>
						BattleScribe
					</a>{" "}
					rosters. Roster parsing is based on{" "}
					<a
						href="https://github.com/NilsUeter/fancyscribe"
						target="_blank"
						rel="noreferrer"
					>
						FancyScribe
					</a>{" "}
					and{" "}
					<a
						href="https://rweyrauch.github.io/PrettyScribe"
						target="_blank"
						rel="noreferrer"
					>
						PrettyScribe
					</a>
					.
				</footer>
			</div>
		</div>
	);
}

export default App;
