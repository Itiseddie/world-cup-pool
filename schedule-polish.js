(function () {
  const SHEET_ID = "1Ac5ecT-orrmgJ2h4-a8N-YYyMS3R_AosYFcgoATIBgk";
  const TEAMS_GID = "1";
  const ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
  const WORLD_CUP_START_DATE = "2026-06-11";
  const WORLD_CUP_END_DATE = "2026-07-19";
  const PACIFIC_TIME_ZONE = "America/Los_Angeles";

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
  const resetButton = document.createElement("button");
  const participantNote = document.createElement("p");

  let ownershipRows = [];
  let tournamentMatches = null;

  resetButton.type = "button";
  resetButton.className = "schedule-reset-button";
  resetButton.textContent = "Reset to default";
  resetButton.hidden = true;
  participantNote.className = "schedule-filter-note";
  participantNote.hidden = true;
  participantNote.textContent = "Participant view shows all tournament matches. To look for just today's games, switch Participant back to Everyone.";
  scheduleParticipant?.closest(".schedule-controls")?.append(resetButton, participantNote);

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
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
    return (data.events || []).map(normalizeEvent);
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
        isPlaceholder: isPlaceholderTeam(name)
      };
    });
    const away = teams.find((team) => team.homeAway === "away") || teams[0] || schedulePlaceholder();
    const home = teams.find((team) => team.homeAway === "home") || teams[1] || schedulePlaceholder();
    return {
      id: event.id,
      date: event.date || competition.date || "",
      status: event.status?.type?.shortDetail || event.status?.type?.description || event.status?.type?.name || "",
      away,
      home
    };
  }

  function schedulePlaceholder() {
    return { name: "TBD", homeAway: "", isPlaceholder: true };
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

  function ownerBadges(match, owners) {
    return matchOwners(match, owners)
      .map((owner) => `<span class="owner-badge ${owner === "TBD" ? "is-tbd" : ""}">${escapeHtml(owner)}</span>`)
      .join("");
  }

  function renderParticipantMatches(participant, matches, owners) {
    const filtered = matches.filter((match) => matchOwners(match, owners).includes(participant));
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
          <strong>${teamDisplay(match.away, owners)} <span>vs</span> ${teamDisplay(match.home, owners)}</strong>
          <small>${escapeHtml(match.status || "Status TBD")}</small>
        </div>
        <div class="match-owners">${ownerBadges(match, owners)}</div>
      </article>
    `).join("");

    participantsInAction.innerHTML = filtered.flatMap((match) => {
      return [match.away, match.home].map((team, index, allTeams) => {
        const opponent = allTeams[index === 0 ? 1 : 0];
        const owner = ownerForTeam(team, owners).participant;
        return { participant: owner, time: formatParticipantKickoff(match.date), team, opponent };
      });
    }).filter((row) => row.participant === participant).map((row) => `
      <article class="action-row">
        <strong>${escapeHtml(row.participant)}</strong>
        <time>${escapeHtml(row.time)}</time>
        <span>${teamDisplay(row.team, owners)}</span>
        <span>${teamDisplay(row.opponent, owners)}</span>
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
  polishSchedule();
})();
