function replacer(key, value) {
	if (value instanceof Map) {
		return {
			dataType: "Map",
			value: Array.from(value.entries()), // or with spread: value: [...value]
		};
	}
	if (value instanceof Set) {
		return ["__isSet", ...value];
	}
	return value;
}
function reviver(key, value) {
	if (Array.isArray(value) && value[0] === "__isSet") {
		return new Set(value.slice(1));
	}
	if (typeof value === "object" && value !== null) {
		if (value.dataType === "Map") {
			return new Map(value.value);
		}
	}
	return value;
}

export const parseJSON = (string) => {
	return JSON.parse(string, reviver);
};

export const stringifyJSON = (value) => {
	return JSON.stringify(value, replacer);
};
