import axe from "axe-core";

export function runAxeInJSDOM(container: HTMLElement) {
  // jsdom has no layout or canvas; contrast remains covered by browser E2E.
  return axe.run(container, {
    rules: {
      "color-contrast": { enabled: false },
    },
  });
}