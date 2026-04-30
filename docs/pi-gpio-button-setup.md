# Raspberry Pi GPIO Button Setup

This guide configures physical GPIO buttons for:
- menu/navigation actions
- sleep interrupt (`toggle_sleep`)
- power interrupt (`system_shutdown`)
- Raspberry Pi 5 same-button halt + wake behavior

## 1) Button-to-pin map file

Edit:
- `hardware/gpio/pi_button_map.py`

Default BCM mapping:
- `LAYOUT`: `17`
- `UP`: `27`
- `DOWN`: `22`
- `DISPLAY`: `23`
- `SLEEP`: `24`
- `POWER`: `25`

Use BCM numbering in this file.

## 1.1) If you want "same button shuts down and wakes up"

Use `GPIO3` (physical pin `5`) for the power button, then update:

- `hardware/gpio/pi_button_map.py`
  - set `"POWER": 3`

Important:
- `GPIO3` is also I2C SDA. If you use I2C HAT/devices, do not share this pin.

## 2) Wiring model

Current GPIO handler expects pull-up buttons (active-low):
- one leg of button -> configured BCM pin
- other leg -> `GND`

Internal pull-up is enabled in software, so no external resistor is required for basic wiring.

For same-button halt+wake on Pi 5:
- button leg A -> `GPIO3` (physical pin `5`)
- button leg B -> `GND`

## 3) Enable GPIO runtime

Set in `.env`:

```env
ENABLE_GPIO=true
```

## 4) Sleep interrupt behavior

Configured in backend button service:
- `SLEEP` click -> effect `toggle_sleep`

Frontend listens on `/ws/buttons` and toggles mirror sleep state on this effect.

## 5) Power interrupt behavior (shutdown)

Configured in backend button service:
- `POWER` click -> effect `system_shutdown`
- backend calls shutdown command via `backend/services/system_power.py`

Safety gate (required):

```env
ALLOW_PI_SHUTDOWN_BUTTON=true
```

Optional override command:

```env
PI_SHUTDOWN_COMMAND="sudo /sbin/shutdown -h now"
```

If `ALLOW_PI_SHUTDOWN_BUTTON` is false, shutdown is blocked and only logged.

## 5.1) Raspberry Pi 5 same-button wake after full shutdown

When the Pi is fully off, backend Python is not running, so app-level GPIO handlers cannot wake it.
Wake-on-button must be configured at firmware/kernel level.

On Raspberry Pi OS Bookworm (Pi 5), edit:
- `/boot/firmware/config.txt`

Add:

```ini
dtoverlay=gpio-shutdown,gpio_pin=3,active_low=1,gpio_pull=up,debounce=200
```

Then reboot once:

```bash
sudo reboot
```

Result:
- press power button while running -> clean shutdown path
- press same button when halted -> Pi boots again

If your distro uses legacy boot layout, the file may be `/boot/config.txt`.

Optional but recommended for consistency:
- set systemd logind power-key behavior to power off

Edit `/etc/systemd/logind.conf`:

```ini
HandlePowerKey=poweroff
```

Apply:

```bash
sudo systemctl restart systemd-logind
```

## 6) Sudoers for passwordless shutdown

If backend runs as user (not root), allow shutdown command without password.

Create:
- `/etc/sudoers.d/smart-mirror-shutdown`

Example content (replace `pi` with runtime user):

```txt
pi ALL=(root) NOPASSWD: /sbin/shutdown
```

Validate:

```bash
sudo visudo -cf /etc/sudoers.d/smart-mirror-shutdown
```

## 7) Verify interrupts

Start mirror backend and press buttons.

Expected `/ws/buttons` effects:
- `LAYOUT` click -> `cycle_layout`
- `DISPLAY` click -> `toggle_dim`
- `DISPLAY` long press -> `toggle_sleep`
- `SLEEP` click -> `toggle_sleep`
- `POWER` click -> `system_shutdown` (and shutdown request if allowed)

For local non-GPIO testing, use dev endpoint:

```bash
POST /api/dev/buttons?button_id=SLEEP&action=CLICK
POST /api/dev/buttons?button_id=POWER&action=CLICK
```

Requires:

```env
ENABLE_DEV_ENDPOINTS=true
```

## 8) Google auth persistence after power off/on

Google auth should persist across reboots if these are stable:

1. Database file persists on disk
   - default under repo `data/` unless `MIRROR_DB_PATH` overrides it.
2. `MIRROR_TOKEN_SECRET` stays the same across boots
   - changing it can make encrypted stored tokens unreadable.
3. Google refresh token remains valid (not revoked).

Recommended `.env` entries on Pi:

```env
MIRROR_DB_PATH=/home/pi/Smart-Mirror/data/mirror.db
MIRROR_TOKEN_SECRET=your-long-stable-secret-value
```
