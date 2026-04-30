from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import tkinter as tk


def _read_state(path: Path) -> dict:
    try:
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return {}


def main() -> int:
    parser = argparse.ArgumentParser(description="Smart Mirror native countdown overlay")
    parser.add_argument("--state-file", required=True, help="Path to JSON state file")
    parser.add_argument("--poll-ms", type=int, default=80, help="State poll interval")
    args = parser.parse_args()

    state_file = Path(args.state_file)
    state_file.parent.mkdir(parents=True, exist_ok=True)

    root = tk.Tk()
    root.withdraw()
    root.overrideredirect(True)
    root.attributes("-topmost", True)
    try:
        root.attributes("-alpha", 0.92)
    except Exception:
        pass
    root.configure(bg="#000000")

    frame = tk.Frame(root, bg="#000000", bd=0, highlightthickness=0)
    frame.pack(fill="both", expand=True)
    label_top = tk.Label(
        frame,
        text="Photo in",
        fg="#d1d5db",
        bg="#000000",
        font=("DejaVu Sans", 34, "bold"),
    )
    label_top.pack(padx=28, pady=(22, 6))
    label_value = tk.Label(
        frame,
        text="3",
        fg="#ffffff",
        bg="#000000",
        font=("DejaVu Sans", 122, "bold"),
    )
    label_value.pack(padx=28, pady=(0, 12))
    label_unit = tk.Label(
        frame,
        text="sec",
        fg="#d1d5db",
        bg="#000000",
        font=("DejaVu Sans", 32, "bold"),
    )
    label_unit.pack(padx=28, pady=(0, 18))

    visible = False
    last_value = None
    last_label = None
    last_ts = 0.0

    def hide() -> None:
        nonlocal visible
        if visible:
            root.withdraw()
            visible = False

    def show_centered() -> None:
        nonlocal visible
        root.update_idletasks()
        sw = root.winfo_screenwidth()
        sh = root.winfo_screenheight()
        w = root.winfo_reqwidth()
        h = root.winfo_reqheight()
        x = max(0, (sw - w) // 2)
        y = max(0, int(sh * 0.68) - (h // 2))
        root.geometry(f"+{x}+{y}")
        if not visible:
            root.deiconify()
            root.lift()
            visible = True

    def tick() -> None:
        nonlocal last_value, last_label, last_ts
        state = _read_state(state_file)
        now = time.monotonic()
        enabled = bool(state.get("visible"))
        value = state.get("value")
        label = state.get("label") or "Photo in"
        updated_at = float(state.get("updated_at", 0.0) or 0.0)

        # Auto-hide stale overlays (backend stopped/crashed).
        if updated_at > 0:
            last_ts = updated_at
        if last_ts > 0 and (now - last_ts) > 2.0:
            enabled = False

        if enabled:
            if label != last_label:
                label_top.configure(text=str(label))
                last_label = label
            if value != last_value:
                label_value.configure(text=str(value))
                last_value = value
            show_centered()
        else:
            hide()

        root.after(max(30, int(args.poll_ms)), tick)

    root.after(0, tick)
    root.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
