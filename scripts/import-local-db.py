"""Restore a local Wrangler D1 SQLite backup into the current project."""

from datetime import datetime
from pathlib import Path
import sqlite3
import tkinter as tk
from tkinter import filedialog, messagebox


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_DIR = PROJECT_ROOT / ".wrangler" / "state" / "v3" / "d1" / "miniflare-D1DatabaseObject"
REQUIRED_TABLES = {"books", "boxes", "tag_definitions", "cover_assets"}


def connect_readonly(path: Path) -> sqlite3.Connection:
    return sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)


def validate_database(path: Path) -> None:
    with connect_readonly(path) as db:
        integrity = db.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise ValueError(f"SQLite integrity check failed: {integrity}")
        tables = {
            row[0]
            for row in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        missing = REQUIRED_TABLES - tables
        if missing:
            raise ValueError("The backup is missing required tables: " + ", ".join(sorted(missing)))


def sqlite_backup(source: Path, destination: Path) -> None:
    with connect_readonly(source) as src:
        with sqlite3.connect(destination) as dst:
            src.backup(dst)


def main() -> None:
    current_databases = sorted(
        (path for path in DB_DIR.glob("*.sqlite") if path.name != "metadata.sqlite"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    if not current_databases:
        messagebox.showerror(
            "Import Database",
            "No local D1 database was found for this project. Start the project once, then run the import script again.",
        )
        return

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    backup_name = filedialog.askopenfilename(
        title="Choose a SQLite backup to import",
        filetypes=[("SQLite databases", "*.sqlite *.db *.sqlite3"), ("All files", "*.*")],
    )
    if not backup_name:
        root.destroy()
        return

    source = Path(backup_name).resolve()
    destination = current_databases[0].resolve()
    if source == destination:
        messagebox.showerror("Import Database", "The selected file is the current database. Choose a backup file.", parent=root)
        root.destroy()
        return

    try:
        validate_database(source)
    except Exception as error:
        messagebox.showerror("Backup Cannot Be Imported", str(error), parent=root)
        root.destroy()
        return

    confirmed = messagebox.askyesno(
        "Confirm Local Database Replacement",
        "This will completely replace this project's local database with the selected backup, including books and covers.\n\n"
        "Close the running app first. A copy of the current database will be saved in its folder before import.\n\n"
        f"Import this backup?\n{source}",
        icon="warning",
        parent=root,
    )
    if not confirmed:
        root.destroy()
        return

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    safety_copy = DB_DIR / f"before-import-{timestamp}.sqlite"
    try:
        sqlite_backup(destination, safety_copy)
        sqlite_backup(source, destination)
        validate_database(destination)
    except Exception as error:
        try:
            if safety_copy.exists():
                sqlite_backup(safety_copy, destination)
        except Exception as restore_error:
            messagebox.showerror(
                "Import and Recovery Failed",
                f"Import error: {error}\nRecovery error: {restore_error}\n\n"
                f"The pre-import database copy is still available at:\n{safety_copy}",
                parent=root,
            )
            root.destroy()
            return
        messagebox.showerror(
            "Import Failed",
            f"Import did not complete. The original database recovery was attempted.\n\nError: {error}\n\n"
            f"Pre-import database copy:\n{safety_copy}",
            parent=root,
        )
        root.destroy()
        return

    messagebox.showinfo(
        "Database Import Complete",
        f"Data has been imported into this project.\n\nPre-import database copy:\n{safety_copy}\n\n"
        "You can restart the project now.",
        parent=root,
    )
    root.destroy()


if __name__ == "__main__":
    main()
