(function () {
  const SHEET_ID = "1Ac5ecT-orrmgJ2h4-a8N-YYyMS3R_AosYFcgoATIBgk";
  const SHEETS = {
    assignments: "4",
    teams: "1",
    results: "5",
    rankings: { sheet: "Rank_2026Apr" }
  };

  const ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
  const PACIFIC_TIME_ZONE = "America/Los_Angeles";

  const state = {
    assignments: [],
    teams: [],
    results: [],
    rankings: [],
    participantQuery: "",
    teamQuery: "",
    scheduleDate: pacificDateInput(new Date()),
    scheduleParticipant: "",
    scheduleMatches: [],
    scheduleLoading: false,
    scheduleError: "",
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

  const TEAM_ALIASES = {
    "congo dr": "dr congo",
    "cote d ivoire": "ivory coast",
    "czech republic": "czechia",
    "d r congo": "dr congo",
    "dr congo": "dr congo",
    "ivory coast": "ivory coast",
    "united states": "united states",
    "usa": "united states"
  };

  const el = {
    loadStatus: document.querySelector("#loadStatus"),
    refreshButton: document.querySelector("#refreshButton"),
    participantCount: document.querySelector("#participantCount"),
    teamCount: document.querySelector("#teamCount"),
    leaderName: document.querySelector("#leaderName"),
    leaderboard: document.querySelector("#leaderboard"),
    teamsGrid: document.querySelector("#teamsGrid"),
    scheduleDate: document.querySelector("#scheduleDate"),
    scheduleParticipant: document.querySelector("#scheduleParticipant"),
    scheduleStatus: document.querySelector("#scheduleStatus"),
    scheduleMatches: document.querySelector("#scheduleMatches"),
    participantsInAction: document.querySelector("#participantsInAction"),
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

  async function refreshSchedule() {
    state.scheduleLoading = true;
    state.scheduleError = "";
    renderSchedule();
    try {
      const params = new URLSearchParams({ dates: espnDateParam(state.scheduleDate) });
      const response = await fetch(`${ESPN_SCOREBOARD_URL}?${params.toString()}`);
      if (!response.ok) throw new Error("Could not load ESPN fixtures");
      const data = await response.json();
      state.scheduleMatches = normalizeScheduleEvents(data.events || []);
    } catch (error) {
      state.scheduleMatches = [];
      state.scheduleError = error.message || "Could not load ESPN fixtures";
    } finally {
      state.scheduleLoading = false;
      renderSchedule();
    }
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

  function pacificDateInput(date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: PACIFIC_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date).reduce((record, part) => {
      record[part.type] = part.value;
      return record;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function espnDateParam(dateValue) {
    return String(dateValue || "").replace(/-/g, "");
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

    const rankCounts = state.assignments.reduce((counts, person) => {
      const key = String(person.points);
      counts.set(key, (counts.get(key) || 0) + 1);
      return counts;
    }, new Map());

    let currentRank = 0;
    let previousPoints = null;
    state.assignments = state.assignments.map((person, index) => {
      if (person.points !== previousPoints) {
        currentRank = index + 1;
        previousPoints = person.points;
      }
      const tied = (rankCounts.get(String(person.points)) || 0) > 1;
      return {
        ...person,
        displayRank: currentRank,
        isTied: tied,
        rankLabel: `${tied ? "T-" : ""}${currentRank}`
      };
    });
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
    const tiedLeaders = leader ? state.assignments.filter((person) => person.points === leader.points) : [];
    el.participantCount.textContent = state.assignments.length;
    el.teamCount.textContent = state.teams.length;
    el.leaderName.textContent = leader ? leaderSummary(tiedLeaders) : "--";
  }

  function leaderSummary(tiedLeaders) {
    if (tiedLeaders.length <= 1) return tiedLeaders[0]["Participant Name"];
    return `${tiedLeaders.length} tied`;
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
          <span>Rank <strong>${rankLabel(selected)}</strong></span>
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
        <div class="rank ${person.isTied ? "is-tied" : ""}" title="${person.isTied ? "Tied rank" : "Rank"}">${rankLabel(person, index)}</div>
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

  function normalizeScheduleEvents(events) {
    return events.map((event) => {
      const competition = event.competitions?.[0] || {};
      const competitors = competition.competitors || [];
      const teams = competitors.map((competitor) => scheduleTeamFromCompetitor(competitor));
      const away = teams.find((team) => team.homeAway === "away") || teams[0] || schedulePlaceholder("TBD");
      const home = teams.find((team) => team.homeAway === "home") || teams[1] || schedulePlaceholder("TBD");
      return {
        id: event.id,
        name: event.name || event.shortName || `${away.name} vs ${home.name}`,
        date: event.date || competition.date || "",
        status: event.status?.type?.shortDetail || event.status?.type?.description || event.status?.type?.name || "",
        away,
        home
      };
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  function scheduleTeamFromCompetitor(competitor) {
    const team = competitor.team || {};
    const name = team.displayName || team.name || team.shortDisplayName || competitor.displayName || competitor.name || "TBD";
    return {
      name,
      homeAway: competitor.homeAway || "",
      score: competitor.score,
      winner: competitor.winner,
      isPlaceholder: isPlaceholderTeam(name)
    };
  }

  function schedulePlaceholder(name) {
    return {
      name,
      homeAway: "",
      isPlaceholder: true
    };
  }

  function isPlaceholderTeam(name) {
    const key = normalizeKey(name);
    return !key || /\btbd\b|to be determined|winner|runner up|runnerup|group [a-z0-9]+|^[0-9][a-z]$/.test(key);
  }

  function renderScheduleParticipantSelect() {
    const participants = participantsFromTeams();
    const options = [
      `<option value="">Everyone</option>`,
      ...participants.map((name) => `<option value="${escapeHtml(name)}"${name === state.scheduleParticipant ? " selected" : ""}>${escapeHtml(name)}</option>`)
    ];
    el.scheduleParticipant.innerHTML = options.join("");
  }

  function participantsFromTeams() {
    return [...new Set(state.teams.map((team) => team["Assigned Participant"]).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
  }

  function renderSchedule() {
    if (!el.scheduleDate) return;
    renderScheduleParticipantSelect();
    el.scheduleDate.value = state.scheduleDate;

    if (state.scheduleLoading) {
      el.scheduleStatus.textContent = "Loading ESPN fixtures";
    } else if (state.scheduleError) {
      el.scheduleStatus.textContent = state.scheduleError;
    } else {
      const matchCount = visibleScheduleMatches().length;
      el.scheduleStatus.textContent = `${matchCount} ${matchCount === 1 ? "match" : "matches"} on ${formatScheduleDate(state.scheduleDate)}`;
    }

    renderScheduleMatches();
    renderParticipantsInAction();
  }

  function visibleScheduleMatches() {
    return state.scheduleMatches.filter((match) => {
      if (!state.scheduleParticipant) return true;
      return matchOwners(match).includes(state.scheduleParticipant);
    });
  }

  function renderScheduleMatches() {
    const matches = visibleScheduleMatches();
    if (!matches.length) {
      el.scheduleMatches.innerHTML = emptyScheduleMessage();
      return;
    }

    el.scheduleMatches.innerHTML = matches.map((match) => `
      <article class="schedule-card">
        <time>${escapeHtml(formatKickoff(match.date))}</time>
        <div class="match-main">
          <strong>${teamDisplay(match.away)} <span>vs</span> ${teamDisplay(match.home)}</strong>
          <small>${escapeHtml(match.status || "Status TBD")}</small>
        </div>
        <div class="match-owners">${ownerBadges(matchOwners(match))}</div>
      </article>
    `).join("");
  }

  function renderParticipantsInAction() {
    const rows = visibleScheduleMatches().flatMap((match) => {
      return [match.away, match.home].map((team, index, allTeams) => {
        const opponent = allTeams[index === 0 ? 1 : 0];
        const owner = ownerForTeam(team).participant;
        return {
          participant: owner,
          time: formatKickoff(match.date),
          team,
          opponent
        };
      });
    }).filter((row) => {
      if (row.participant === "TBD") return !state.scheduleParticipant;
      return !state.scheduleParticipant || row.participant === state.scheduleParticipant;
    }).sort((a, b) => a.participant.localeCompare(b.participant) || a.time.localeCompare(b.time));

    if (!rows.length) {
      el.participantsInAction.innerHTML = emptyScheduleMessage("No participants in action for this filter.");
      return;
    }

    el.participantsInAction.innerHTML = rows.map((row) => `
      <article class="action-row">
        <strong>${escapeHtml(row.participant)}</strong>
        <time>${escapeHtml(row.time)}</time>
        <span>${teamDisplay(row.team)}</span>
        <span>${teamDisplay(row.opponent)}</span>
      </article>
    `).join("");
  }

  function ownerForTeam(team) {
    if (!team || team.isPlaceholder || isPlaceholderTeam(team.name)) {
      return { participant: "TBD", team: team?.name || "TBD" };
    }
    const owners = teamOwnershipMap();
    const key = scheduleLookupKey(team.name);
    const owner = owners.get(key);
    return owner || { participant: "TBD", team: team.name };
  }

  function matchOwners(match) {
    return [ownerForTeam(match.away).participant, ownerForTeam(match.home).participant]
      .filter(Boolean)
      .filter((owner, index, owners) => owners.indexOf(owner) === index);
  }

  function teamOwnershipMap() {
    const owners = new Map();
    state.teams.forEach((team) => {
      const teamName = team["Team Name"];
      const participant = team["Assigned Participant"];
      if (!teamName || !participant) return;
      const canonicalKey = normalizeKey(teamName);
      owners.set(canonicalKey, { participant, team: teamName });
      owners.set(scheduleLookupKey(teamName), { participant, team: teamName });
      Object.entries(TEAM_ALIASES).forEach(([alias, canonical]) => {
        if (alias === canonicalKey || canonical === canonicalKey || canonical === scheduleLookupKey(teamName)) {
          owners.set(alias, { participant, team: teamName });
          owners.set(canonical, { participant, team: teamName });
        }
      });
    });
    return owners;
  }

  function scheduleLookupKey(teamName) {
    const key = normalizeKey(teamName);
    return TEAM_ALIASES[key] || key;
  }

  function ownerBadges(owners) {
    return owners.map((owner) => `<span class="owner-badge ${owner === "TBD" ? "is-tbd" : ""}">${escapeHtml(owner)}</span>`).join("");
  }

  function teamDisplay(team) {
    if (!team || team.isPlaceholder || isPlaceholderTeam(team.name)) return escapeHtml(team?.name || "TBD");
    const owner = ownerForTeam(team);
    return `${flagHtml(owner.team)}${escapeHtml(team.name)}`;
  }

  function formatKickoff(value) {
    if (!value) return "Time TBD";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Time TBD";
    return date.toLocaleTimeString([], {
      timeZone: PACIFIC_TIME_ZONE,
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short"
    });
  }

  function formatScheduleDate(value) {
    if (!value) return "selected date";
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  }

  function emptyScheduleMessage(message = "No matches found for this date.") {
    return `<p class="empty-state">${escapeHtml(message)}</p>`;
  }

  function renderWidget() {
    const topFive = state.assignments.slice(0, 5);
    el.widgetList.innerHTML = topFive.map((person, index) => `
      <div class="widget-row">
        <div class="rank ${person.isTied ? "is-tied" : ""}" title="${person.isTied ? "Tied rank" : "Rank"}">${rankLabel(person, index)}</div>
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

  function rankLabel(person, fallbackIndex = 0) {
    return person.rankLabel || String(person.displayRank || person.rank || fallbackIndex + 1);
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
    renderSchedule();
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
    el.scheduleDate.value = state.scheduleDate;
    el.scheduleDate.addEventListener("change", (event) => {
      state.scheduleDate = event.target.value || pacificDateInput(new Date());
      refreshSchedule();
    });
    el.scheduleParticipant.addEventListener("change", (event) => {
      state.scheduleParticipant = event.target.value;
      renderSchedule();
    });

    refreshData();
    refreshSchedule();
    registerServiceWorker();
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (!/^https?:$/.test(window.location.protocol)) return;
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }

  init();
})();
