// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { parseRosterXml } from "../../library/loadRoster";
import { Calculator } from "./Calculator";
import { METRICS } from "./metrics";

// A smoke test of the real UI with two example lists: it renders, every view
// and the main interactions work, and React reports no error on the way.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function loadExample(file) {
	const zip = await JSZip.loadAsync(readFileSync(`public/${file}.rosz`));
	return parseRosterXml(await zip.file(/\.ros$/)[0].async("string"));
}

let rosterA;
let rosterB;
let container;
let root;
let errors;
let warnings;

beforeAll(async () => {
	rosterA = await loadExample("Custodes");
	rosterB = await loadExample("Tyranids");
});

beforeEach(() => {
	localStorage.clear();
	errors = vi.spyOn(console, "error").mockImplementation(() => {});
	// happy-dom does no layout, so every chart has size 0: expected here.
	const warn = console.warn;
	warnings = vi
		.spyOn(console, "warn")
		.mockImplementation((message, ...rest) => {
			if (!String(message).includes("width(0) and height(0)")) {
				warn(message, ...rest);
			}
		});
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	expect(errors.mock.calls.map((call) => String(call[0]))).toEqual([]);
	errors.mockRestore();
	warnings.mockRestore();
});

const render = () =>
	act(async () =>
		root.render(
			<Calculator
				rosterA={rosterA}
				rosterB={rosterB}
				listIds={{ A: "custodes", B: "tyranids" }}
				onSwap={() => {}}
				listSelect={(slot) => <span>{slot}</span>}
			/>,
		),
	);

const click = (element) =>
	act(async () => {
		element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});

const matrixCells = () => [...container.querySelectorAll("td button")];

describe("Calculator", () => {
	it("shows the matrix, a matchup's breakdown and every view", async () => {
		await render();
		const cells = matrixCells();
		expect(cells.length).toBeGreaterThan(10);
		expect(cells.every((cell) => /\d|—/.test(cell.textContent))).toBe(true);

		await click(cells[0]);
		expect(container.textContent).toContain("→");
		const breakdown = container.querySelector("details summary");
		await click(breakdown);
		expect(container.textContent).toContain("Total");
		// The Monte-Carlo runs inline here (no Worker): it must finish, not fail.
		expect(container.textContent).not.toContain("Running Monte-Carlo");
		expect(container.textContent).not.toContain("Monte-Carlo failed");

		const select = container.querySelector('select[aria-label="Metric"]');
		for (const metric of Object.keys(METRICS)) {
			await act(async () => {
				select.value = metric;
				select.dispatchEvent(new Event("change", { bubbles: true }));
			});
			expect(matrixCells().length).toBe(cells.length);
		}
	});

	it("generates the lists' modifiers and opens the editor", async () => {
		await render();
		const edit = container.querySelector('button[aria-label^="Edit "]');
		expect(edit).not.toBeNull();
		await click(edit);
		expect(container.textContent).toContain("Only weapons named or with");
		expect(container.textContent).toContain("Only if Strength vs Toughness");
	});
});
