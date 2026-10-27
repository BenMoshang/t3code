import { describe, expect, it, vi } from "vite-plus/test";
import { installSidebarTree } from "./sidebarTree";

function setup() {
  const root = document.createElement("div");
  root.setAttribute("role", "tree");
  document.body.append(root);
  let dispose: (() => void) | undefined;
  const row = (id: string, parent?: string) => {
    const element = document.createElement("button");
    element.dataset.sidebarRow = id;
    if (parent) element.dataset.sidebarParent = parent;
    element.setAttribute("role", "treeitem");
    element.textContent = id;
    root.append(element);
    return element;
  };
  return {
    root,
    row,
    install: () => {
      dispose = installSidebarTree(root);
    },
    [Symbol.dispose]() {
      dispose?.();
      root.remove();
    },
  };
}

function press(target: HTMLElement, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe("sidebar keyboard navigation", () => {
  it("moves focus without activating rows, clamps at the ends, and keeps one Tab stop", () => {
    using tree = setup();
    const first = tree.row("first");
    const second = tree.row("second");
    const last = tree.row("last");
    const activate = vi.fn();
    tree.root.addEventListener("click", activate);
    tree.install();
    first.focus();
    press(first, "ArrowDown");
    expect(document.activeElement).toBe(second);
    press(second, "End");
    expect(document.activeElement).toBe(last);
    press(last, "ArrowDown");
    expect(document.activeElement).toBe(last);
    press(last, "Home");
    expect(document.activeElement).toBe(first);
    expect(activate).not.toHaveBeenCalled();
    expect(tree.root.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  it("expands a group before entering its first child and returns to the parent", async () => {
    using tree = setup();
    const group = tree.row("project");
    group.setAttribute("aria-expanded", "false");
    group.addEventListener("click", () => {
      const expanded = group.getAttribute("aria-expanded") === "true";
      group.setAttribute("aria-expanded", String(!expanded));
      if (expanded) tree.root.querySelector('[data-sidebar-row="thread"]')?.remove();
      else tree.row("thread", "project");
    });
    tree.install();
    group.focus();
    press(group, "ArrowRight");
    expect(group.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(group);
    // The tree picks up the new child from its mutation observer.
    await vi.waitFor(() =>
      expect(
        tree.root.querySelector('[data-sidebar-parent="project"]')?.getAttribute("aria-level"),
      ).toBe("2"),
    );
    press(group, "ArrowRight");
    const child = document.activeElement as HTMLElement;
    expect(child.dataset.sidebarRow).toBe("thread");
    press(child, "ArrowLeft");
    expect(document.activeElement).toBe(group);
    press(group, "ArrowLeft");
    expect(group.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens the row menu on Shift+F10 release without moving focus", () => {
    using tree = setup();
    tree.row("first");
    const selected = tree.row("selected");
    const contextMenu = vi.fn((event: MouseEvent) => event.preventDefault());
    selected.addEventListener("contextmenu", contextMenu);
    tree.install();
    selected.focus();
    expect(press(selected, "F10", { shiftKey: true }).defaultPrevented).toBe(true);
    expect(contextMenu).not.toHaveBeenCalled();
    selected.dispatchEvent(
      new KeyboardEvent("keyup", { key: "F10", shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(contextMenu).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(selected);
  });

  it("reaches row actions with F2 and returns to the row with Escape", () => {
    using tree = setup();
    const owner = tree.row("thread");
    const action = document.createElement("button");
    action.textContent = "Archive";
    action.dataset.sidebarActionFor = "thread";
    tree.root.append(action);
    tree.install();
    expect(action.tabIndex).toBe(-1);
    owner.focus();
    press(owner, "F2");
    expect(document.activeElement).toBe(action);
    expect(action.tabIndex).toBe(0);
    press(action, "Escape");
    expect(document.activeElement).toBe(owner);
    expect(action.tabIndex).toBe(-1);
  });

  it("keeps row actions after an action's portalled menu returns focus", () => {
    using tree = setup();
    const owner = tree.row("thread");
    const action = document.createElement("button");
    action.textContent = "Snooze";
    action.dataset.sidebarActionFor = "thread";
    tree.root.append(action);
    const menu = document.createElement("button");
    menu.textContent = "1 hour";
    document.body.append(menu);
    using _menu = { [Symbol.dispose]: () => menu.remove() };
    tree.install();
    owner.focus();
    press(owner, "F2");
    menu.focus();
    action.focus();
    expect(action.tabIndex).toBe(0);
    press(action, "Escape");
    expect(document.activeElement).toBe(owner);
  });

  it("skips disabled rows and leaves controls outside rows in the Tab order", () => {
    using tree = setup();
    const first = tree.row("first");
    const loading = tree.row("settled:more");
    loading.disabled = true;
    const undo = document.createElement("button");
    undo.textContent = "Undo";
    tree.root.append(undo);
    tree.install();
    first.focus();
    press(first, "ArrowDown");
    expect(document.activeElement).toBe(first);
    expect(undo.tabIndex).toBe(0);
  });
});
