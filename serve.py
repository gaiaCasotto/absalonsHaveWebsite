# Local server for trying the site. Same as `python3 -m http.server`, but it
# tells the browser not to keep old copies, so a normal reload always shows
# the latest files.
import http.server
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
BIND = sys.argv[2] if len(sys.argv) > 2 else '127.0.0.1'


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


http.server.ThreadingHTTPServer((BIND, PORT), NoCacheHandler).serve_forever()
