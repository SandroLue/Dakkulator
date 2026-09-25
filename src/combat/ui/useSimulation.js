import { useEffect, useState } from "react";
import { runSimulation } from "../simulateClient";

/**
 * Monte-Carlo result for a pairing, computed in a Web Worker.
 * @returns `{ result, error }`; `result` is `null` while the simulation runs
 */
export function useSimulation(pairing, { trials = 10000, seed = 1 } = {}) {
	const [state, setState] = useState({ pairing: null, result: null });

	useEffect(() => {
		let cancelled = false;
		runSimulation(pairing, { trials, seed }).then(
			(result) => !cancelled && setState({ pairing, result, error: null }),
			(error) =>
				!cancelled && setState({ pairing, result: null, error: error.message }),
		);
		return () => {
			cancelled = true;
		};
	}, [pairing, trials, seed]);

	// A result for a previous pairing is stale.
	return state.pairing === pairing
		? { result: state.result, error: state.error }
		: { result: null, error: null };
}

/**
 * Monte-Carlo results for several pairings; `null` until all have finished.
 * `pairings` must be memoised, or the simulations restart on every render.
 */
export function useSimulations(pairings, { trials = 10000, seed = 1 } = {}) {
	const [state, setState] = useState({ pairings: null, entries: [] });

	useEffect(() => {
		let cancelled = false;
		Promise.allSettled(
			pairings.map((pairing) => runSimulation(pairing, { trials, seed })),
		).then((settled) => {
			if (cancelled) return;
			setState({
				pairings,
				entries: settled.map((outcome) =>
					outcome.status === "fulfilled"
						? { result: outcome.value, error: null }
						: { result: null, error: outcome.reason?.message },
				),
			});
		});
		return () => {
			cancelled = true;
		};
	}, [pairings, trials, seed]);

	return state.pairings === pairings ? state.entries : null;
}
