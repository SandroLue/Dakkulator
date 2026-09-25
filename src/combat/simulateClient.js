import { EMPTY_SIMULATION, pairingStreamGroups } from "./index";
import { simulate } from "./simulate";

/** `undefined` until first use, `null` where workers are unavailable (tests, old browsers). */
let worker;
let nextId = 0;
const pending = new Map();
/** pairing -> options key -> result promise */
const results = new WeakMap();

function rejectAll(error) {
	for (const request of pending.values()) request.reject(error);
	pending.clear();
}

function getWorker() {
	if (worker !== undefined) return worker;
	try {
		worker = new Worker(new URL("./simulate.worker.js", import.meta.url), {
			type: "module",
		});
		worker.onmessage = ({ data }) => {
			const request = pending.get(data.id);
			if (!request) return;
			pending.delete(data.id);
			if (data.error) request.reject(new Error(data.error));
			else request.resolve(data.result);
		};
		worker.onerror = (event) => {
			event.preventDefault?.();
			rejectAll(new Error(event.message || "Simulation worker failed"));
			worker.terminate();
			worker = null;
		};
	} catch {
		worker = null;
	}
	return worker;
}

/**
 * Runs the Monte-Carlo pass for a resolved pairing off the main thread,
 * falling back to running it inline when no worker is available. Results are
 * cached per pairing object, so the breakdown and the comparison share a run.
 */
export function runSimulation(pairing, options = {}) {
	const key = JSON.stringify(options);
	const cached = results.get(pairing)?.get(key);
	if (cached) return cached;

	const promise = startSimulation(pairing, options);
	if (pairing && typeof pairing === "object") {
		if (!results.has(pairing)) results.set(pairing, new Map());
		results.get(pairing).set(key, promise);
		promise.catch(() => results.get(pairing)?.delete(key));
	}
	return promise;
}

function startSimulation(pairing, options) {
	const streamGroups = pairingStreamGroups(pairing);
	if (!streamGroups.length) return Promise.resolve(EMPTY_SIMULATION);

	const target = getWorker();
	if (!target) {
		try {
			return Promise.resolve(simulate(streamGroups, options));
		} catch (error) {
			return Promise.reject(error);
		}
	}

	return new Promise((resolve, reject) => {
		const id = ++nextId;
		pending.set(id, { resolve, reject });
		target.postMessage({ id, streamGroups, options });
	});
}
