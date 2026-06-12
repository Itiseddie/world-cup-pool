(function () {
  const SHEET_ID = "1Ac5ecT-orrmgJ2h4-a8N-YYyMS3R_AosYFcgoATIBgk";
  const TEAMS_SHEET = "1";
  const ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
  const PACIFIC_TIME_ZONE = "America/Los_Angeles";
  const WORLD_CUP_START_DATE = "2026-06-11";
  const WORLD_CUP_END_DATE = "2026-07-19";

  const TEAM_ALIASES = {
    bosnia: "bosnia and herzegovina",
    "bosnia herzegovina": "bosnia and herzegovina",
    "bosnia herz": "bosnia and herzegovina",
    "congo dr": "dr congo",
    "cote d ivoire": "ivory coast",
    "czech republic": "czechia",
    "d r congo": "dr congo",
    "dr congo": "dr congo",
    usa: "united states",
    "united states": "united states"
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

  const state = { teams: null, matches: null, loading: false };

  const el = {
    scheduleDate: document.querySelector("#scheduleDate"),
    scheduleParticipant: document.querySelector("#scheduleParticipant"),
    scheduleStatus: document.querySelector("#scheduleStatus"),
    scheduleMatches: document.querySelector("#scheduleMatches"),
    participantsInAction: document.querySelector("#participantsInAction")
  };

  if (!el.scheduleDate || !el.scheduleParticipant || !el.scheduleMatches || !el.participantsInAction) return;

  const controls = el.scheduleParticipant.closest(".schedule-controls");
  const resetButton = document.createElement("button");
  resetButton.id = "scheduleReset";
  resetButton.className = "schedule-reset-button";
  resetButton.type = "button";
  resetButton.hidden = true;
  resetButton.textContent = "Reset to default";

  const filterNote = document.createElement("p");
  filterNote.id = "scheduleFilterNote";
  filterNote.className = "schedule-filter-note";
  filterNote.hidden = true;
  filterNote.textContent = "Participant filter shows all matches for that person. Switch back to Everyone to use the date filter.";

  controls?.append(resetButton, filterNote);

  function loadSheet(sheet) {
    const params = new URLSearchParams({ headers: "1", tqx: "" });
    const callback = `participantSchedule_${sheet}_${Date.now()}`.replace(/\W/g, "_");
    params.set("tqx", `responseHandler:${callback}`);
    params.set("gid", sheet);
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

  async function loadParticipantSchedule() {
    if (state.loading) return;
    const participant = el.scheduleParticipant.value;
    if (!participant) return;

    state.loading = true;
    setParticipantMode(true);
    el.scheduleStatus.textContent = "Loading all matches for participant";
    el.scheduleMatches.innerHTML = emptyMessage("Loading matches...");
    el.participantsInAction.innerHTML = emptyMessage("Loading matches...");

    try {
      if (!state.teams) state.teams = await loadSheet(TEAMS_SHEET);
      if (!state.matches) state.matches = await fetchTournamentMatches();
      renderParticipantSchedule(participant);
    } catch (error) {
      el.scheduleStatus.textContent = error.message || "Could not load participant schedule";
      el.scheduleMatches.innerHTML = emptyMessage("Could not load participant schedule.");
      el.participantsInAction.innerHTML = emptyMessage("Could not load participant schedule.");
    } finally {
      state.loading = false;
    }
  }

  async function fetchTournamentMatches() {
    const matches = [];
    for (const date of dateRange(WORLD_CUP_START_DATE, WORLD_CUP_END_DATE)) {
      const params = new URLSearchParams({ dates: date.replace(/-/g, "") });
      const response = await fetch(`${ESPN_SCOREBOARD_URL}?${params.toString()}`);
      if (!response.ok) throw new Error("Could not load ESPN fixtures");
      const data = await response.json();
      matches.push(...normalizeEvents(data.events || []));
    }
    return matches.sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  function normalizeEvents(events) {
    return events.map((event) => {
      const competition = event.competitions?.[0] || {};
      const competitors = competition.competitors || [];
      const teams = competitors.map((competitor) => scheduleTeamFromCompetitor(competitor));
      const away = teams.find((team) => team.homeAway === "away") || teams[0] || placeholderTeam("TBD");
      const home = teams.find((team) => team.homeAway === "home") || teams[1] || placeholderTeam("TBD");
      return {
        id: event.id,
        date: event.date || competition.date || "",
        status: event.status?.type?.shortDetail || event.status?.type?.description || event.status?.type?.name || "",
        state: event.status?.type?.state || "",
        away,
        home
      };
    });
  }

  function scheduleTeamFromCompetitor(competitor) {
    const team = competitor.team || {};
    const name = team.displayName || team.name || team.shortDisplayName || competitor.displayName || competitor.name || "TBD";
    return {
      name,
      homeAway: competitor.homeAway || "",
      score: competitor.score,
      isPlaceholder: isPlaceholderTeam(name)
    };
  }

  function placeholderTeam(name) {
    return { name, homeAway: "", isPlaceholder: true };
  }

  function renderParticipantSchedule(participant) {
    const matches = state.matches.filter((match) => matchOwners(match).includes(participant));
    el.scheduleStatus.textContent = `${matches.length} ${matches.length === 1 ? "match" : "matches"} for ${participant}`;

    if (!matches.length) {
      el.scheduleMatches.innerHTML = emptyMessage("No matches found for this participant.");
      el.participantsInAction.innerHTML = emptyMessage("No participants in action for this filter.");
      return;
    }

    el.scheduleMatches.innerHTML = matches.map((match) => `
      <article class="schedule-card">
        <time>${escapeHtml(formatKickoff(match.date, true))}</time>
        <div class="match-main">
          <strong>${teamWithScore(match.away, match)} <span>vs</span> ${teamWithScore(match.home, match)}</strong>
          <small>${escapeHtml(match.status || "Status TBD")}</small>
        </div>
        <div class="match-owners">${ownerBadges(matchOwners(match))}</div>
      </article>
    `).join("");

    const rows = matches.flatMap((match) => [match.away, match.home].map((team, index, teams) => {
      const opponent = teams[index === 0 ? 1 : 0];
      return {
        participant: ownerForTeam(team).participant,
        time: formatKickoff(match.date, true),
        team,
        opponent,
        match
      };
    })).filter((row) => row.participant === participant);

    el.participantsInAction.innerHTML = rows.map((row) => `
      <article class="action-row">
        <div class="action-heading">
          <strong>${escapeHtml(row.participant)}</strong>
          <time>${escapeHtml(row.time)}</time>
        </div>
        <div class="action-matchup">
          <span class="action-team">${teamWithScore(row.team, row.match)}</span>
          <span class="action-opponent">${teamWithScore(row.opponent, row.match)}</span>
        </div>
      </article>
    `).join("");
  }

  function ownerForTeam(team) {
    if (!team || team.isPlaceholder || isPlaceholderTeam(team.name)) return { participant: "TBD", team: team?.name || "TBD" };
    const owners = teamOwnershipMap();
    return owners.get(scheduleLookupKey(team.name)) || { participant: "TBD", team: team.name };
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

  function matchOwners(match) {
    return [ownerForTeam(match.away).participant, ownerForTeam(match.home).participant]
      .filter(Boolean)
      .filter((owner, index, owners) => owners.indexOf(owner) === index);
  }

  function setParticipantMode(enabled) {
    el.scheduleDate.value = enabled ? "" : pacificDateInput(new Date());
    el.scheduleDate.disabled = enabled;
    resetButton.hidden = !enabled;
    filterNote.hidden = !enabled;
  }

  function resetToDefault() {
    state.matches = null;
    el.scheduleParticipant.value = "";
    setParticipantMode(false);
    el.scheduleDate.dispatchEvent(new Event("change", { bubbles: true }));
    el.scheduleParticipant.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function dateRange(startDate, endDate) {
    const dates = [];
    const current = dateInputToLocalDate(startDate);
    const end = dateInputToLocalDate(endDate);
    while (current <= end) {
      dates.push(localDateInput(current));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }

  function dateInputToLocalDate(value) {
    const [year, month, day] = String(value || "").split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function localDateInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
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

  function formatKickoff(value, includeDate) {
    if (!value) return "Time TBD";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Time TBD";
    const options = {
      timeZone: PACIFIC_TIME_ZONE,
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short"
    };
    if (includeDate) {
      options.month = "short";
      options.day = "numeric";
    }
    return date.toLocaleString([], options);
  }

  function teamWithScore(team, match) {
    return `${teamDisplay(team)}${scoreHtml(team, match)}`;
  }

  function teamDisplay(team) {
    if (!team || team.isPlaceholder || isPlaceholderTeam(team.name)) return escapeHtml(team?.name || "TBD");
    const owner = ownerForTeam(team);
    return `${flagHtml(owner.team)}${escapeHtml(team.name)}`;
  }

  function scoreHtml(team, match) {
    if (!hasScore(team) || isPregame(match)) return "";
    return ` <span class="match-score" aria-label="Score ${escapeHtml(team.score)}">${escapeHtml(team.score)}</span>`;
  }

  function hasScore(team) {
    return team && team.score !== undefined && team.score !== null && String(team.score) !== "";
  }

  function isPregame(match) {
    const stateName = String(match?.state || "").toLowerCase();
    const status = String(match?.status || "").toLowerCase();
    return stateName === "pre" || status === "scheduled";
  }

  function ownerBadges(owners) {
    return owners.map((owner) => `<span class="owner-badge ${owner === "TBD" ? "is-tbd" : ""}">${escapeHtml(owner)}</span>`).join("");
  }

  function flagHtml(teamName) {
    const code = FLAG_CODES[teamKey(teamName)];
    const label = escapeHtml(teamName);
    return code ? `<img class="flag" src="https://flagcdn.com/w40/${code}.png" alt="" aria-hidden="true" loading="lazy"><span class="sr-only">${label} flag</span>` : "";
  }

  function scheduleLookupKey(teamName) {
    const key = normalizeKey(teamName);
    return TEAM_ALIASES[key] || key;
  }

  function teamKey(teamName) {
    return String(teamName || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function normalizeKey(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function isPlaceholderTeam(name) {
    const key = normalizeKey(name);
    return !key || /\btbd\b|to be determined|winner|runner up|runnerup|group [a-z0-9]+|^[0-9][a-z]$/.test(key);
  }

  function emptyMessage(message) {
    return `<p class="empty-state">${escapeHtml(message)}</p>`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  el.scheduleParticipant.addEventListener("change", () => {
    if (el.scheduleParticipant.value) {
      window.setTimeout(loadParticipantSchedule, 0);
    } else {
      setParticipantMode(false);
    }
  });
  resetButton.addEventListener("click", resetToDefault);
})();
