<div align="center">
  <img src="resources/icon.png" alt="ShellDE Logo" width="160" style="border-radius: 1.15rem;"/>
  <br/>
  
  <img src="https://img.shields.io/badge/license-apache_v2-blue.svg" alt="License"/>

  <p style="padding-top: 0.2rem;">
    <b>A Modern Shell for Custom IDEs</b>
  </p>
</div>

ShellDE is a lightweight desktop IDE shell built with Electron, React, TypeScript, Monaco Editor, and xterm.js.
It is designed as a practical foundation for building custom coding environments with an integrated editor, terminal, workspace tree, and Language Server Protocol (LSP) support.

## Highlights

- Frameless, modern desktop UI powered by Electron + React
- Monaco-based code editor with tabbed editing
- Integrated terminal tabs using `node-pty` and `xterm.js`
- Workspace explorer with file/folder create, rename, delete, copy, and move
- Find/replace across files in the active workspace
- Built-in Python language support through `pyright` and `ruff` LSP servers
- Save current file and save-all workflows with unsaved-changes confirmation dialogs

## Tech Stack

- **Desktop runtime:** Electron
- **Frontend:** React + TypeScript + Vite (`electron-vite`)
- **Editor:** Monaco Editor
- **Terminal:** xterm.js + node-pty
- **LSP transport:** JSON-RPC over stdio
- **Packaging:** electron-builder

## Prerequisites

- Node.js 20+ (LTS recommended)
- npm 10+
- For full Python tooling support:
  - `pyright` is included as an npm dependency
  - Install `ruff` and ensure it is available on your `PATH` (or bundle it under `resources/ruff` for packaged builds)

## Getting Started

```bash
npm install
npm run dev
```

This starts the Electron app in development mode with hot reload.

## Available Scripts

- `npm run dev` - Start app in development mode
- `npm run start` - Preview built app
- `npm run build` - Type-check and build production assets
- `npm run build:unpack` - Build and generate unpacked Electron output
- `npm run build:win` - Build Windows package
- `npm run build:mac` - Build macOS package
- `npm run build:linux` - Build Linux package
- `npm run lint` - Run ESLint
- `npm run format` - Format repository with Prettier
- `npm run typecheck` - Run Node + web TypeScript checks

## Project Structure

```text
src/
  main/       # Electron main process (window, filesystem, terminal, LSP bridge, menus)
  preload/    # Secure API bridge exposed to renderer
  renderer/   # React UI, Monaco integration, terminal panes, dialogs, LSP client logic
resources/    # Static assets (icons, optional bundled binaries such as ruff)
```

## LSP Notes

ShellDE includes built-in Python language support:

- **Pyright** for completions, diagnostics, navigation, and symbol intelligence
- **Ruff** for diagnostics and formatting support

If `ruff` is not installed or not found on `PATH`, Ruff-backed features will be unavailable, but the rest of the application remains functional.

## Current Scope

ShellDE is intentionally minimal and focused on core IDE shell capabilities. It provides a clean base for further extensions such as additional language servers, richer debugging flows, extension systems, and advanced workspace operations.

## **License**

Copyright (C) 2026 IAS. Licensed under the [Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0).
