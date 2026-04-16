# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Dev mode (hot reload per frontend, recompila Rust al cambio)
npm run tauri dev

# Build debug (più veloce, produce .app + .dmg in target/debug/bundle/)
npm run tauri build -- --debug

# Build release
npm run tauri build
```

Rust richiede `. "$HOME/.cargo/env"` se non è già nel PATH della shell corrente.

## Architettura

App desktop **Tauri v2** — frontend statico (HTML/CSS/JS vanilla, no bundler) + backend Rust.

- **`src/`** — frontend puro, caricato come file statici da Tauri
  - `index.html` — unica pagina: drop zone, lista file, slider qualità, bottone converti
  - `main.js` — logica UI, drag & drop, dialog file/cartella, invocazione comandi Rust
  - `styles.css` — tema dark, layout flex
- **`src-tauri/src/lib.rs`** — tutta la logica applicativa:
  - `detect_tools()` — rileva cwebp / sips / ImageMagick / ffmpeg in ordine di priorità
  - `list_images_in_dir(dir)` — restituisce JPG/PNG in una cartella (non ricorsivo)
  - `convert_files(files, quality)` — converte ogni file, crea `WEBP/` nella stessa dir, ritorna risultati con size prima/dopo
- **`src-tauri/src/main.rs`** — entry point: chiama `webp_convert_lib::run()`
- **`src-tauri/capabilities/default.json`** — permessi Tauri: `core:default`, `dialog:default`, `dialog:allow-open`

## Tool di conversione (priorità)

1. `cwebp` — qualità ottimale
2. `sips` — solo macOS, zero dipendenze
3. `magick` / `convert` — ImageMagick 7 / 6
4. `ffmpeg` — ultima alternativa

Il tool attivo viene rilevato all'avvio e mostrato in UI. Se nessuno è disponibile il bottone Converti rimane disabilitato.

## Convenzioni

- Output sempre in `WEBP/` sottocartella accanto ai file sorgente, originali mai toccati
- Qualità: slider 50–100, default 80
- La selezione cartella è non-ricorsiva (solo il primo livello)
- La build debug legge i file da `../src` (path relativo alla finestra Tauri); modifiche al frontend richiedono rebuild o `tauri dev`
