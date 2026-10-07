# Desktop releases and website downloads

## GitHub setup

Commit this project to its GitHub repository, including both npm lockfiles and `src-tauri/Cargo.lock`. The workflows use `github.repository`, so no repository name is hardcoded.

- **Checks** runs frontend, script, and Rust tests on pull requests and pushes to main/master.
- **Desktop release** builds macOS arm64, macOS Intel, Windows x64, and Linux x64 on native runners. The pinned Node + cf runtime is bundled in every installer.
- Manually run **Desktop release** to produce downloadable Actions artifacts without creating a release.
- Push a matching `v<version>` tag to create a **draft GitHub Release** after all four builds succeed. Published releases cannot be overwritten by rerunning the workflow.

Linux produces `.deb` and `.AppImage`; macOS produces `.dmg`; Windows produces an NSIS `.exe` installer. ARM Windows/Linux builds are not in this initial matrix. Their runtime mappings exist, but installers need platform validation before being advertised.

## Version and release

1. Update `package.json`, the root version and root package version in `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and the `flareops` entry in `src-tauri/Cargo.lock` together.
2. Run `npm run release:check`, `npm test`, `npm run test:scripts`, and `cargo test --locked --manifest-path src-tauri/Cargo.toml`.
3. Commit changes, then tag that commit. For the current version:

   ```sh
   git tag v0.1.0-beta.1
   git push origin v0.1.0-beta.1
   ```

4. Check every matrix job, download the installers, and test installation, launch, bundled CLI discovery, and sign-in on clean machines.
5. Edit the draft release notes and check signing status in `downloads.json`. Publish the draft when ready for the website. Draft releases and their assets are not public.

Prerelease versions such as `0.2.0-beta.1` create prereleases. GitHub's `latest` URL points to a published stable release, so use a version-specific URL for beta downloads. The public website needs a public release repository; never put a GitHub access token in browser code.

## Signing

Builds work without signing credentials and remain drafts. The manifest explicitly labels macOS and Windows installers `unsigned` in this mode. These builds can trigger operating-system trust warnings.

For signed/notarized macOS releases, set repository variable `MACOS_SIGNING_ENABLED=true` and these Actions secrets:

- `APPLE_CERTIFICATE`: base64-encoded Developer ID Application `.p12` certificate
- `APPLE_CERTIFICATE_PASSWORD`: certificate password
- `APPLE_SIGNING_IDENTITY`: full Developer ID Application identity
- `APPLE_ID`: Apple account email
- `APPLE_PASSWORD`: app-specific password
- `APPLE_TEAM_ID`: developer team ID

Tauri's official Action imports the certificate. The workflow verifies the final app signature, stapled notarization ticket, and Gatekeeper assessment before marking the installer `notarized`. Never commit certificates or credentials. See [Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/).

Windows signing requires your chosen certificate/signing service and is not configured yet. Windows artifacts remain explicitly unsigned. Keep the release draft until its distribution requirements are met.

## Website integration

Each release includes stable asset names, `downloads.json`, and `SHA256SUMS.txt`. The manifest includes the version, source commit, prerelease flag, platform, architecture, file size, SHA-256, signing status, and immutable download URL for each installer.

Once published, link the website's buttons to these URLs (replace `OWNER/REPO`):

```text
https://github.com/OWNER/REPO/releases/latest/download/FlareOps-macos-arm64.dmg
https://github.com/OWNER/REPO/releases/latest/download/FlareOps-macos-x64.dmg
https://github.com/OWNER/REPO/releases/latest/download/FlareOps-windows-x64.exe
https://github.com/OWNER/REPO/releases/latest/download/FlareOps-linux-x64.AppImage
https://github.com/OWNER/REPO/releases/latest/download/FlareOps-linux-x64.deb
https://github.com/OWNER/REPO/releases/latest/download/SHA256SUMS.txt
```

For version labels and file sizes, fetch this manifest **at website build time or server-side** (GitHub asset redirects are not a reliable browser CORS endpoint):

```js
const response = await fetch(
  'https://github.com/OWNER/REPO/releases/latest/download/downloads.json',
);
if (!response.ok) throw new Error(`Release metadata unavailable: ${response.status}`);
const release = await response.json();
// Render all platform choices; do not force a platform based on the user agent.
const downloads = release.assets.map(({ platform, arch, url, bytes, signing }) => ({
  label: `${platform} ${arch}`, url, megabytes: (bytes / 1_000_000).toFixed(1), signing,
}));
```

Use the manifest's version-specific URLs when displaying checksums, so the file cannot silently switch versions while the page shows an older checksum. Refresh/redeploy the website after publishing, or use a short server-side cache. This manifest is for website downloads; automatic in-app updates are not enabled.

## Local packaging checks

```sh
CI=true npm run desktop:build -- --bundles app,dmg
node scripts/release.mjs collect src-tauri/target/release/bundle release-assets aarch64-apple-darwin
```

The macOS example sets `CI=true` to use the same noninteractive DMG packaging as GitHub Actions. Use the matching native target for your machine. The collector requires exactly one installer per format, preventing stale builds from being selected silently. The manifest assembler requires every target and rechecks sizes and hashes after downloading artifacts from Actions.

## Current beta readiness

The management app is versioned `0.1.0-beta.1`. The Projects experiment is inactive
and its harness is excluded from desktop packages. CI rejects high/critical npm
advisories in the app and bundled CLI. The CLI pins `sharp` 0.35.5 to address
[GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w).

Before a public launch, complete macOS signing/notarization, configure Windows
signing, and run the clean-machine checks above on each platform. The repository
is private: its release download links require access until a public distribution
location is configured. Do not publish the repository just to make downloads work.

Command history is scoped by both account and profile in the native service.
History deletion only affects that scope; legacy entries without account context
are not returned. On Unix, local history/cache files use owner-only permissions.
These files are not encrypted, and profiles are not OS-level security sandboxes.

### Local validation — 7 October 2026

- 89 frontend tests, 52 script tests and 33 Rust tests passed.
- Version consistency and frontend production build passed.
- App and bundled CLI production npm audits reported zero known vulnerabilities.
- Patched sharp native image generation passed (`sharp` 0.35.5 / librsvg 2.63.2).
- macOS arm64 `.app` and `.dmg` built. Packaged app launched successfully; the
  packaged sidecar reported cf 1.0.0-beta.8. Resources contain only the CLI runtime,
  licenses and app icon, with no harness runtime.
- Installer: `src-tauri/target/release/bundle/dmg/FlareOps_0.1.0-beta.1_aarch64.dmg`.
  Its checksum is in the adjacent `SHA256SUMS.txt`.
- Signature is ad-hoc, with no Developer ID or notarization. Other platforms and
  clean-machine sign-in/mutation checks remain unverified. No release was published.
