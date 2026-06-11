(function () {
  const scheduleView = document.querySelector("#scheduleView");
  if (!scheduleView) return;

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

  new MutationObserver(polishSchedule).observe(scheduleView, {
    childList: true,
    subtree: true
  });
  polishSchedule();
})();
