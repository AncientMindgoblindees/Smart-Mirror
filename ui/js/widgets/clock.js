import { registerWidget } from "./base.js";

const clockWidget = {
  id: "clock",

  render(container) {
    container.classList.add("widget--clock");

    const kickerEl = document.createElement("div");
    kickerEl.className = "widget-header clock-kicker";
    kickerEl.textContent = "Now";

    const stackEl = document.createElement("div");
    stackEl.className = "clock-stack";

    const timeEl = document.createElement("div");
    timeEl.className = "clock-time metric-primary";

    const dateEl = document.createElement("div");
    dateEl.className = "clock-date metric-secondary";

    const metaEl = document.createElement("div");
    metaEl.className = "clock-meta metric-tertiary";

    stackEl.appendChild(timeEl);
    stackEl.appendChild(dateEl);

    container.appendChild(kickerEl);
    container.appendChild(stackEl);
    container.appendChild(metaEl);

    container._clockEls = { timeEl, dateEl, metaEl };

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
    const metaStr = now.toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const { timeEl, dateEl, metaEl } = this._clockEls || {};
    if (timeEl) timeEl.textContent = timeStr;
    if (dateEl) dateEl.textContent = dateStr;
    if (metaEl) metaEl.textContent = metaStr;
  },

  settings() {
    return {
      widget_id: "clock",
      enabled: true,
      position_row: 1,
      position_col: 1,
      size_rows: 3,
      size_cols: 5,
      zone: "hero",
      display_order: 10,
      row_span: 2,
      col_span: 2,
      config_json: null,
      options: {
        refreshIntervalMs: 1000,
      },
    };
  },
};

registerWidget(clockWidget);
export default clockWidget;

