## FlareOps

A desktop workspace for Cloudflare. Includes Node and the official `cf` CLI; no separate runtime installation is required.

### Downloads

- macOS Apple Silicon: `FlareOps-macos-arm64.dmg`
- macOS Intel: `FlareOps-macos-x64.dmg`
- Windows x64: `FlareOps-windows-x64.exe`
- Linux x64: `FlareOps-linux-x64.AppImage` or `FlareOps-linux-x64.deb`

`SHA256SUMS.txt` contains installer checksums. `downloads.json` contains versions, platform details, download URLs, sizes, and signing status for the website.

### Before publishing this draft

- Replace this section with the changes in this version.
- Install and launch each platform build on a clean machine; verify the bundled CLI and sign-in.
- Inspect `downloads.json`: macOS builds are unsigned unless Apple signing is enabled. Windows signing is not yet configured. Resolve signing requirements before promoting these builds as general public downloads.
- Publish the release when ready. Draft assets are not publicly downloadable.

### License and source

FlareOps is licensed under AGPL-3.0-only. The matching source is available through this release's source archives and tag in [waltzaround/flareops](https://github.com/waltzaround/flareops). Build instructions are in README.md. Third-party components retain their own licenses.
