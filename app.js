(function () {
  const SHEET_ID = "1Ac5ecT-orrmgJ2h4-a8N-YYyMS3R_AosYFcgoATIBgk";
  const SHEETS = {
    assignments: "4",
    teams: "1",
    results: "5"
  };

  const state = {
    assignments: [],
    teams: [],
    results: [],
    participantQuery: "",
    teamQuery: ""
  };

  const el = {
    loadStatus: document.querySelector("#loadStatus"),
    refreshButton: document.querySelector("#refreshButton"),
    participantCount: document.querySelector("#participantCount"),
    teamCount: document.querySelector("#teamCount"),
    leaderName: document.querySelector("#leaderName"),
    leaderboard: document.querySelector("#leaderboard"),
    teamsGrid: document.querySelector("#teamsGrid"),
    widgetList: document.querySelector("#widgetList"),
    widgetUpdated: document.querySelector("#widgetUpdated"),
    participantSearch: document.querySelector("#participantSearch"),
    teamSearch: document.querySelector("#teamSearch")
  };

  function loadSheet(gid) {
    const callback = `sheetCallback_${gid}_${Date.now()}`.replace(/\W/g, "_");
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${gid}&headers=1&tqx=responseHandler:${callback}`;

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
      .map((row) => {
        return headers.reduce((record, header, index) => {
          const cell = row.c[index];
          record[header] = cell ? cell.f || cell.v || "" : "";
          return record;
        }, {});
      })
      .filter((row) => Object.values(row).some(Boolean));
  }

  function numberValue(value) {
    const parsed = Number(String(value || "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function initials(name) {
    return String(name || "")
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  function normalize(value) {
    return String(value || "").toLowerCase();
  }

  function enrichAssignments() {
    const resultsByName = new Map(state.results.map((team) => [team["Team Name"], team]));
    state.teams = state.teams.map((team) => ({
      ...team,
      ...(resultsByName.get(team["Team Name"]) || {}),
      "Assigned Participant": team["Assigned Participant"],
      Group: team.Group,
      "Official Tier": team["Official Tier"],
      "Super Tier": team["Super Tier"],
      "Total Team Points": team["Total Team Points"]
    }));

    const teamsByName = new Map(state.teams.map((team) => [team["Team Name"], team]));
    state.assignments = state.assignments
      .map((person) => {
        const tierA = teamsByName.get(person["Tier A Team"]) || {};
        const tierB = teamsByName.get(person["Tier B Team"]) || {};
        const points = numberValue(person["Total Points"]) || numberValue(tierA["Total Team Points"]) + numberValue(tierB["Total Team Points"]);
        return {
          ...person,
          rank: numberValue(person.Rank) || 1,
          points,
          tierA,
          tierB
        };
      })
      .sort((a, b) => b.points - a.points || a["Participant Name"].localeCompare(b["Participant Name"]));
  }

  function renderSummary() {
    const leader = state.assignments[0];
    el.participantCount.textContent = state.assignments.length;
    el.teamCount.textContent = state.teams.length;
    el.leaderName.textContent = leader ? leader["Participant Name"] : "--";
  }

  function renderLeaderboard() {
    const query = normalize(state.participantQuery);
    const filtered = state.assignments.filter((person) => normalize(person["Participant Name"]).includes(query));

    el.leaderboard.innerHTML = filtered.map((person, index) => `
      <article class="standing-row">
        <div class="rank">${person.rank || index + 1}</div>
        <div class="person">
          <strong>${escapeHtml(person["Participant Name"])}</strong>
          <span>${escapeHtml(statusText(person))}</span>
        </div>
        <div class="points">
          <strong>${person.points}</strong>
          <span>pts</span>
        </div>
        <div class="team-pills">
          ${teamPill(person["Tier A Team"], "A", person.tierA)}
          ${teamPill(person["Tier B Team"], "B", person.tierB)}
        </div>
      </article>
    `).join("");
  }

  function statusText(person) {
    const liveTeams = [person.tierA, person.tierB].filter((team) => String(team.Eliminated || "").toUpperCase() !== "Y").length;
    return `${liveTeams} teams active`;
  }

  function teamPill(name, tier, team) {
    const group = team.Group ? `Group ${team.Group}` : "Group TBD";
    return `<span class="pill"><b>${tier}</b>${escapeHtml(name)} - ${escapeHtml(group)}</span>`;
  }

  function renderTeams() {
    const query = normalize(state.teamQuery);
    const filtered = state.teams.filter((team) => {
      const haystack = [
        team["Team Name"],
        team.Group,
        team["Super Tier"],
        team["Assigned Participant"]
      ].map(normalize).join(" ");
      return haystack.includes(query);
    });

    el.teamsGrid.innerHTML = filtered.map((team) => `
      <article class="team-card">
        <header>
          <div>
            <strong>${escapeHtml(team["Team Name"])}</strong>
            <span>Group ${escapeHtml(team.Group)} - ${escapeHtml(team["Assigned Participant"])}</span>
          </div>
          <span class="badge ${team["Super Tier"] === "A" ? "tier-a" : "tier-b"}">Tier ${escapeHtml(team["Super Tier"])}</span>
        </header>
        <div class="team-stats">
          <div><span>Points</span><strong>${numberValue(team["Total Team Points"])}</strong></div>
          <div><span>Wins</span><strong>${numberValue(team["Group Stage Wins"])}</strong></div>
          <div><span>Draws</span><strong>${numberValue(team["Group Stage Draws"])}</strong></div>
        </div>
      </article>
    `).join("");
  }

  function renderWidget() {
    const topFive = state.assignments.slice(0, 5);
    el.widgetList.innerHTML = topFive.map((person, index) => `
      <div class="widget-row">
        <div class="rank">${person.rank || index + 1}</div>
        <div>
          <strong>${escapeHtml(person["Participant Name"])}</strong>
          <div class="updated">${escapeHtml(person["Tier A Team"])} / ${escapeHtml(person["Tier B Team"])}</div>
        </div>
        <strong>${person.points} pts</strong>
      </div>
    `).join("");
    el.widgetUpdated.textContent = `Updated ${new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function refreshData() {
    el.loadStatus.textContent = "Loading sheet data";
    el.refreshButton.disabled = true;
    try {
      const [assignments, teams, results] = await Promise.all([
        loadSheet(SHEETS.assignments),
        loadSheet(SHEETS.teams),
        loadSheet(SHEETS.results)
      ]);
      state.assignments = assignments;
      state.teams = teams;
      state.results = results;
      enrichAssignments();
      renderAll();
      el.loadStatus.textContent = `Live from Google Sheets`;
    } catch (error) {
      el.loadStatus.textContent = error.message;
    } finally {
      el.refreshButton.disabled = false;
    }
  }

  function renderAll() {
    renderSummary();
    renderLeaderboard();
    renderTeams();
    renderWidget();
  }

  function activateView(view) {
    document.querySelectorAll(".tab[data-view]").forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.view === view);
    });
    document.querySelectorAll(".view").forEach((section) => section.classList.remove("is-active"));
    document.querySelector(`#${view}View`)?.classList.add("is-active");
  }

  function init() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("view") === "widget") {
      document.body.classList.add("widget-mode");
    }

    document.querySelectorAll(".tab[data-view]").forEach((tab) => {
      tab.addEventListener("click", () => activateView(tab.dataset.view));
    });

    el.refreshButton.addEventListener("click", refreshData);
    el.participantSearch.addEventListener("input", (event) => {
      state.participantQuery = event.target.value;
      renderLeaderboard();
    });
    el.teamSearch.addEventListener("input", (event) => {
      state.teamQuery = event.target.value;
      renderTeams();
    });

    refreshData();
  }

  init();
})();
