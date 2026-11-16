"""Back up the local Wrangler D1 database to a folder chosen by the user."""

from datetime import datetime
from pathlib import Path
import sqlite3
import tkinter as tk
from tkinter import filedialog, messagebox


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_DIR = PROJECT_ROOT / ".wrangler" / "state" / "v3" / "d1" / "miniflare-D1DatabaseObject"


def main() -> None:
    databases = sorted(
        (path for path in DB_DIR.glob("*.sqlite") if path.name != "metadata.sqlite"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    if not databases:
        messagebox.showerror("Database Backup", f"No local D1 database was found:\n{DB_DIR}")
        return

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    folder = filedialog.askdirectory(title="Choose a folder for the database backup")
    root.destroy()
    if not folder:
        return

    source = databases[0]
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    destination = Path(folder) / f"book-management-db-{timestamp}.sqlite"
    try:
        # SQLite's backup API safely includes committed WAL data, even if the app is open.
        with sqlite3.connect(f"file:{source.as_posix()}?mode=ro", uri=True) as src:
            with sqlite3.connect(destination) as dst:
                src.backup(dst)
        with sqlite3.connect(f"file:{destination.as_posix()}?mode=ro", uri=True) as check:
            result = check.execute("PRAGMA integrity_check").fetchone()[0]
        if result != "ok":
            destination.unlink(missing_ok=True)
            raise RuntimeError(f"Backup integrity check failed: {result}")
    except Exception as error:
        destination.unlink(missing_ok=True)
        messagebox.showerror("Database Backup Failed", str(error))
        return

    size_mb = destination.stat().st_size / (1024 * 1024)
    messagebox.showinfo("Database Backup Complete", f"Backup saved to:\n{destination}\n\nSize: {size_mb:.2f} MB\nIncludes book data and cover images stored in the database.")


if __name__ == "__main__":
    main()
