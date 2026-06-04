(function () {
  const SHEET_ID = "1Ac5ecT-orrmgJ2h4-a8N-YYyMS3R_AosYFcgoATIBgk";
  const SHEETS = {
    assignments: "4",
    teams: "1",
    results: "5",
    rankings: { sheet: "Rank_2026Apr" }
  };

  const state = {
    assignments: [],
    teams: [],
    results: [],
    rankings: [],
    participantQuery: "",
    teamQuery: "",
    selectedParticipant: localStorage.getItem("worldCupPoolParticipant") || "",
    lastUpdatedAt: null
  };

  const FLAG_CODES = {
    algeria: "dz",
    argentina: "ar",
    australia: "au",
    austria: "at",
    belgium: "be",
    "bosnia and herzegovina": "ba",
    brazil: "br",
    canada: "ca",
    "cape verde": "cv",
    colombia: "co",
    croatia: "hr",
    curacao: "cw",
    czechia: "cz",
    "dr congo": "cd",
    ecuador: "ec",
    egypt: "eg",
    england: "gb-eng",
    france: "fr",
    germany: "de",
    ghana: "gh",
    haiti: "ht",
    iran: "ir",
    iraq: "iq",
    "ivory coast": "ci",
    japan: "jp",
    jordan: "jo",
    mexico: "mx",
    morocco: "ma",
    netherlands: "nl",
    "new zealand": "nz",
    norway: "no",
    panama: "pa",
    paraguay: "py",
    portugal: "pt",
    qatar: "qa",
    "saudi arabia": "sa",
    scotland: "gb-sct",
    senegal: "sn",
    "south africa": "za",
    "south korea": "kr",
    spain: "es",
    sweden: "se",
    switzerland: "ch",
    tunisia: "tn",
    turkiye: "tr",
    "united states": "us",
    uruguay: "uy",
    uzbekistan: "uz"
  };

  const RANKING_ALIASES = {
    "dr congo": "congo dr",
    "united states": "usa"
  };

  const el = {
    loadStatus: document.querySelector("#loadStatus"),
    refreshButton: document.querySelector("#refreshButton"),
    participantCount: document.querySelector("#participantCount"),
    teamCount: document.querySelector("#teamCount"),
    leaderName: document.querySelector("#leaderName"),
    leaderboard: document.querySelector("#leaderboard"),
    teamsGrid: document.querySelector("#teamsGrid"),
    myPoolView: document.querySelector("#myPoolView"),
    widgetList: document.querySelector("#widgetList"),
    widgetUpdated: document.querySelector("#widgetUpdated"),
    lastUpdated: document.querySelector("#lastUpdated"),
    participantSelect: document.querySelector("#participantSelect"),
    participantSearch: document.querySelector("#participantSearch"),
    teamSearch: document.querySelector("#teamSearch")
  };

  function loadSheet(source) {
    const params = new URLSearchParams({
      headers: "1",
      tqx: ""
    });
    const sourceKey = typeof source === "object" ? source.sheet || source.gid : source;
    const callback = `sheetCallback_${sourceKey}_${Date.now()}`.replace(/\W/g, "_");
    params.set("tqx", `responseHandler:${callback}`);
    if (typeof source === "object" && source.sheet) {
      params.set("sheet", source.sheet);
    } else {
      params.set("gid", source);
    }
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

  function normalize(value) {
    return String(value || "").toLowerCase();
  }

  function normalizeKey(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function enrichAssignments() {
    const rankingsByName = new Map(
      state.rankings
        .map((row) => {
          const teamName = rankingTeamName(row);
          const rank = rankingValue(row);
          return teamName && rank ? [rankLookupKey(teamName), { rank, raw: row }] : null;
        })
        .filter(Boolean)
    );
    const resultsByName = new Map(state.results.map((team) => [team["Team Name"], team]));
    state.teams = state.teams.map((team) => ({
      ...team,
      ...(resultsByName.get(team["Team Name"]) || {}),
      "FIFA Rank": rankingsByName.get(rankLookupKey(team["Team Name"]))?.rank || team["FIFA Rank"] || team["FIFA Ranking"] || "",
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

    state.assignments = state.assignments.map((person, index) => ({
      ...person,
      displayRank: index + 1
    }));
  }

  function rankingTeamName(row) {
    return firstPresent(row, [
      "Team Name",
      "Team",
      "Country",
      "Nation",
      "Association",
      "Member Association",
      "Member Association Name"
    ]) || inferredColumn(row, (header) => (
      /team|country|nation|association/i.test(header) && !/rank|point|score/i.test(header)
    ));
  }

  function rankLookupKey(teamName) {
    const key = normalizeKey(teamName);
    return RANKING_ALIASES[key] || key;
  }

  function rankingValue(row) {
    return firstPresent(row, [
      "Rank",
      "Ranking",
      "FIFA Rank",
      "FIFA Ranking",
      "Current Rank",
      "Rank_2026Apr"
    ]) || inferredColumn(row, (header) => /rank/i.test(header) && !/previous|prior|old/i.test(header));
  }

  function firstPresent(row, headers) {
    for (const header of headers) {
      if (row[header]) return row[header];
    }
    return "";
  }

  function inferredColumn(row, predicate) {
    const key = Object.keys(row).find((header) => predicate(header) && row[header]);
    return key ? row[key] : "";
  }

  function renderSummary() {
    const leader = state.assignments[0];
    el.participantCount.textContent = state.assignments.length;
    el.teamCount.textContent = state.teams.length;
    el.leaderName.textContent = leader ? leader["Participant Name"] : "--";
  }

  function renderParticipantSelect() {
    const current = state.selectedParticipant;
    const options = [
      `<option value="">Everyone</option>`,
      ...state.assignments.map((person) => {
        const name = person["Participant Name"];
        return `<option value="${escapeHtml(name)}"${name === current ? " selected" : ""}>${escapeHtml(name)}</option>`;
      })
    ];
    el.participantSelect.innerHTML = options.join("");
  }

  function renderMyPool() {
    const selected = getSelectedParticipant();
    if (!selected) {
      el.myPoolView.hidden = true;
      el.myPoolView.innerHTML = "";
      return;
    }

    el.myPoolView.hidden = false;
    el.myPoolView.innerHTML = `
      <div class="my-pool-copy">
        <p class="eyebrow">My Pool</p>
        <h2>${escapeHtml(selected["Participant Name"])}</h2>
        <div class="my-pool-stats">
          <span>Rank <strong>#${selected.displayRank}</strong></span>
          <span>Points <strong>${selected.points}</strong></span>
        </div>
      </div>
      <div class="my-teams">
        ${myTeamCard(selected["Tier A Team"], selected.tierA, "A")}
        ${myTeamCard(selected["Tier B Team"], selected.tierB, "B")}
      </div>
    `;
  }

  function myTeamCard(name, team, tier) {
    const points = numberValue(team["Total Team Points"]);
    const wins = numberValue(team["Group Stage Wins"]);
    const draws = numberValue(team["Group Stage Draws"]);
    return `
      <article class="my-team">
        <span class="tier-dot">Tier ${tier}</span>
        <strong>${flagHtml(name)}${teamLabel(name, team)}</strong>
        <span>Group ${escapeHtml(team.Group || "TBD")} - ${points} pts</span>
        <small>${wins} wins / ${draws} draws</small>
      </article>
    `;
  }

  function getSelectedParticipant() {
    if (!state.selectedParticipant) return null;
    return state.assignments.find((person) => person["Participant Name"] === state.selectedParticipant) || null;
  }

  function renderLeaderboard() {
    const query = normalize(state.participantQuery);
    const filtered = state.assignments.filter((person) => normalize(person["Participant Name"]).includes(query));

    el.leaderboard.innerHTML = filtered.map((person, index) => `
      <article class="standing-row ${person["Participant Name"] === state.selectedParticipant ? "is-selected" : ""}">
        <div class="rank">${person.displayRank || person.rank || index + 1}</div>
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
    return `<span class="pill"><b>${tier}</b>${flagHtml(name)}${teamLabel(name, team)}</span>`;
  }

  function renderTeams() {
    const query = normalize(state.teamQuery);
    const filtered = state.teams.filter((team) => {
      const haystack = [
        team["Team Name"],
        team.Group,
        team["Super Tier"],
        team["Assigned Participant"],
        team["FIFA Rank"]
      ].map(normalize).join(" ");
      return haystack.includes(query);
    });

    el.teamsGrid.innerHTML = filtered.map((team) => `
      <article class="team-card">
        <header>
          <div>
            <strong>${flagHtml(team["Team Name"])}${teamLabel(team["Team Name"], team)}</strong>
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
        <div class="rank">${person.displayRank || person.rank || index + 1}</div>
        <div>
          <strong>${escapeHtml(person["Participant Name"])}</strong>
          <div class="updated">${flagHtml(person["Tier A Team"])}${teamLabel(person["Tier A Team"], person.tierA)} / ${flagHtml(person["Tier B Team"])}${teamLabel(person["Tier B Team"], person.tierB)}</div>
        </div>
        <strong>${person.points} pts</strong>
      </div>
    `).join("");
    el.widgetUpdated.textContent = state.lastUpdatedAt ? `Updated ${formatTimestamp(state.lastUpdatedAt)}` : "";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function flagHtml(teamName) {
    const code = FLAG_CODES[teamKey(teamName)];
    const label = escapeHtml(teamName);
    return code ? `<img class="flag" src="https://flagcdn.com/w40/${code}.png" alt="" aria-hidden="true" loading="lazy"><span class="sr-only">${label} flag</span>` : "";
  }

  function teamLabel(name, team) {
    return `${escapeHtml(name)}${fifaRankHtml(team)}`;
  }

  function fifaRankHtml(team) {
    const rank = numberValue(team?.["FIFA Rank"]);
    return rank ? ` <span class="fifa-rank">(${rank})</span>` : "";
  }

  function teamKey(teamName) {
    return String(teamName || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  async function refreshData() {
    el.loadStatus.textContent = "Loading sheet data";
    el.refreshButton.disabled = true;
    try {
      const [assignments, teams, results, rankings] = await Promise.all([
        loadSheet(SHEETS.assignments),
        loadSheet(SHEETS.teams),
        loadSheet(SHEETS.results),
        loadSheet(SHEETS.rankings).catch(() => [])
      ]);
      state.assignments = assignments;
      state.teams = teams;
      state.results = results;
      state.rankings = rankings;
      state.lastUpdatedAt = new Date();
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
    renderParticipantSelect();
    renderMyPool();
    renderLeaderboard();
    renderTeams();
    renderWidget();
    renderLastUpdated();
  }

  function renderLastUpdated() {
    el.lastUpdated.textContent = state.lastUpdatedAt ? formatTimestamp(state.lastUpdatedAt) : "Loading...";
  }

  function formatTimestamp(date) {
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
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
    el.participantSelect.addEventListener("change", (event) => {
      state.selectedParticipant = event.target.value;
      if (state.selectedParticipant) {
        localStorage.setItem("worldCupPoolParticipant", state.selectedParticipant);
      } else {
        localStorage.removeItem("worldCupPoolParticipant");
      }
      renderAll();
    });
    el.participantSearch.addEventListener("input", (event) => {
      state.participantQuery = event.target.value;
      renderLeaderboard();
    });
    el.teamSearch.addEventListener("input", (event) => {
      state.teamQuery = event.target.value;
      renderTeams();
    });

    refreshData();
    registerServiceWorker();
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (!/^https?:$/.test(window.location.protocol)) return;
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }

  init();
})();
