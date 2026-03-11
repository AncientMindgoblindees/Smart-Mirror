import { registerWidget } from "./base.js";

const calendarWidget = {
  id: "calendar",

  render(container, config) {
    container.classList.add("widget--calendar");

    const header = document.createElement("div");
    header.className = "widget-header";
    header.textContent = "Agenda";

    const summary = document.createElement("div");
    summary.className = "calendar-summary metric-tertiary";
    summary.textContent = "Looking ahead";

    const list = document.createElement("ul");
    list.className = "calendar-events";

    const empty = document.createElement("li");
    empty.className = "calendar-event-empty metric-secondary";
    empty.textContent = "No upcoming events";
    list.appendChild(empty);

    container.appendChild(header);
    container.appendChild(summary);
    container.appendChild(list);

    container._calendarList = list;
    container._calendarSummary = summary;
    container._calendarMaxEvents =
      config?.config_json?.maxEvents || calendarWidget.settings().options.maxEvents;
  },

  update(data) {
    const list = this._calendarList;
    const summary = this._calendarSummary;
    if (!list) return;

    list.innerHTML = "";
    const compact =
      this.dataset.zone === "right-stack" &&
      document.body?.dataset?.layoutMode === "home";
    const maxEvents = compact ? Math.min(this._calendarMaxEvents || 3, 2) : this._calendarMaxEvents || 3;
    const events = (data && Array.isArray(data.events) ? data.events : []).slice(
      0,
      maxEvents
    );

    if (!events.length) {
      this.dataset.empty = "true";
      if (summary) summary.textContent = "No scheduled events";
      const empty = document.createElement("li");
      empty.className = "calendar-event-empty metric-secondary";
      empty.textContent = "No upcoming events";
      list.appendChild(empty);
      return;
    }

    this.dataset.empty = "false";
    if (summary) {
      summary.textContent =
        events.length === 1 ? "1 upcoming event" : `${events.length} upcoming events`;
    }

    events.forEach((event) => {
      const li = document.createElement("li");
      li.className = "calendar-event";

      const time = document.createElement("div");
      time.className = "calendar-event-time metric-tertiary";
      time.textContent = formatEventTime(event);

      const title = document.createElement("div");
      title.className = "calendar-event-title metric-secondary";
      title.textContent = event.title || "";

      const body = document.createElement("div");
      body.className = "calendar-event-body";
      body.appendChild(title);

      li.appendChild(time);
      li.appendChild(body);

      list.appendChild(li);
    });
  },

  settings() {
    return {
      widget_id: "calendar",
      enabled: true,
      position_row: 3,
      position_col: 8,
      size_rows: 3,
      size_cols: 5,
      zone: "right-stack",
      display_order: 30,
      row_span: 2,
      col_span: 2,
      config_json: {
        maxEvents: 3,
      },
      options: {
        maxEvents: 3,
        refreshIntervalMs: 5 * 60 * 1000,
      },
    };
  },
};

function formatEventTime(event) {
  if (event.allDay) {
    return "All day";
  }
  const start = event.start ? new Date(event.start) : null;
  const end = event.end ? new Date(event.end) : null;
  if (!start) return "";
  const startStr = start.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (!end) return startStr;
  const endStr = end.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${startStr}–${endStr}`;
}

registerWidget(calendarWidget);
export default calendarWidget;

