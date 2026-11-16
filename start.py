#!/usr/bin/env python3
"""Serve the collection locally without third-party Python packages."""
import functools
import http.server
import socketserver
import threading
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent / 'collection'
if not (ROOT / 'index.html').is_file():
    raise SystemExit('Collection assets are missing: expected collection/index.html beside start.py')

class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
with Server(('127.0.0.1', 0), handler) as server:
    url = f'http://127.0.0.1:{server.server_address[1]}/'
    print(f'Open {url}\nClose this window or press Ctrl+C to stop.', flush=True)
    threading.Timer(.4, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
