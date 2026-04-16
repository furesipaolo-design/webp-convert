# WebP Convert

Local JPG/PNG → WebP image converter for macOS and Linux.

Drag & drop files or folders, adjust quality, and convert batch. Outputs saved in a `WEBP/` subfolder next to the original files. Built with [Tauri](https://tauri.app) + Rust backend.

## Requirements

**macOS / Linux:** cwebp (the WebP reference encoder)

### Install cwebp

**macOS (Homebrew):**
```bash
brew install webp
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt install webp
```

**Linux (Fedora/RHEL):**
```bash
sudo dnf install libwebp-tools
```

## Usage

1. Download and install **WebP Convert** from [Releases](https://github.com/furesipaolo-design/webp-convert/releases)
2. Open the app
3. Drag & drop JPG/PNG files or folders
4. Adjust quality slider (50–100, default 80)
5. Click **Converti** → files are saved in `WEBP/` subfolder

Original files are never modified.

## Development

```bash
npm install
npm run tauri dev     # Dev mode with hot reload
npm run tauri build   # Build release (macOS .dmg + Linux .deb/.AppImage)
```

See [CLAUDE.md](CLAUDE.md) for architecture and commands.

## License

MIT
