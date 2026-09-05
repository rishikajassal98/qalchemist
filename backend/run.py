"""Dev/prod launcher for the backend.

Exists solely to pass `loop="none"` to uvicorn: on Windows, uvicorn's "auto"/"asyncio" loop
backends force WindowsSelectorEventLoopPolicy, and SelectorEventLoop has no subprocess transport,
so Playwright's browser launch (which spawns the browser via asyncio.create_subprocess_exec) fails
with a bare NotImplementedError. `loop="none"` leaves Windows' normal Proactor policy in place
instead. `--loop none` is not usable via the plain `uvicorn` CLI (its Click option rejects "none"
even though uvicorn itself supports it) -- only the programmatic API accepts it, hence this script.
Harmless on macOS/Linux, where Proactor-vs-Selector doesn't apply.
"""
import os
import sys

import uvicorn

if __name__ == "__main__":
    reload = "--reload" in sys.argv
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 8002)),
        reload=reload,
        loop="none",
    )
