/**
 * Where a key press moves focus in a row of tabs: the arrows step and wrap,
 * Home and End jump to the ends. `null` for any other key, which the tabs
 * leave alone.
 */
export function nextTab(key: string, current: number, count: number): number | null {
  switch (key) {
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
