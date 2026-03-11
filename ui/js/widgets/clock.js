import { registerWidget } from "./base.js";

const clockWidget = {
  id: "clock",

  render(container) {
    container.classList.add("widget--clock");

    const header = document.createElement("div");
    header.className = "widget-header";
    header.textContent = "Time";

    const timeEl = document.createElement("div");
    timeEl.className = "clock-time metric-primary";

    const dateEl = document.createElement("div");
    dateEl.className = "clock-date metric-secondary";

    container.appendChild(header);
    container.appendChild(timeEl);
    container.appendChild(dateEl);

    container._clockEls = { timeEl, dateEl };

    this.update.call(container);
  },

  update() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const dateStr = now.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    const { timeEl, dateEl } = this._clockEls || {};
    if (timeEl) timeEl.textContent = timeStr;
    if (dateEl) dateEl.textContent = dateStr;
  },

  settings() {
    return {
      widget_id: "clock",
      enabled: true,
      position_row: 1,
      position_col: 1,
      size_rows: 2,
      size_cols: 2,
      options: {
        refreshIntervalMs: 1000,
      },
    };
  },
};

registerWidget(clockWidget);
export default clockWidget;

