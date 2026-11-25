// ToolVault shared header: mobile menu toggle.
(() => {
  const header = document.getElementById("tv-header");
  const button = header && header.querySelector(".tv-menu-btn");
  if (!button) return;
  const label = button.querySelector(".tv-menu-label");
  const setOpen = open => {
    header.classList.toggle("tv-open", open);
    document.body.classList.toggle("tv-menu-open", open);
    button.setAttribute("aria-expanded", String(open));
    if (label) label.textContent = open ? "Close" : "Menu";
  };
  button.addEventListener("click", () => setOpen(!header.classList.contains("tv-open")));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && header.classList.contains("tv-open")) { setOpen(false); button.focus(); }
  });
  // Close the panel if the window grows back to desktop width.
  matchMedia("(min-width: 1041px)").addEventListener("change", event => { if (event.matches) setOpen(false); });
})();
