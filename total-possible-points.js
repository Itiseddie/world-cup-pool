(function () {
  const SHEET_ID = "1Ac5ecT-orrmgJ2h4-a8N-YYyMS3R_AosYFcgoATIBgk";
  const SHEETS = {
    assignments: "4",
    teams: "1",
    results: "5"
  };

  const BRACKET_PATHS = {
    argentina: { qf: 4, sf: 2 },
    belgium: { qf: 2, sf: 1 },
    colombia: { qf: 4, sf: 2 },
    egypt: { qf: 4, sf: 2 },
    england: { qf: 3, sf: 2 },
    france: { qf: 1, sf: 1 },
    morocco: { qf: 1, sf: 1 },
    norway: { qf: 3, sf: 2 },
    spain: { qf: 2, sf: 1 },
    switzerland: { qf: 4, sf: 2 }
  };

  let standings = new Map();

  function loadSheet(source) {
    const params = new URLSearchParams({ headers: "1", tqx: "" });
    const callback = `possiblePointsCallback_${source}_${Date.now()}`.replace(/\W/g, "_");
    params.set("gid", source);
    params.set("tqx", `responseHandler:${callback}`);
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?${params.toString()}`;

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Google Sheet request timed out"));
      }, 12000);

      function cleanup() {
        window.clearTimeout(timeout);
        delete window[callback];
        script.remove();
      }

      window[callback] = (response) => {
        cleanup();
        if (response.status === "error") {
          reject(new Error(response.errors?.[0]?.detailed_message || "Google Sheet returned an error"));
          return;
        }
        resolve(tableToRows(response.table));
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("Could not load Google Sheet data"));
      };

      script.src = url;
      document.head.appendChild(script);
    });
  }

  function tableToRows(table) {
    const headers = table.cols.map((col, index) => col.label || `Column ${index + 1}`);
    return table.rows
      .map((row) => headers.reduce((record, header, index) => {
        const cell = row.c[index];
        record[header] = cell ? cell.f || cell.v || "" : "";
        return record;
      }, {}))
      .filter((row) => Object.values(row).some(Boolean));
  }

  function numberValue(value) {
    const parsed = Number(String(value || "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function isEliminated(team) {
    const value = String(team?.Eliminated ?? "").trim().toUpperCase();
    return value === "1" || value === "Y" || value === "YES" || value === "TRUE";
  }

  function hasEarnedMilestone(team, field) {
    return numberValue(team?.[field]) > 0;
  }

  function remainingQuarterfinalBonus(team) {
    return hasEarnedMilestone(team, "Quarterfinal Advanced") ? 0 : 5;
  }

  function remainingSemifinalBonus(team) {
    return hasEarnedMilestone(team, "Semifinal Advanced") ? 0 : 8;
  }

  function remainingFinalBonus(team) {
    return hasEarnedMilestone(team, "Final Advanced") ? 0 : 12;
  }

  function remainingChampionBonus(team) {
    return hasEarnedMilestone(team, "Champion") ? 0 : 18;
  }

  function remainingFromSemifinalOn(team) {
    return remainingSemifinalBonus(team) + remainingFinalBonus(team) + remainingChampionBonus(team);
  }

  function remainingFromFinalOn(team) {
    return remainingFinalBonus(team) + remainingChampionBonus(team);
  }

  function remainingToSemifinal(team) {
    return remainingQuarterfinalBonus(team) + remainingSemifinalBonus(team);
  }

  function remainingToFinal(team) {
    return remainingQuarterfinalBonus(team) + remainingSemifinalBonus(team) + remainingFinalBonus(team);
  }

  function remainingPossibleForTeam(team) {
    if (!team || isEliminated(team)) return 0;
    return remainingQuarterfinalBonus(team) + remainingSemifinalBonus(team) + remainingFinalBonus(team) + remainingChampionBonus(team);
  }

  function remainingPossibleForParticipant(person) {
    const teams = [person.tierA, person.tierB].filter((team) => team && !isEliminated(team));
    if (teams.length === 0) return 0;
    if (teams.length === 1) return remainingPossibleForTeam(teams[0]);

    const [teamA, teamB] = teams;
    const pathA = bracketPathForTeam(teamA);
    const pathB = bracketPathForTeam(teamB);

    if (!pathA || !pathB) {
      return remainingPossibleForTeam(teamA) + remainingPossibleForTeam(teamB);
    }

    if (pathA.qf === pathB.qf) {
      return remainingQuarterfinalBonus(teamA) + remainingQuarterfinalBonus(teamB) + Math.max(remainingFromSemifinalOn(teamA), remainingFromSemifinalOn(teamB));
    }

    if (pathA.sf === pathB.sf) {
      return remainingToSemifinal(teamA) + remainingToSemifinal(teamB) + Math.max(remainingFromFinalOn(teamA), remainingFromFinalOn(teamB));
    }

    return remainingToFinal(teamA) + remainingToFinal(teamB) + Math.max(remainingChampionBonus(teamA), remainingChampionBonus(teamB));
  }

  function bracketPathForTeam(team) {
    return BRACKET_PATHS[teamKey(team?.["Team Name"])]
  }

  function teamKey(teamName) {
    return String(teamName || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function formatPoints(value) {
    const points = numberValue(value);
    return Number.isInteger(points) ? String(points) : String(points);
  }

  function buildStandings(assignments, teams, results) {
    const resultsByName = new Map(results.map((team) => [team["Team Name"], team]));
    const teamsByName = new Map(teams.map((team) => {
      const merged = {
        ...team,
        ...(resultsByName.get(team["Team Name"]) || {})
      };
      return [team["Team Name"], merged];
    }));

    standings = new Map(assignments.map((person) => {
      const tierA = teamsByName.get(person["Tier A Team"]) || {};
      const tierB = teamsByName.get(person["Tier B Team"]) || {};
      const points = numberValue(person["Total Points"]) || numberValue(tierA["Total Team Points"]) + numberValue(tierB["Total Team Points"]);
      const remainingPossible = remainingPossibleForParticipant({ tierA, tierB });
      return [person["Participant Name"], {
        points,
        totalPossiblePoints: points + remainingPossible
      }];
    }));
  }

  function patchLeaderboard() {
    document.querySelectorAll(".standing-row").forEach((row) => {
      const name = row.querySelector(".person strong")?.textContent?.trim();
      const person = standings.get(name);
      const points = row.querySelector(".points");
      if (!person || !points) return;

      let possible = points.querySelector(".possible-points");
      if (!possible) {
        possible = document.createElement("small");
        possible.className = "possible-points";
        points.appendChild(possible);
      }
      possible.textContent = `${formatPoints(person.totalPossiblePoints)} total possible points`;
    });
  }

  function patchWidget() {
    document.querySelectorAll(".widget-row").forEach((row) => {
      const name = row.children[1]?.querySelector("strong")?.textContent?.trim();
      const person = standings.get(name);
      if (!person) return;

      let score = row.querySelector(".widget-score");
      if (!score) {
        const current = row.lastElementChild;
        score = document.createElement("div");
        score.className = "widget-score";
        if (current) {
          score.innerHTML = `<strong>${current.textContent}</strong>`;
          current.replaceWith(score);
        } else {
          row.appendChild(score);
        }
      }

      let possible = score.querySelector("span");
      if (!possible) {
        possible = document.createElement("span");
        score.appendChild(possible);
      }
      possible.textContent = `${formatPoints(person.totalPossiblePoints)} possible`;
    });
  }

  function patchViews() {
    if (!standings.size) return;
    patchLeaderboard();
    patchWidget();
  }

  async function init() {
    try {
      const [assignments, teams, results] = await Promise.all([
        loadSheet(SHEETS.assignments),
        loadSheet(SHEETS.teams),
        loadSheet(SHEETS.results)
      ]);
      buildStandings(assignments, teams, results);
      patchViews();
    } catch (error) {
      console.warn(error);
    }

    const observer = new MutationObserver(patchViews);
    const leaderboard = document.querySelector("#leaderboard");
    const widget = document.querySelector("#widgetList");
    if (leaderboard) observer.observe(leaderboard, { childList: true, subtree: true });
    if (widget) observer.observe(widget, { childList: true, subtree: true });
  }

  init();
})();
