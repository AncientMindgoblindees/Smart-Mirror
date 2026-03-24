import { BaseWidget, registerWidget } from "./base.js";
import { getDefaultWidgetLayout } from "./defaultLayouts.js";

class ClockWidget extends BaseWidget {
  constructor() {
    const defaults = getDefaultWidgetLayout("clock");
    if (!defaults) throw new Error('Missing default layout for "clock"');
    super({
      id: "clock",
      title: "Time",
      className: "widget--clock",
      defaults,
    });
  }

  mount(container) {
    this.createShell(container);

    const timeEl = document.createElement("div");
    timeEl.className = "clock-time metric-primary";
    timeEl.setAttribute("aria-live", "polite");

    const dateEl = document.createElement("div");
    dateEl.className = "clock-date metric-secondary";

    container.appendChild(timeEl);
    container.appendChild(dateEl);

    const update = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const dateStr = now.toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      });

      timeEl.textContent = timeStr;
      dateEl.textContent = dateStr;
    };

    update();
    return {
      update,
      settings: () => this.settings(),
    };
  }

}

const clockWidget = new ClockWidget();
registerWidget(clockWidget);
export default clockWidget;
