/** Alternating atomic alerts allow repeated user actions to be announced, as in VS Code aria.ts. */
export function announceSidebarVisibility(open: boolean) {
  const label =
    document.querySelector("[data-app-sidebar]")?.getAttribute("aria-label") ?? "Sidebar";
  let container = document.getElementById("workspace-visibility-alerts");
  if (!container) {
    container = document.createElement("div");
    container.id = "workspace-visibility-alerts";
    container.className = "sr-only";
    for (let index = 0; index < 2; index++) {
      const alert = document.createElement("div");
      alert.setAttribute("role", "alert");
      alert.setAttribute("aria-atomic", "true");
      container.append(alert);
    }
    document.body.append(container);
  }
  const [first, second] = Array.from(container.children);
  const next = first!.textContent ? second! : first!;
  first!.textContent = "";
  second!.textContent = "";
  next.textContent = `${label} sidebar ${open ? "shown" : "hidden"}`;
}
