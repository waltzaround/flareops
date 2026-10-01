// Official Node release checksums: https://nodejs.org/dist/v22.23.3/SHASUMS256.txt
export const nodeVersion = "22.23.3";
export const targets = {
  "darwin-arm64": {
    triple: "aarch64-apple-darwin",
    archive: "darwin-arm64.tar.gz",
    sha256: "23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53",
  },
  "darwin-x64": {
    triple: "x86_64-apple-darwin",
    archive: "darwin-x64.tar.gz",
    sha256: "8a677b0219178efd6eb0e475457c4afb452b521a92f6e67845a73bd85727f2a8",
  },
  "linux-arm64": {
    triple: "aarch64-unknown-linux-gnu",
    archive: "linux-arm64.tar.gz",
    sha256: "5ced2d48d1d7198739b7f86804de0171aefb6823b684b12341d3321afc3cb0b2",
  },
  "linux-x64": {
    triple: "x86_64-unknown-linux-gnu",
    archive: "linux-x64.tar.gz",
    sha256: "1084aa36196bba4c3a5e69a1ee388a6e4ff729dad09445fbcd434b28fe3c24af",
  },
  "win32-arm64": {
    triple: "aarch64-pc-windows-msvc",
    archive: "win-arm64.zip",
    sha256: "33dad22e4cef5ee8f9fbb1b0d037fdacd0e56d12a4580f0d63f68b894deab535",
  },
  "win32-x64": {
    triple: "x86_64-pc-windows-msvc",
    archive: "win-x64.zip",
    sha256: "2b0ff57b049cda1bbcea2240eec20467018713c1efe1f7360c2681859b90ed71",
  },
};
export function selectTarget(platform, arch, requested) {
  const target = targets[`${platform}-${arch}`];
  if (!target)
    throw new Error(`Unsupported runtime platform: ${platform}/${arch}`);
  if (requested && requested !== target.triple)
    throw new Error(
      "Build on the target OS/architecture; cf includes native optional dependencies. Cross-compilation is not supported.",
    );
  return target;
}
