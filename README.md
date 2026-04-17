# Smart-Mirror
This README.md contains information about the SmartMirror project process, workflows, rules, and notes for Senior Design Group 12. 

#### Next Biweekly TODO:
- Buy all hardware components early to get a demo started ASAP
- Start a rough draft build on the camera module
- Research + planning for GPIO interaction and UI event handling
- Build demo mirror for presentation

## General Description
### Hardware Stack
- Raspberry Pi 5
- Camera (details soon)
- Buttons/Sensors
- TV/Monitor
- Wood frame
### Software Stack
- Coming soon

## Run the Application

### Raspberry Pi app window mode (no normal browser tab)
Runs backend + opens Chromium in app/fullscreen mode so it behaves like a dedicated mirror application.

1. Install system dependencies:
```
sudo apt update
sudo apt install -y python3 python3-pip chromium-browser curl
```
2. Install Python dependencies (from repo root):
```
pip3 install -r backend/requirements.txt
```
3. Start the mirror app window:
```
bash scripts/start-mirror-app.sh
```
4. (Optional) stop backend later:
```
bash scripts/stop-mirror-app.sh
```

### Raspberry Pi desktop launcher / autostart
Creates a clickable app launcher and optional login autostart entry.

```
bash deploy/raspberry-pi/install-pi-launcher.sh
```

Enable autostart on login:
```
bash deploy/raspberry-pi/install-pi-launcher.sh --autostart
```

### Option 1: Full app (recommended)
Runs FastAPI backend + serves the **built** React UI at `/ui` (API routes, WebSockets, etc.).

**Prerequisite:** build the UI once (or after UI changes):

```
cd ui
npm install
npm run build
```

From repo root:

1. Create and activate a Python virtual environment:
```
python -m venv .venv
.\venv\Scripts\Activate
```
2. Install backend dependencies:
```
pip install -r backend/requirements.txt
```
3. Start the backend from repo root:
```
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```
4. Open:
```
http://localhost:8000/ui/
```

### Option 2: UI dev server (Vite + hot reload)
Runs the React app with `/api` proxied to the backend (default proxy: `http://127.0.0.1:8002`).

1. Terminal A — backend on port **8002** (must match Vite proxy in `ui/vite.config.ts`):
```
npm run backend
```
2. Terminal B — Vite:
```
npm run ui:dev
```
3. Open:
```
http://localhost:5173/ui/
```

### Raspberry Pi: build UI before kiosk launch
The mirror launcher opens `http://127.0.0.1:<port>/ui/`. That path serves files from `ui/dist`. On the Pi, install Node once and build:

```
cd /path/to/Smart-Mirror/ui && npm install && npm run build
```

Then use `scripts/start-mirror-app.sh` as before.

### Raspberry Pi camera ownership troubleshooting

The Pi camera stack is exclusive: if another process owns `/dev/media*`, mirror capture/preview can fail with `resource busy` or `pipeline handler in use`.

- Supported runtime model: one mirror backend process for the configured mirror port (`MIRROR_PORT`, default `8002`).
- Avoid running parallel camera tools (`rpicam-hello`, `rpicam-still`, other camera apps) while mirror backend camera is active.
- Avoid launching the backend by multiple methods at the same time (`start-mirror-app.sh` plus manual `uvicorn`, etc.).

Useful commands on Pi:

```
fuser -v /dev/media0 /dev/media2 /dev/video0 /dev/video1
ps -eo pid,cmd | grep -E 'uvicorn|backend.main|rpicam|libcamera' | grep -v grep
systemctl --user status pipewire wireplumber
```

If camera ownership conflicts persist and mirror is the only app that needs camera access in this session:

```
systemctl --user stop pipewire pipewire-pulse wireplumber
```

The launcher and camera service can do this automatically (default enabled):

```
MIRROR_CAMERA_AUTO_STOP_PIPEWIRE=1
```

Disable auto-stop if you want to keep desktop audio/camera services active while testing:

```
MIRROR_CAMERA_AUTO_STOP_PIPEWIRE=0
```

To restore desktop media services later:

```
systemctl --user start pipewire pipewire-pulse wireplumber
```

If you suspect duplicate mirror backends:

```
bash scripts/stop-mirror-app.sh
MIRROR_STOP_EXTRA_BACKENDS=1 bash scripts/stop-mirror-app.sh
bash scripts/start-mirror-app.sh
```

## Weather (WeatherAPI.com)

The mirror loads weather through the backend at **`GET /api/weather/`**, which proxies [WeatherAPI.com](https://www.weatherapi.com/docs/) ([Swagger reference](https://app.swaggerhub.com/apis-docs/WeatherAPI.com/WeatherAPI/1.0.2)) so your API key is not exposed to the browser.

1. Copy `.env.example` to `.env` in the repo root (`.env` is gitignored).
2. Set `WEATHERAPI_KEY` to your key from the WeatherAPI dashboard.
3. Optionally set `WEATHERAPI_Q` (default `San Francisco`) to any `q` supported by the API (city, lat/lon, zip code, etc.).
4. Restart the backend so the environment variables are picked up.

If the key is missing or the upstream request fails, the widget shows a short message (and a **Retry** button when the API is configured but a request fails). Responses are cached server-side for 5 minutes; the widget polls `/api/weather/` on the same interval so updates stay in sync without extra upstream calls.

**Security:** Treat API keys like passwords. If a key was ever pasted into chat or committed, regenerate it in your WeatherAPI account.

## External integrations (legacy note)

The previous vanilla JS layout adapter (`layoutAdjustmentsProvider`) has been replaced by the React UI, which talks to the backend via `/api/widgets/` and `/api/user/settings`. For external hook concepts, see `docs/EXTERNAL-INTEGRATION-HOOKS.md` (some paths refer to the old `ui/js` tree and may need updating).

## Mirror default layout + scaffolded AI widgets

Current mirror-first default composition uses these widget ids:

- `clock` (top-left)
- `weather` (top-right)
- `news` (bottom-left)
- `calendar` (bottom-right)
- `virtual_try_on` (center action button)

Notes:

- Layout is freeform and persisted through `/api/widgets/` (`config_json.freeform`), so companion apps can reposition widgets at runtime.
- Keyboard/GPIO mapping: `d` toggle tools panel, `1` cycle layout preset, `2` dim, `3` sleep.
- `news` and `virtual_try_on` are scaffolded with integration entry points in `ui/src/features/ai/entrypoints.ts` (mock data/stub responses only for now).

## How to: Version Control with Git
### Cloning the repo in VSCode:
In GitHub, go to the SmartMirror repository in the main branch. In the top right corner you will see the green "<> Code" button. Copy the HTTPS link that appears in the dropdown. Now you can open VSCode. 

If you are already signed in to your GitHub in VSCode, then cloning the repository is as easy as selecting "Clone Git Repository..." > "Clone from GitHub" > "AncientMindGoblindees/Smart-Mirror"

If you are not signed in, you can easily clone the repository in a VSCode terminal. Go to your working directory, open a new terminal window and clone the repository:
```
git clone https://github.com/AncientMindgoblindees/Smart-Mirror.git
cd Smart-Mirror
```

### Creating a new branch
You should create a new branch for each new feature you implement. For example, adding a weather module to the mirror would require creating a new branch from main called "feature-weather" or something along those lines.

Each time you create a new branch, you MUST branch from main. This is to ensure that the main branch is always available as a working version of our code.
```
git checkout main
```
Then, you will need to pull the latest changes from the main branch (in case others have changed the main branch remotely, which does not affect your local copy of the main branch):
```
git pull origin main
```
Finally, to create and switch to your new branch:
```
git checkout -b new-branch-name
```

### Getting Started - Common Git Commands
```
git status
```
This command helps you see if the local repository on your machine is up-to-date with the remote repository (in GitHub). It will tell you the branch that you are currently working in within your local VSCode workspace and whether or not it is up to date with the remote version of that branch. This command will also show you if there are any changes in your local workspace, which you will add and commit to the local repository.

```
git add <filename>
% OR
git add . (adds all files)
```
This command stages your local changes for a commit to your local repository. It is generally better practice to add and commit files individually and very often. The commit messages should usually reflect the changes that you added, so adding files individually allows you to write better, more specific messages.

```
git commit -m "your commit message"
```
This commits the changes you added to your local repository (the one saved only to your machine).

```
git push
% OR
git push -u origin [branch_name]
```
This is how you push your local version of the repository into the remote repository. You should NEVER be pushing into the main branch, we will be using PRs to push code into the main branch. You should only push your code into the remote version of the branch you are working on in VSCode.

*Note: The add, commit, and push commands can all be done in the VSCode UI under the "Source Control" panel on the left of the window. If you want to use this, make sure that you follow this process:
- Press the "+" button to stage your changes
- Add your commit message
- Press the "Commit" button
- Press the "Sync" button

### Merging
While you are in YOUR OWN branch...
``` 
git checkout main     
git pull origin main                   # switch to the main branch and pull the latest changes from remote
git checkout [your-branch-name]        # switch back to the branch that is ready to merge
git merge origin/main
```
Merging can be complex. If you mess up during a merge, it can sometimes be hard to recover. With that being said, understanding what the merge command even does is fairly important. For example, if you are in a branch named "goblin-branch" and you have just completed and tested the new feature, you will want to create a PR (pull request) to merge your branch into main. The 'git merge origin/main' command does not affect the local nor the remote main branch. Using this command would update your current "goblin-branch" branch with the changes that have been made to main since the last time that you branched from it. Basically, this command is prepping your branch to be fully pushed into the main branch.

*If there are any merge conflicts and you are unsure how to manually resolve, ask a team member. These conflicts could be work that a team member made, and deleting them might break the main branch.

## PR (Pull Request) Rules
When you have a branch that is working and tested and needs to be added to the main branch, you will need to create a PR. 

To create a new PR, navigate to the "Pull Requests" tab at the top of the GitHub repository. Then, click "New pull request".

At the top, under "Compare Changes", make sure that it is configured to base:main <- compare:[your-branch-name]

At this point, if you properly merged your branch with the current version of the origin/main branch, the UI should tell you that your branch is ready to be merged. If not, try to merge again and resolve the merge conflicts.

Now, other team members will be able to review the changed that you are adding to the main branch. Once your PR is reviewed and approved, it will be added into origin/main.






