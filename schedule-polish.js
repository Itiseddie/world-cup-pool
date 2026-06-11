(function () {
  const dashboardTitle = document.querySelector(".topbar h1");

  function syncDashboardTitle() {
    const activeTab = document.querySelector(".tab.is-active[data-view]");
    if (!dashboardTitle || !activeTab) return;
    dashboardTitle.textContent = activeTab.textContent.trim() || "Schedule";
  }

  document.querySelectorAll(".tab[data-view]").forEach((tab) => {
    tab.addEventListener("click", () => window.setTimeout(syncDashboardTitle, 0));
  });

  syncDashboardTitle();
})();
