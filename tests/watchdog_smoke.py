#!/usr/bin/env python3
"""Local-only smoke test for bundled API lifecycle; never accesses ChatGPT data."""
import os
import pathlib
import subprocess
import time
import urllib.request

ROOT=pathlib.Path(__file__).resolve().parents[1]
BINARY=ROOT/"src-tauri/bin/controller"
parent=subprocess.Popen(["sleep","30"],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
environment=dict(os.environ,
    CHATGPT_BRIDGE_PORT="18793",
    CHATGPT_BRIDGE_KEY="testkey"+"a"*64,
    CHATGPT_BROWSER_SESSION="chatgpt-controller",
    CHATGPT_CONTROLLER_PARENT_PID=str(parent.pid))
child=subprocess.Popen([str(BINARY)],env=environment,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    time.sleep(1.5)
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    response=opener.open("http://127.0.0.1:18793/health",timeout=4)
    assert response.status==200,response.status
    parent.terminate()
    parent.wait(timeout=4)
    for _ in range(15):
        if child.poll() is not None:
            break
        time.sleep(.25)
    if child.poll() is None:
        raise RuntimeError("Bundled API did not exit when parent process died")
    print("HEALTH_STATUS=200")
    print("PARENT_EXIT_WATCHDOG=PASS")
finally:
    if parent.poll() is None:
        parent.kill()
    if child.poll() is None:
        child.kill()
