import { describe, expect, it } from "vite-plus/test";
import { createWorkspaceFocusController } from "./workspaceFocus";

function setup() {
  const root = document.createElement("div");
  document.body.append(root);
  const controller = createWorkspaceFocusController(document);
  const area = (name: string, order: number, parent: HTMLElement = root) => {
    const element = document.createElement("section");
    element.dataset.workspaceArea = name;
    element.dataset.workspaceOrder = String(order);
    element.tabIndex = -1;
    const button = document.createElement("button");
    button.textContent = name;
    element.append(button);
    parent.append(element);
    return { element, button };
  };
  const append = (html: string) => {
    root.insertAdjacentHTML("beforeend", html);
    return root.lastElementChild as HTMLElement;
  };
  return {
    area,
    append,
    controller,
    [Symbol.dispose]() {
      controller.dispose();
      root.remove();
    },
  };
}

describe("workspace area focus", () => {
  it("cycles in workspace order in both directions, independent of DOM order", () => {
    using fixture = setup();
    const panel = fixture.area("panel", 3);
    const sidebar = fixture.area("sidebar", 0);
    const conversation = fixture.area("conversation", 1);
    const composer = fixture.area("composer", 2);
    sidebar.button.focus();
    fixture.controller.move(1);
    // The conversation is a region; it takes focus itself rather than its first button.
    expect(document.activeElement).toBe(conversation.element);
    fixture.controller.move(1);
    expect(document.activeElement).toBe(composer.button);
    fixture.controller.move(1);
    expect(document.activeElement).toBe(panel.button);
    fixture.controller.move(1);
    expect(document.activeElement).toBe(sidebar.button);
    fixture.controller.move(-1);
    expect(document.activeElement).toBe(panel.button);
  });

  it("skips hidden, inert, and maximized-away areas", () => {
    using fixture = setup();
    const sidebar = fixture.area("sidebar", 0);
    const conversation = fixture.area("conversation", 1);
    const composer = fixture.area("composer", 2);
    const panel = fixture.area("panel", 3);
    const terminal = fixture.area("terminal", 4);
    conversation.element.dataset.chatColumnMaximizedAway = "true";
    composer.element.hidden = true;
    panel.element.dataset.workspaceUnavailable = "true";
    terminal.element.inert = true;
    sidebar.button.focus();
    expect(fixture.controller.move(1)).toBe(true);
    expect(document.activeElement).toBe(sidebar.button);
  });

  it("restores the last focused control and falls back when it is removed", () => {
    using fixture = setup();
    fixture.area("sidebar", 0);
    const composer = fixture.area("composer", 2);
    const remembered = document.createElement("button");
    remembered.textContent = "remembered";
    composer.element.append(remembered);
    remembered.focus();
    fixture.controller.move(-1);
    fixture.controller.move(1);
    expect(document.activeElement).toBe(remembered);
    fixture.controller.move(-1);
    remembered.remove();
    fixture.controller.move(1);
    expect(document.activeElement).toBe(composer.button);
  });

  it("keeps focus inside a dialog or an open popup", () => {
    using fixture = setup();
    fixture.area("sidebar", 0);
    fixture.area("panel", 3);
    const dialog = fixture.append('<div role="dialog" tabindex="-1">Confirm</div>');
    dialog.focus();
    expect(fixture.controller.move(1)).toBe(false);
    expect(document.activeElement).toBe(dialog);
    dialog.remove();

    const popup = fixture.append(
      '<div role="listbox" data-slot="select-popup"><button role="option">Choice</button></div>',
    );
    const choice = popup.querySelector("button")!;
    choice.focus();
    expect(fixture.controller.move(1)).toBe(false);
    expect(document.activeElement).toBe(choice);
  });

  it("keeps moving while a non-modal notification is visible", () => {
    using fixture = setup();
    const composer = fixture.area("composer", 2);
    const panel = fixture.area("panel", 4);
    fixture.append(
      '<div data-slot="toast-viewport"><div role="dialog" aria-modal="false" tabindex="0">Update available</div></div>',
    );
    composer.button.focus();
    expect(fixture.controller.move(1)).toBe(true);
    expect(document.activeElement).toBe(panel.button);
  });

  it("moves only between the areas of an open Settings modal", () => {
    using fixture = setup();
    fixture.area("sidebar", 0);
    fixture.area("composer", 2);
    const modal = fixture.append('<div role="dialog" data-app-modal=""></div>');
    const nav = fixture.area("settings-nav", 0, modal);
    const content = fixture.area("settings", 1, modal);
    nav.button.focus();
    expect(fixture.controller.move(1)).toBe(true);
    expect(document.activeElement).toBe(content.button);
    expect(fixture.controller.move(1)).toBe(true);
    expect(document.activeElement).toBe(nav.button);
  });

  it("keeps moving while a shortcut recorder is on the page but not focused", () => {
    using fixture = setup();
    const nav = fixture.area("settings-nav", 0);
    const content = fixture.area("settings", 1);
    fixture.append('<button data-keybinding-capture="">Record shortcut</button>');
    nav.button.focus();
    expect(fixture.controller.move(1)).toBe(true);
    expect(document.activeElement).toBe(content.button);
  });
});
