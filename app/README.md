# Project-Centric Todo Manager

React + TypeScript + Vite drive the UI, while Tauri wraps the app into a lightweight desktop executable. The tool follows the “项目→事项” design: compact sheet-style table, inline editing, powerful filtering, saved views, import/export, and attachments/notes per task.

## Tech Stack

- **Frontend**: React 19, Vite 7, TypeScript, Zustand for state, Immer for immutable updates, Day.js, PapaParse.
- **Desktop Shell**: [Tauri 2](https://tauri.app/) with Rust backend (auto-generated scaffolding in `src-tauri`).

## Project Structure

```
app/
├── src/                # React UI (sidebar, toolbar, table, drawer, etc.)
├── src-tauri/          # Tauri Rust project (window config, bundler settings)
├── public/             # Static assets
├── dist/               # Vite build output (consumed by Tauri)
└── package.json        # Scripts for web & desktop targets
```

## Setup

1. Install prerequisites:
   - Node.js 18+
   - Rust toolchain (`rustup`), since Tauri compiles Rust code
   - Windows build tools (Visual Studio Build Tools or Desktop development with C++)
2. Install dependencies:

```bash
cd app
npm install
```

## Running the App

### Web (Vite) mode

```bash
npm run dev
```

Open http://localhost:5173 to work in the browser. Hot Module Reloading is enabled.

### Desktop (Tauri) dev mode

```bash
npm run tauri dev
```

This runs Vite dev server and launches the Tauri shell pointing to it. Ideal for validating keyboard shortcuts, window sizing, and file dialogs in a desktop context.

## Building

### Web build

```bash
npm run build
```

Outputs minified assets to `dist/`.

### Windows `.exe` build

```bash
npm run tauri build
```

- Produces signed bundles under `src-tauri/target/release/bundle/`.
- On Windows you’ll get both an `.msi` installer and a standalone `.exe` in `.../bundle/msi` and `.../bundle/app`.
- Copy or distribute the `.exe` to run the full-featured desktop app without Node/Vite.

## Key Features Recap

- Project sidebar with search, create, rename, archive.
- Toolbar with DSL search (`status:doing tag:供应商`), multi-field filters, saved views, saved sort schemes, CSV import/export, column density/visibility management.
- Task table with grouping (项目/状态), pinning, quick-add row, inline edit, keyboard shortcuts, bulk operations, overdue highlighting.
- Details drawer: notes, next steps, checklist, attachments, and change history.
- Local persistence (Zustand + localStorage) plus CSV import/export aligned with the design spec.

For detailed functional specs revisit `design.md`. This README covers the build pipeline and desktop packaging flow requested for the Tauri-based executable.
