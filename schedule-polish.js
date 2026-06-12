(function () {
  const PACIFIC_TIME_ZONE = "America/Los_Angeles";
  const scheduleView = document.querySelector("#scheduleView");
  const scheduleMatches = document.querySelector("#scheduleMatches");
  const participantsInAction = document.querySelector("#participantsInAction");
  const dashboardTitle = document.querySelector(".topbar h1");
  let polishQueued = false;

  if (!scheduleView) return;

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function syncDashboardTitle() {
    const activeTab = document.querySelector(".tab.is-active[data-view]");
    if (!dashboardTitle || !activeTab) return;
    dashboardTitle.textContent = activeTab.textContent.trim() || "Schedule";
  }

  function normalizeTimeLabel(time) {
    if (!time) return;
    const text = time.textContent.trim();
    if (!text || /TBD/i.test(text)) return;

    const includeDate = time.dataset.includeDate === "true" || /^[A-Z][a-z]{2}\s+\d{1,2},/i.test(text);
    if (/PT$/i.test(text)) return;

    const parsed = new Date(time.getAttribute("datetime") || text);
    if (!Number.isNaN(parsed.getTime())) {
      const pacific = parsed.toLocaleString([], {
        timeZone: PACIFIC_TIME_ZONE,
        ...(includeDate ? { month: "short", day: "numeric" } : {}),
        hour: "numeric",
        minute: "2-digit"
      });
      time.textContent = `${pacific} PT`;
      return;
    }

    time.textContent = text.replace(/\s(?:GMT[+-]\d+|PDT|PST)$/i, " PT");
  }

  function polishMatchCard(card) {
    if (card.dataset.polished === "true") return;
    const time = card.querySelector("time");
    const matchMain = card.querySelector(".match-main");
    const teamLine = matchMain?.querySelector("strong");
    const status = matchMain?.querySelector("small")?.textContent || "Status TBD";
    const owners = [...card.querySelectorAll(".owner-badge")].map((owner) => owner.textContent.trim());
    const teams = teamLine?.innerHTML.split(/\s*<span>vs<\/span>\s*/i);
    if (!time || !teams || teams.length !== 2) {
      normalizeTimeLabel(time);
      return;
    }

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
          <span class="owner-badge ${owners[1] === "TBD" ? "is-tbd" : ""}">${escapeHtml(owners[1] || "TBD")}</span>
        </div>
      </div>
    `;
    card.dataset.polished = "true";
  }

  function polishActionRow(row) {
    if (row.dataset.polished === "true") return;
    const existingOwner = row.querySelector(":scope > .action-owner");
    const directSpans = [...row.querySelectorAll(":scope > span")];
    const participant = existingOwner?.querySelector("strong") || row.querySelector(":scope > strong");
    const time = row.querySelector(":scope > time");
    const team = existingOwner?.querySelector(":scope > span") || directSpans[0];
    const opponent = row.querySelector(":scope > .action-opponent") || row.querySelector(":scope > .action-opponent-wrap .action-opponent") || directSpans[1];
    if (!participant || !time || !team || !opponent) {
      normalizeTimeLabel(time);
      return;
    }

    normalizeTimeLabel(time);
    row.innerHTML = `
      <div class="action-heading">
        <strong>${escapeHtml(participant.textContent)}</strong>
        <time>${escapeHtml(time.textContent)}</time>
      </div>
      <div class="action-matchup">
        <span class="action-team">${cleanActionTeamHtml(team)}</span>
        <span class="action-opponent">${cleanActionTeamHtml(opponent)}</span>
      </div>
    `;
    row.dataset.polished = "true";
  }

  function cleanActionTeamHtml(element) {
    const copy = element.cloneNode(true);
    copy.querySelectorAll(".action-vs").forEach((node) => node.remove());
    return copy.innerHTML.replace(/\bvs\b/gi, "").trim();
  }

  function sortRenderedSchedule() {
    sortCardsByTime(scheduleMatches);
    sortCardsByTime(participantsInAction);
  }

  function sortCardsByTime(container) {
    if (!container) return;
    const cards = [...container.children].filter((child) => child.matches(".schedule-card, .action-row"));
    if (cards.length < 2) return;
    const sorted = [...cards].sort((a, b) => renderedTimeValue(a) - renderedTimeValue(b));
    const changed = sorted.some((card, index) => card !== cards[index]);
    if (!changed) return;
    sorted.forEach((card) => container.appendChild(card));
  }

  function renderedTimeValue(card) {
    const time = card.querySelector("time");
    const parsed = new Date(time?.getAttribute("datetime") || "");
    if (!Number.isNaN(parsed.getTime())) return parsed.getTime();
    return timeLabelValue(time?.textContent);
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

  function polishSchedule() {
    polishQueued = false;
    scheduleView.querySelectorAll(".schedule-card").forEach(polishMatchCard);
    scheduleView.querySelectorAll(".action-row").forEach(polishActionRow);
    scheduleView.querySelectorAll("time").forEach(normalizeTimeLabel);
    sortRenderedSchedule();
    syncDashboardTitle();
  }

  function queuePolishSchedule() {
    if (polishQueued) return;
    polishQueued = true;
    window.requestAnimationFrame?.(polishSchedule) || window.setTimeout(polishSchedule, 0);
  }

  new MutationObserver(queuePolishSchedule).observe(scheduleView, {
    childList: true,
    subtree: true
  });

  document.querySelectorAll(".tab[data-view]").forEach((tab) => {
    tab.addEventListener("click", () => window.setTimeout(syncDashboardTitle, 0));
  });

  polishSchedule();
})();
