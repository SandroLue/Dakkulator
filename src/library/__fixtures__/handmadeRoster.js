/**
 * A small roster in the New Recruit / BattleScribe export format, written by
 * hand in our own words: a leader with a two-profile weapon, an enhancement
 * and its own Feel No Pain, and the squad it leads. It covers the structures
 * that broke before (leader attachment, multi-profile weapons, enhancements)
 * without shipping rules text.
 */

const characteristics = (stats) =>
	Object.entries(stats)
		.map(
			([name, value]) =>
				`<characteristic name="${name}" typeId="${name}-id">${value}</characteristic>`,
		)
		.join("");

const profile = (name, typeName, stats) =>
	`<profile id="${name}-p" name="${name}" hidden="false" typeId="${typeName}-t" typeName="${typeName}"><characteristics>${characteristics(stats)}</characteristics></profile>`;

const ability = (name, text) =>
	profile(name, "Abilities", { Description: text });

const unitProfile = (name, { T, Sv, W, InSv = "-" }) =>
	profile(name, "Unit", { M: '6"', T, Sv, W, LD: "6+", OC: "1", InSv });

const melee = (name, { A, WS, S, AP, D, Keywords = "" }) =>
	profile(name, "Melee Weapons", { Range: "Melee", A, WS, S, AP, D, Keywords });

const ranged = (name, { Range, A, BS, S, AP, D, Keywords = "" }) =>
	profile(name, "Ranged Weapons", { Range, A, BS, S, AP, D, Keywords });

const upgrade = (name, profiles, number = 1) =>
	`<selection id="${name}-s" name="${name}" number="${number}" type="upgrade"><profiles>${profiles}</profiles></selection>`;

const categories = (names) =>
	`<categories>${names
		.map(
			(name, i) =>
				`<category id="c${i}-${name}" name="${name}" entryId="c${i}" primary="false" />`,
		)
		.join("")}</categories>`;

const cost = (points) =>
	`<costs><cost name="pts" typeId="51b2-306e-1021-d207" value="${points}" /></costs>`;

const lord = `<selection id="lord" name="Test Lord" number="1" type="model">
	<profiles>
		${unitProfile("Test Lord", { T: 5, Sv: "2+", W: 6, InSv: "4+" })}
		${ability("Leader", "This model can be attached to the following units: TEST GUARD")}
		${ability("Grim Resolve", "Each time a model in this unit makes a melee attack, re-roll a Wound roll of 1.")}
		${ability("Bulwark", "This model has the Feel No Pain 5+ ability.")}
	</profiles>
	<selections>
		${upgrade(
			"Reaper glaive",
			melee("➤ Reaper glaive - strike", {
				A: 4,
				WS: "2+",
				S: 8,
				AP: -2,
				D: 2,
				Keywords: "Lethal Hits",
			}) +
				melee("➤ Reaper glaive - sweep", {
					A: 8,
					WS: "2+",
					S: 5,
					AP: -1,
					D: 1,
					Keywords: "Lethal Hits",
				}),
		)}
		${upgrade("Relic Blade", ability("Relic Blade", "The bearer's melee weapons have +1 A."))}
	</selections>
	${cost(90)}
	${categories(["Character", "Infantry", "Leader", "Faction: Test Legion"])}
</selection>`;

const guard = `<selection id="guard" name="Test Guard" number="1" type="unit">
	<profiles>
		${ability("Shield Wall", "Each time an attack targets this unit, subtract 1 from the Hit roll.")}
	</profiles>
	<selections>
		<selection id="sergeant" name="Guard Sergeant" number="1" type="model">
			<profiles>${unitProfile("Guard Sergeant", { T: 5, Sv: "2+", W: 3 })}</profiles>
			<selections>
				${upgrade("Guard spear", melee("Guard spear", { A: 3, WS: "3+", S: 5, AP: -1, D: 1 }))}
				${upgrade("Bolt caster", ranged("Bolt caster", { Range: '24"', A: 2, BS: "3+", S: 4, AP: 0, D: 1, Keywords: "Rapid Fire 1" }))}
			</selections>
		</selection>
		<selection id="guards" name="Guards" number="4" type="model">
			<profiles>${unitProfile("Guards", { T: 5, Sv: "2+", W: 3 })}</profiles>
			<selections>
				${upgrade("Guard spear", melee("Guard spear", { A: 3, WS: "3+", S: 5, AP: -1, D: 1 }), 4)}
				${upgrade("Bolt caster", ranged("Bolt caster", { Range: '24"', A: 2, BS: "3+", S: 4, AP: 0, D: 1, Keywords: "Rapid Fire 1" }), 4)}
			</selections>
		</selection>
	</selections>
	${cost(150)}
	${categories(["Infantry", "Battleline", "Test Guard", "Faction: Test Legion"])}
</selection>`;

export const HANDMADE_ROSTER = `<?xml version="1.0" encoding="UTF-8"?>
<roster id="r1" name="Handmade" gameSystemName="Warhammer 40,000 11th Edition" xmlns="http://www.battlescribe.net/schema/rosterSchema">
	${cost(240)}
	<forces>
		<force id="f1" name="Army Roster" catalogueName="Imperium - Test Legion">
			<selections>${lord}${guard}</selections>
		</force>
	</forces>
</roster>`;
