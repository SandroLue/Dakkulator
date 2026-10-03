import { useEffect, useState } from "react";
import { runSimulation } from "../simulateClient";

/**
 * Monte-Carlo result for a pairing, computed in a Web Worker.
 *
 * While a new pairing is simulated, the previous result is kept and marked
 * `stale`, so charts stay mounted and animate to the new values instead of
 * disappearing and redrawing.
 * @returns `{ result, error, stale }`; `result` is `null` only before the first run
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

	return {
		result: state.result,
		error: state.pairing === pairing ? state.error : null,
		stale: state.pairing !== pairing,
	};
}
