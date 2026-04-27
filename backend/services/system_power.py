from __future__ import annotations

import logging
import os
import shlex
import subprocess

from backend import config

logger = logging.getLogger(__name__)


def request_pi_shutdown(source: str) -> bool:
    """
    Attempt host shutdown for Raspberry Pi deployments.
    Returns True when command is launched, False when blocked/fails.
    """
    if not config.ALLOW_PI_SHUTDOWN_BUTTON:
        logger.warning("pi_shutdown_blocked: ALLOW_PI_SHUTDOWN_BUTTON is disabled (source=%s)", source)
        return False

    if os.name != "posix":
        logger.warning("pi_shutdown_blocked: unsupported platform os.name=%s (source=%s)", os.name, source)
        return False

    cmd = shlex.split(config.PI_SHUTDOWN_COMMAND.strip())
    if not cmd:
        logger.error("pi_shutdown_blocked: PI_SHUTDOWN_COMMAND is empty (source=%s)", source)
        return False

    try:
        subprocess.Popen(cmd)  # noqa: S603
        logger.warning("pi_shutdown_requested: source=%s command=%s", source, config.PI_SHUTDOWN_COMMAND)
        return True
    except Exception as exc:
        logger.exception("pi_shutdown_failed: source=%s error=%s", source, exc)
        return False
