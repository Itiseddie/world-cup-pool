(function () {
  const SHEET_ID = "1Ac5ecT-orrmgJ2h4-a8N-YYyMS3R_AosYFcgoATIBgk";
  const TEAMS_GID = "1";
  const ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
  const WORLD_CUP_START_DATE = "2026-06-11";
  const WORLD_CUP_END_DATE = "2026-07-19";
  const PACIFIC_TIME_ZONE = "America/Los_Angeles";

  const TEAM_ALIASES = {
    "bosnia herzegovina": "bosnia and herzegovina",
    "congo dr": "dr congo",
    "cote d ivoire": "ivory coast",
    "czech republic": "czechia",
    "d r congo": "dr congo",
    "dr congo": "dr congo",
    "ivory coast": "ivory coast",
    "united states": "united states",
    "usa": "united states"
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

  const scheduleView = document.querySelector("#scheduleView");
  if (!scheduleView) return;
  const scheduleDate = document.querySelector("#scheduleDate");
  const scheduleParticipant = document.querySelector("#scheduleParticipant");
  const scheduleStatus = document.querySelector("#scheduleStatus");
  const scheduleMatches = document.querySelector("#scheduleMatches");
  const participantsInAction = document.querySelector("#participantsInAction");
  const dashboardTitle = document.querySelector(".topbar h1");
  const resetButton = document.createElement("button");
  const participantNote = document.createElement("p");

  let ownershipRows = [];
  let tournamentMatches = null;
  let ownershipRepairStarted = false;
  const scheduleMatchesByDate = new Map();
  const scheduleScoresLoading = new Set();

  resetButton.type = "button";
  resetButton.className = "schedule-reset-button";
  resetButton.textContent = "Reset to default";
  resetButton.hidden = true;
  participantNote.className = "schedule-filter-note";
  participantNote.hidden = true;
  participantNote.textContent = "Participant view shows all tournament matches. To look for just today's games, switch Participant back to Everyone.";
  scheduleParticipant?.closest(".schedule-controls")?.append(resetButton, participantNote);

  function syncDashboardTitle() {
    const activeTab = document.querySelector(".tab.is-active[data-view]");
    if (!dashboardTitle || !activeTab) return;
    dashboardTitle.textContent = activeTab.textContent.trim() || "Schedule";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeTimeLabel(time) {
    if (!time || /TBD|PT$/.test(time.textContent)) return;
    time.textContent = time.textContent.replace(/\s(?:GMT[+-]\d+|PDT|PST)$/i, " PT");
  }

  function normalizeKey(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function polishMatchCard(card) {
    if (card.dataset.polished === "true") return;
    const time = card.querySelector("time");
    const matchMain = card.querySelector(".match-main");
    const teamLine = matchMain?.querySelector("strong");
    const status = matchMain?.querySelector("small")?.textContent || "Status TBD";
    const owners = [...card.querySelectorAll(".owner-badge")].map((owner) => owner.textContent.trim());
    const teams = teamLine?.innerHTML.split(/\s*<span>vs<\/span>\s*/i);
    if (!time || !teams || teams.length !== 2) return;

    normalizeTimeLabel(time);
    card.innerHTML = `
      <div class="match-meta">
        <time>${escapeHtml(time.textContent)}</time>
        <small>${escapeHtml(status)}</small>
      </div>
      <div class="matchup">
        <div class="match-team">
          <strong>${teams[0]}</strong>
          <span class="owner-badge ${owners[0] === "TBD" ? "is-tbd" : ""}">${escapeHtml(owners[0] || "TBD")}</span>
        </div>
        <span class="versus">vs</span>
        <div class="match-team">
          <strong>${teams[1]}</strong>
          <span class="owner-badge ${owners[1] === "TBD" ? "is-tbd" : ""}">${escapeHtml(owners[1] || owners[0] || "TBD")}</span>
        </div>
      </div>
    `;
    card.dataset.polished = "true";
  }

  function polishActionRow(row) {
    if (row.dataset.polished === "true") return;
    const participant = row.querySelector("strong");
    const time = row.querySelector("time");
    const team = row.querySelector("span:nth-of-type(1)");
    const opponent = row.querySelector("span:nth-of-type(2)");
    if (!participant || !time || !team || !opponent) return;

    normalizeTimeLabel(time);
    row.innerHTML = `
      <div class="action-owner">
        <strong>${escapeHtml(participant.textContent)}</strong>
        <span>${team.innerHTML}</span>
      </div>
      <time>${escapeHtml(time.textContent)}</time>
      <span class="action-opponent">${opponent.innerHTML}</span>
    `;
    row.dataset.polished = "true";
  }

  function polishSchedule() {
    scheduleView.querySelectorAll(".schedule-card").forEach(polishMatchCard);
    scheduleView.querySelectorAll(".action-row").forEach(polishActionRow);
    scheduleView.querySelectorAll("time").forEach(normalizeTimeLabel);
    sortRenderedSchedule();
    repairVisibleOwnership();
    repairVisibleScores();
  }

  function sortRenderedSchedule() {
    sortCardsByTime(scheduleMatches);
    sortCardsByTime(participantsInAction);
  }

  function sortCardsByTime(container) {
    if (!container) return;
    const cards = [...container.children].filter((child) => child.matches(".schedule-card, .action-row"));
    if (cards.length < 2) return;
    const sorted = [...cards].sort((a, b) => cardTimeValue(a) - cardTimeValue(b));
    const changed = sorted.some((card, index) => card !== cards[index]);
    if (!changed) return;
    sorted.forEach((card) => container.appendChild(card));
  }

  function cardTimeValue(card) {
    return timeLabelValue(card.querySelector("time")?.textContent || "");
  }

  function timeLabelValue(label) {
    const clean = String(label || "").replace(/\s+PT$/i, "").trim();
    const match = clean.match(/^(?:(\w{3})\s+(\d{1,2}),\s+)?(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (!match) return Number.POSITIVE_INFINITY;
    const [, month, day, rawHour, rawMinute = "0", meridiem] = match;
    let hour = Number(rawHour);
    const minute = Number(rawMinute);
    if (meridiem) {
      const upper = meridiem.toUpperCase();
      if (upper === "PM" && hour !== 12) hour += 12;
      if (upper === "AM" && hour === 12) hour = 0;
    }
    const dayOffset = month ? monthIndex(month) * 40 + Number(day || 0) : 0;
    return dayOffset * 1440 + hour * 60 + minute;
  }

  function monthIndex(month) {
    return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(String(month).slice(0, 3).toLowerCase());
  }

  function loadTeamsMaster() {
    if (ownershipRows.length) return Promise.resolve(ownershipRows);
    const params = new URLSearchParams({
      gid: TEAMS_GID,
      headers: "1",
      tqx: ""
    });
    const callback = `scheduleTeams_${Date.now()}`.replace(/\W/g, "_");
    params.set("tqx", `responseHandler:${callback}`);

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Team ownership request timed out"));
      }, 12000);

      function cleanup() {
        window.clearTimeout(timeout);
        delete window[callback];
        script.remove();
      }

      window[callback] = (response) => {
        cleanup();
        if (response.status === "error") {
          reject(new Error(response.errors?.[0]?.detailed_message || "Could not load team ownership"));
          return;
        }
        ownershipRows = tableToRows(response.table);
        resolve(ownershipRows);
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("Could not load team ownership"));
      };

      script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?${params.toString()}`;
      document.head.appendChild(script);
    });
  }

  function repairVisibleOwnership() {
    if (ownershipRows.length) {
      repairScheduleCards(ownershipMap());
      return;
    }
    if (ownershipRepairStarted) return;
    ownershipRepairStarted = true;
    loadTeamsMaster()
      .then(() => repairScheduleCards(ownershipMap()))
      .catch(() => {})
      .finally(() => {
        ownershipRepairStarted = false;
      });
  }

  function repairScheduleCards(owners) {
    scheduleView.querySelectorAll(".schedule-card").forEach((card) => {
      const teams = [...card.querySelectorAll(".match-team")];
      teams.forEach((teamBlock) => {
        const teamName = cleanTeamName(teamBlock.querySelector("strong"));
        const badge = teamBlock.querySelector(".owner-badge");
        if (!teamName || !badge) return;
        const owner = ownerForTeam({ name: teamName, isPlaceholder: isPlaceholderTeam(teamName) }, owners).participant;
        if (!owner || owner === "TBD") return;
        if (badge.textContent.trim() === owner && !badge.classList.contains("is-tbd")) return;
        badge.textContent = owner;
        badge.classList.remove("is-tbd");
      });
    });
  }

  function cleanTeamName(strong) {
    if (!strong) return "";
    const clone = strong.cloneNode(true);
    clone.querySelectorAll("img, .sr-only, .match-score").forEach((node) => node.remove());
    return clone.textContent.trim();
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

  async function fetchTournamentMatches() {
    if (tournamentMatches) return tournamentMatches;
    const batches = await Promise.all(dateRange(WORLD_CUP_START_DATE, WORLD_CUP_END_DATE).map(fetchScheduleDate));
    tournamentMatches = batches.flat().sort((a, b) => new Date(a.date) - new Date(b.date));
    return tournamentMatches;
  }

  async function fetchScheduleDate(dateValue) {
    const params = new URLSearchParams({ dates: dateValue.replace(/-/g, "") });
    const response = await fetch(`${ESPN_SCOREBOARD_URL}?${params.toString()}`);
    if (!response.ok) throw new Error("Could not load ESPN fixtures");
    const data = await response.json();
    const matches = (data.events || []).map(normalizeEvent);
    scheduleMatchesByDate.set(dateValue, matches);
    return matches;
  }

  function normalizeEvent(event) {
    const competition = event.competitions?.[0] || {};
    const competitors = competition.competitors || [];
    const teams = competitors.map((competitor) => {
      const team = competitor.team || {};
      const name = team.displayName || team.name || team.shortDisplayName || competitor.displayName || competitor.name || "TBD";
      return {
        name,
        homeAway: competitor.homeAway || "",
        isPlaceholder: isPlaceholderTeam(name),
        score: competitor.score ?? ""
      };
    });
    const away = teams.find((team) => team.homeAway === "away") || teams[0] || schedulePlaceholder();
    const home = teams.find((team) => team.homeAway === "home") || teams[1] || schedulePlaceholder();
    return {
      id: event.id,
      date: event.date || competition.date || "",
      status: event.status?.type?.shortDetail || event.status?.type?.description || event.status?.type?.name || "",
      state: event.status?.type?.state || "",
      away,
      home
    };
  }

  function schedulePlaceholder() {
    return { name: "TBD", homeAway: "", isPlaceholder: true, score: "" };
  }

  function isPlaceholderTeam(name) {
    const key = normalizeKey(name);
    return !key || /\btbd\b|to be determined|winner|runner up|runnerup|group [a-z0-9]+|^[0-9][a-z]$/.test(key);
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
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function localDateInput(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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

  function ownershipMap() {
    const owners = new Map();
    ownershipRows.forEach((team) => {
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

  function ownerForTeam(team, owners) {
    if (!team || team.isPlaceholder || isPlaceholderTeam(team.name)) return { participant: "TBD", team: team?.name || "TBD" };
    return owners.get(scheduleLookupKey(team.name)) || { participant: "TBD", team: team.name };
  }

  function matchOwners(match, owners) {
    return [ownerForTeam(match.away, owners).participant, ownerForTeam(match.home, owners).participant]
      .filter(Boolean)
      .filter((owner, index, allOwners) => allOwners.indexOf(owner) === index);
  }

  function formatKickoff(value) {
    if (!value) return "Time TBD";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Time TBD";
    const time = date.toLocaleTimeString([], {
      timeZone: PACIFIC_TIME_ZONE,
      hour: "numeric",
      minute: "2-digit"
    });
    return `${time} PT`;
  }

  function formatParticipantKickoff(value) {
    if (!value) return "Date TBD, Time TBD";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Date TBD, Time TBD";
    const day = date.toLocaleDateString([], {
      timeZone: PACIFIC_TIME_ZONE,
      month: "short",
      day: "numeric"
    });
    return `${day}, ${formatKickoff(value)}`;
  }

  function flagHtml(teamName) {
    const code = FLAG_CODES[scheduleLookupKey(teamName)];
    const label = escapeHtml(teamName);
    return code ? `<img class="flag" src="https://flagcdn.com/w40/${code}.png" alt="" aria-hidden="true" loading="lazy"><span class="sr-only">${label} flag</span>` : "";
  }

  function teamDisplay(team, owners) {
    if (!team || team.isPlaceholder || isPlaceholderTeam(team.name)) return escapeHtml(team?.name || "TBD");
    const owner = ownerForTeam(team, owners);
    return `${flagHtml(owner.team)}${escapeHtml(team.name)}`;
  }

  function teamLineDisplay(team, owners, match) {
    return `${teamDisplay(team, owners)}${scoreHtml(team, match)}`;
  }

  function hasScore(team) {
    return team && team.score !== undefined && team.score !== null && String(team.score) !== "";
  }

  function isPregame(match) {
    const state = String(match?.state || "").toLowerCase();
    const status = String(match?.status || "").toLowerCase();
    return state === "pre" || status === "scheduled";
  }

  function scoreHtml(team, match) {
    if (!hasScore(team) || isPregame(match)) return "";
    return `<span class="match-score" aria-label="Score ${escapeHtml(team.score)}">${escapeHtml(team.score)}</span>`;
  }

  function repairVisibleScores() {
    if (!scheduleMatches || scheduleParticipant?.value) return;
    const dateValue = scheduleDate?.value;
    if (!dateValue) return;
    const cachedMatches = scheduleMatchesByDate.get(dateValue);
    if (cachedMatches) {
      applyScoresToCards(cachedMatches);
      return;
    }
    if (scheduleScoresLoading.has(dateValue)) return;
    scheduleScoresLoading.add(dateValue);
    fetchScheduleDate(dateValue)
      .then(applyScoresToCards)
      .catch(() => {})
      .finally(() => scheduleScoresLoading.delete(dateValue));
  }

  function applyScoresToCards(matches) {
    scheduleMatches?.querySelectorAll(".schedule-card").forEach((card) => {
      const teamBlocks = [...card.querySelectorAll(".match-team")];
      if (teamBlocks.length !== 2) return;
      const names = teamBlocks.map((teamBlock) => cleanTeamName(teamBlock.querySelector("strong")));
      const match = findMatchForTeams(names, matches);
      if (!match) return;
      teamBlocks.forEach((teamBlock) => {
        const teamName = cleanTeamName(teamBlock.querySelector("strong"));
        const team = teamForName(match, teamName);
        if (team) updateScoreBadge(teamBlock, team, match);
      });
    });
  }

  function findMatchForTeams(teamNames, matches) {
    const [first, second] = teamNames.map(scheduleLookupKey);
    return matches.find((match) => {
      const away = scheduleLookupKey(match.away.name);
      const home = scheduleLookupKey(match.home.name);
      return (first === away && second === home) || (first === home && second === away);
    });
  }

  function teamForName(match, teamName) {
    const key = scheduleLookupKey(teamName);
    if (scheduleLookupKey(match.away.name) === key) return match.away;
    if (scheduleLookupKey(match.home.name) === key) return match.home;
    return null;
  }

  function updateScoreBadge(teamBlock, team, match) {
    const strong = teamBlock.querySelector("strong");
    if (!strong) return;
    let score = strong.querySelector(".match-score");
    if (!hasScore(team) || isPregame(match)) {
      score?.remove();
      return;
    }
    if (!score) {
      score = document.createElement("span");
      score.className = "match-score";
      strong.appendChild(score);
    }
    score.textContent = String(team.score);
    score.setAttribute("aria-label", `Score ${team.score}`);
  }

  function ownerBadges(match, owners) {
    return matchOwners(match, owners)
      .map((owner) => `<span class="owner-badge ${owner === "TBD" ? "is-tbd" : ""}">${escapeHtml(owner)}</span>`)
      .join("");
  }

  function renderParticipantMatches(participant, matches, owners) {
    const filtered = matches
      .filter((match) => matchOwners(match, owners).includes(participant))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (scheduleStatus) {
      scheduleStatus.textContent = `${filtered.length} ${filtered.length === 1 ? "match" : "matches"} for ${participant}`;
    }
    if (!filtered.length) {
      const empty = `<p class="empty-state">No matches found for this participant.</p>`;
      scheduleMatches.innerHTML = empty;
      participantsInAction.innerHTML = empty;
      return;
    }

    scheduleMatches.innerHTML = filtered.map((match) => `
      <article class="schedule-card">
        <time>${escapeHtml(formatParticipantKickoff(match.date))}</time>
        <div class="match-main">
          <strong>${teamLineDisplay(match.away, owners, match)} <span>vs</span> ${teamLineDisplay(match.home, owners, match)}</strong>
          <small>${escapeHtml(match.status || "Status TBD")}</small>
        </div>
        <div class="match-owners">${ownerBadges(match, owners)}</div>
      </article>
    `).join("");

    participantsInAction.innerHTML = filtered.flatMap((match) => {
      return [match.away, match.home].map((team, index, allTeams) => {
        const opponent = allTeams[index === 0 ? 1 : 0];
        const owner = ownerForTeam(team, owners).participant;
        return { participant: owner, time: formatParticipantKickoff(match.date), team, opponent, match };
      });
    }).filter((row) => row.participant === participant).map((row) => `
      <article class="action-row">
        <strong>${escapeHtml(row.participant)}</strong>
        <time>${escapeHtml(row.time)}</time>
        <span>${teamLineDisplay(row.team, owners, row.match)}</span>
        <span>${teamLineDisplay(row.opponent, owners, row.match)}</span>
      </article>
    `).join("");
    polishSchedule();
  }

  async function showParticipantSchedule() {
    const participant = scheduleParticipant?.value || "";
    if (!participant) {
      if (scheduleDate) scheduleDate.disabled = false;
      resetButton.hidden = true;
      participantNote.hidden = true;
      window.setTimeout(polishSchedule, 0);
      return;
    }
    if (scheduleDate) {
      scheduleDate.value = "";
      scheduleDate.disabled = true;
    }
    resetButton.hidden = false;
    participantNote.hidden = false;
    if (scheduleStatus) scheduleStatus.textContent = `Loading all matches for ${participant}`;
    try {
      await loadTeamsMaster();
      const matches = await fetchTournamentMatches();
      renderParticipantMatches(participant, matches, ownershipMap());
    } catch (error) {
      if (scheduleStatus) scheduleStatus.textContent = error.message || "Could not load participant fixtures";
    }
  }

  new MutationObserver(polishSchedule).observe(scheduleView, {
    childList: true,
    subtree: true
  });
  document.querySelectorAll(".tab[data-view]").forEach((tab) => {
    tab.addEventListener("click", () => window.setTimeout(syncDashboardTitle, 0));
  });
  scheduleParticipant?.addEventListener("change", () => window.setTimeout(showParticipantSchedule, 0));
  resetButton.addEventListener("click", () => {
    if (scheduleParticipant) {
      scheduleParticipant.value = "";
      scheduleParticipant.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (scheduleDate) {
      scheduleDate.disabled = false;
      scheduleDate.value = pacificDateInput(new Date());
      scheduleDate.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  syncDashboardTitle();
  polishSchedule();
})();
