const path = require('node:path');
const { existsSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const requireSigning = process.env.AIOFFICE_REQUIRE_SIGNING === '1';
const windowsPublisher = process.env.AIOFFICE_WINDOWS_PUBLISHER_NAME?.trim();
const windowsDesktopIcon = 'apps/office-web/client/public/assets/brand/icon.ico';
const npmExecPath = process.env.npm_execpath;
const bundledNpm = npmExecPath && /(?:^|[\\/])npm-cli\.js$/i.test(npmExecPath)
  ? path.resolve(path.dirname(npmExecPath), '..')
  : undefined;
const bundledNpmNodeModules = bundledNpm && path.join(bundledNpm, 'node_modules');

if (!bundledNpm || !bundledNpmNodeModules || !existsSync(bundledNpmNodeModules)) {
  throw new Error('Build the desktop installer through npm with a complete NPM installation so it can bundle the NPM CLI and its dependencies.');
}

if (requireSigning && !process.env.CSC_LINK) {
  throw new Error('AIOFFICE_REQUIRE_SIGNING=1 but CSC_LINK is missing; refusing to produce an unsigned release.');
}
if (requireSigning && process.platform === 'win32' && !windowsPublisher) {
  throw new Error('Set AIOFFICE_WINDOWS_PUBLISHER_NAME to the verified Authenticode certificate publisher before building a Windows release.');
}
if (requireSigning && process.platform === 'darwin' && !(process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER)) {
  throw new Error('Signed macOS releases require APPLE_API_KEY, APPLE_API_KEY_ID, and APPLE_API_ISSUER for notarization.');
}

module.exports = {
  appId: 'community.iapro.aioffice',
  productName: 'AIOffice',
  extraMetadata: {
    aiofficeRelease: {
      signed: requireSigning,
      ...(windowsPublisher ? { windowsPublisherName: windowsPublisher } : {}),
    },
  },
  artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
  asar: true,
  asarUnpack: [
    'package.json',
    'apps/office-web/package.json',
    'apps/office-web/scripts/maestro.mjs',
    'apps/office-web/dist/**/*',
    'apps/office-web/.claude-plugin/**/*',
    'apps/office-web/mod/**/*',
    'apps/office-desktop/service.mjs',
    'node_modules/node-pty/**/*',
    '**/*.node',
  ],
  files: [
    'package.json',
    'LICENSE',
    'apps/office-desktop/main.mjs',
    'apps/office-desktop/bootstrap.cjs',
    'apps/office-desktop/preload.cjs',
    'apps/office-desktop/service.mjs',
    'apps/office-desktop/security.mjs',
    'apps/office-desktop/startup.mjs',
    'apps/office-desktop/storage.mjs',
    'apps/office-desktop/update-policy.mjs',
    'apps/office-desktop/github-release-updater.mjs',
    'apps/office-desktop/provider-tools.mjs',
    'apps/office-web/package.json',
    'apps/office-web/scripts/maestro.mjs',
    'apps/office-web/dist/**/*',
    'apps/office-web/.claude-plugin/**/*',
    'apps/office-web/mod/**/*',
    '!**/*.map',
  ],
  extraResources: [{
    from: 'apps/office-desktop/THIRD-PARTY-NOTICES.md',
    to: 'THIRD-PARTY-NOTICES.md',
  }, {
    from: bundledNpm,
    to: 'npm',
    filter: ['bin/npm-cli.js', 'lib/**/*', 'package.json', 'LICENSE'],
  }, {
    // Keep this as a separate unfiltered resource tree: the previous nested glob omitted
    // npm's runtime dependencies (for example graceful-fs), which made first launch fail.
    from: bundledNpmNodeModules,
    to: 'npm/node_modules',
  }],
  directories: {
    buildResources: 'apps/office-desktop/build',
    output: process.env.AIOFFICE_BUILD_OUTPUT || 'dist/installers',
  },
  // node-pty ships per-platform N-API prebuilds; rebuilding those with the current Electron ABI
  // is unnecessary and would force every Windows packager to install Visual Studio C++ tools.
  npmRebuild: false,
  nodeGypRebuild: false,
  forceCodeSigning: requireSigning,
  publish: [{
    provider: 'github',
    owner: 'IAPro-Community',
    repo: 'AIOffice',
    releaseType: 'release',
    channel: 'latest',
  }],
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    artifactName: 'AIOffice-Setup.exe',
    icon: windowsDesktopIcon,
    ...(windowsPublisher ? { publisherName: [windowsPublisher] } : {}),
  },
  nsis: {
    installerIcon: windowsDesktopIcon,
    uninstallerIcon: windowsDesktopIcon,
    oneClick: false,
    include: 'apps/office-desktop/installer.nsh',
    installerHeaderIcon: 'apps/office-web/client/public/assets/brand/icon.ico',
    perMachine: false,
    allowElevation: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: 'always',
    createStartMenuShortcut: true,
    runAfterFinish: true,
    deleteAppDataOnUninstall: false,
  },
  afterPack: async ({ appOutDir, electronPlatformName }) => {
    if (electronPlatformName !== 'win32') return;
    const result = spawnSync(process.execPath, [
      'apps/office-desktop/scripts/build-native-host.mjs',
      appOutDir,
    ], { stdio: 'inherit', windowsHide: true });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Native Messaging host build failed with exit code ${result.status}.`);
    const smoke = spawnSync(process.execPath, [
      'apps/office-desktop/scripts/test-native-host-framing.mjs',
      path.join(appOutDir, 'AIOffice Native Host.exe'),
    ], { stdio: 'inherit', windowsHide: true });
    if (smoke.error) throw smoke.error;
    if (smoke.status !== 0) throw new Error(`Native Messaging host protocol smoke test failed with exit code ${smoke.status}.`);
  },
  mac: {
    target: ['dmg', 'zip'],
    artifactName: 'AIOffice-Setup-macOS-${arch}.${ext}',
    category: 'public.app-category.productivity',
    icon: 'apps/office-web/client/public/assets/brand/icon-512.png',
    ...(requireSigning ? { hardenedRuntime: true, notarize: true } : {}),
  },
  linux: {
    target: ['AppImage', 'deb'],
    artifactName: 'AIOffice-Setup-Linux-x64.${ext}',
    category: 'Office',
    executableName: 'aioffice',
    icon: 'apps/office-web/client/public/assets/brand/icon-512.png',
    maintainer: 'IAPro-Community',
    syncDesktopName: true,
    desktop: { entry: { StartupWMClass: 'aioffice' } },
  },
};
