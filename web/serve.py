"""
碳中和园 · 本地/局域网静态服务器
用法：python serve.py [端口]   默认 8791
特点：任何找不到的路径都会回落到 index.html（不会出 404 页面）
     绑定 0.0.0.0，同一 Wi-Fi 下的手机可以直接打开
"""
import http.server
import mimetypes
import os
import socket
import socketserver
import sys

# Python 内置表里没有 webp，不补的话会发成 application/octet-stream，
# Canvas 的 drawImage 会直接抛 "broken state" 异常。
mimetypes.add_type("image/webp", ".webp")

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8791


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        target = self.translate_path(self.path)
        if not os.path.exists(target):
            self.path = "/index.html"
        return super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


if __name__ == "__main__":
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("0.0.0.0", PORT), Handler) as httpd:
        print("=" * 52)
        print("  碳中和园 · 已启动")
        print("  本机   http://127.0.0.1:%d/" % PORT)
        print("  手机   http://%s:%d/   （同一 Wi-Fi）" % (lan_ip(), PORT))
        print("  停止   Ctrl + C")
        print("=" * 52)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n已停止")
