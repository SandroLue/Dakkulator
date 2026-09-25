import { simulate } from "./simulate";

self.onmessage = ({ data }) => {
	const { id, streamGroups, options } = data;
	try {
		self.postMessage({ id, result: simulate(streamGroups, options) });
	} catch (error) {
		self.postMessage({ id, error: String(error?.message ?? error) });
	}
};
