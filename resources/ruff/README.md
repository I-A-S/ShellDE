# Ruff binary slot

Drop the platform-specific ruff binary in this directory to enable
format-on-save and ruff diagnostics for Python files in packaged builds.

Expected file names:

- `ruff.exe` (Windows)
- `ruff` (macOS, Linux)

Download from <https://github.com/astral-sh/ruff/releases>.

If this directory is empty (or no binary matches the current platform), the
LSP manager will fall back to whatever `ruff` it can find on `PATH`. If
neither is available, format-on-save becomes a no-op for Python files; all
other LSP features (provided by pyright) continue to work.
