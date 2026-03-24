import { BaseWidget, registerWidget } from "./base.js";
import { getDefaultWidgetLayout } from "./defaultLayouts.js";

class CalendarWidget extends BaseWidget {
  constructor() {
    const defaults = getDefaultWidgetLayout("calendar");
    if (!defaults) throw new Error('Missing default layout for "calendar"');
    super({
      id: "calendar",
      title: "Calendar",
      className: "widget--calendar",
      defaults,
    });
  }

  mount(container, config) {
    this.createShell(container);
    const defOpts = this.settings().options || {};
    const maxEvents =
      config && config.options && typeof config.options.maxEvents === "number"
        ? config.options.maxEvents
        : defOpts.maxEvents ?? 3;

    const list = document.createElement("ul");
    list.className = "calendar-events";

    const empty = document.createElement("li");
    empty.className = "calendar-event-empty metric-secondary";
    empty.textContent = "No upcoming events";
    list.appendChild(empty);

    container.appendChild(list);

    const update = (data) => {
      list.innerHTML = "";
      const events = (
        data && Array.isArray(data.events) ? data.events : []
      ).slice(0, maxEvents);

      if (!events.length) {
        const fallback = document.createElement("li");
        fallback.className = "calendar-event-empty metric-secondary";
        fallback.textContent = "No upcoming events";
        list.appendChild(fallback);
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
    };

    return {
      update,
      settings: () => this.settings(),
    };
  }
}

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

const calendarWidget = new CalendarWidget();
registerWidget(calendarWidget);
export default calendarWidget;

