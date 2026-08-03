(() => {
  window.toggleSidebar = function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('backdrop');
    if (!sidebar || !backdrop) return;
    const willOpen = !sidebar.classList.contains('open');
    sidebar.classList.toggle('open', willOpen);
    backdrop.classList.toggle('active', willOpen);
    document.body.classList.toggle('overflow-hidden', willOpen);
  };

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.getElementById('sidebar')?.classList.contains('open')) {
      window.toggleSidebar();
    }
  });
})();
