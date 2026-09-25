import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initAnalytics } from "./helpers/analytics";
import "./index.css";
import { migrateLegacyStorage } from "./library/rosterLibrary";

initAnalytics();
migrateLegacyStorage();

ReactDOM.createRoot(document.getElementById("root")).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
