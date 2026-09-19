import argparse
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import time

import browser_cookie3


class SessionExportError(Exception):
    pass


def export_session(profile_name):
    if sys.platform != "darwin":
        raise SessionExportError("This Chrome session exporter currently supports macOS")
    root = Path.home() / "Library/Application Support/Google/Chrome"
    if profile_name is None:
        local_state = json.loads((root / "Local State").read_text())
        profile_name = local_state.get("profile", {}).get("last_used", "Default")
    if profile_name != "Default" and not (profile_name.startswith("Profile ") and profile_name[8:].isdigit()):
        raise SessionExportError("Specify Default or a numbered Chrome profile")
    profile = root / profile_name
    source = next((path for path in [profile / "Network/Cookies", profile / "Cookies"] if path.is_file()), None)
    if source is None:
        raise SessionExportError("No accessible Chrome cookie database in the selected profile")
    columns = "host_key, path, is_secure, expires_utc, name, value, encrypted_value, is_httponly"
    with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True, timeout=3) as database:
        rows = database.execute(f"SELECT {columns}, samesite FROM cookies WHERE host_key='chess.com' OR host_key LIKE '%.chess.com'").fetchall()
        version = database.execute("SELECT value FROM meta WHERE key='version'").fetchone()[0]
    if not rows:
        raise SessionExportError("No chess.com cookies found in the selected Chrome profile")
    directory = Path("data/auth")
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    directory.chmod(0o700)
    with tempfile.TemporaryDirectory(dir=directory) as temporary:
        filtered = Path(temporary) / "chess.sqlite"
        with sqlite3.connect(filtered) as database:
            database.execute("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)")
            database.execute("INSERT INTO meta VALUES ('version', ?)", (version,))
            database.execute("CREATE TABLE cookies (host_key TEXT, path TEXT, is_secure INTEGER, expires_utc INTEGER, name TEXT, value TEXT, encrypted_value BLOB, is_httponly INTEGER)")
            database.executemany("INSERT INTO cookies VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [row[:8] for row in rows])
        filtered.chmod(0o600)
        jar = browser_cookie3.chrome(cookie_file=str(filtered), domain_name="chess.com")
        same_site = {(row[0], row[1], row[4]): row[8] for row in rows}
        cookies = []
        for cookie in jar:
            domain = cookie.domain.lstrip(".")
            if domain != "chess.com" and not domain.endswith(".chess.com"):
                raise SessionExportError("Unexpected cookie domain")
            if cookie.expires is not None and cookie.expires <= time.time():
                continue
            cookies.append({"name": cookie.name, "value": cookie.value, "domain": cookie.domain, "path": cookie.path, "expires": cookie.expires if cookie.expires is not None else -1, "httpOnly": cookie.has_nonstandard_attr("HTTPOnly"), "secure": bool(cookie.secure), "sameSite": {0: "None", 1: "Lax", 2: "Strict"}.get(same_site.get((cookie.domain, cookie.path, cookie.name)), "Lax")})
        if not cookies:
            raise SessionExportError("No unexpired chess.com cookies found")
        destination = directory / "chess-session.json"
        staged = Path(temporary) / "session.json"
        with os.fdopen(os.open(staged, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as output:
            json.dump({"cookies": cookies}, output)
        os.replace(staged, destination)
    print(f"Saved {len(cookies)} chess.com cookies to ignored data/auth/chess-session.json with permissions 600. Values were not printed.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile")
    options = parser.parse_args()
    os.umask(0o077)
    try:
        export_session(options.profile)
    except PermissionError:
        print("macOS denied access to the Chrome profile. Grant the calling application access or export the session from Chrome manually.", file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        if isinstance(error, SessionExportError):
            print(str(error), file=sys.stderr)
        else:
            print(f"Session export failed ({type(error).__name__}). No cookie values were printed.", file=sys.stderr)
        sys.exit(1)
