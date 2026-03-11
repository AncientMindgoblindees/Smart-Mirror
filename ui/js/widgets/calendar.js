import { registerWidget } from "./base.js";

const calendarWidget = {
  id: "calendar",

  render(container) {
    container.classList.add("widget--calendar");

    const header = document.createElement("div");
    header.className = "widget-header";
    header.textContent = "Calendar";

    const list = document.createElement("ul");
    list.className = "calendar-events";

    const empty = document.createElement("li");
    empty.className = "calendar-event-empty metric-secondary";
    empty.textContent = "No upcoming events";
    list.appendChild(empty);

    container.appendChild(header);
    container.appendChild(list);

    container._calendarList = list;
  },

  update(data) {
    const list = this._calendarList;
    if (!list) return;

    list.innerHTML = "";
    const events = (data && Array.isArray(data.events) ? data.events : []).slice(
      0,
      3
    );

    if (!events.length) {
      const empty = document.createElement("li");
      empty.className = "calendar-event-empty metric-secondary";
      empty.textContent = "No upcoming events";
      list.appendChild(empty);
      return;
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

      li.appendChild(time);
      li.appendChild(title);

      list.appendChild(li);
    });
  },

  settings() {
    return {
      widget_id: "calendar",
      enabled: true,
      position_row: 3,
      position_col: 1,
      size_rows: 2,
      size_cols: 3,
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

