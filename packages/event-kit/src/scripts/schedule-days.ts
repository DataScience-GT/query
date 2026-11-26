/*
 * The schedule's day tabs. The page is built with every day showing and the
 * tabs hidden, so without this script nothing is lost. This one shows the
 * tabs, hides all days but one, and opens on today's while the event is on.
 * The markup is components/Schedule.tsx's; the styles are in styles/kit.css.
 */
import { defaultDayIndex } from "../dates";
import { nextTab } from "../tabs";

const root = document.querySelector<HTMLElement>("[data-days]");
const tablist = root?.querySelector<HTMLElement>("[role=tablist]");

if (root && tablist) {
  const tabs = [...tablist.querySelectorAll<HTMLButtonElement>("[role=tab]")];
  const panels = tabs.map((tab) => {
    const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "");
    if (!panel) throw new Error(`Schedule markup is missing the panel for ${tab.id}`);
    return panel;
  });

  const select = (index: number) => {
    tabs.forEach((tab, i) => {
      tab.setAttribute("aria-selected", String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].toggleAttribute("data-off", i !== index);
    });
  };

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(i));
    tab.addEventListener("keydown", (event) => {
      const next = nextTab(event.key, i, tabs.length);
      if (next === null) return;
      event.preventDefault();
      select(next);
      tabs[next].focus();
    });
  });
  // A panel with no link or button in it is reached by Tab from its tab.
  panels.forEach((panel) => (panel.tabIndex = 0));

  const { tz = "", start = "", end = "" } = root.dataset;
  select(
    defaultDayIndex(
      tabs.map((tab) => tab.dataset.day ?? ""),
      tz,
      Number(start),
      Number(end),
      Date.now(),
    ),
  );
  tablist.hidden = false;
  root.dataset.ready = "";
}
