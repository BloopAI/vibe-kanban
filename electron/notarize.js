const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  // Skip notarization in CI if credentials aren't set
  if (!process.env.APPLE_ID || !process.env.APPLE_ID_PASSWORD || !process.env.APPLE_TEAM_ID) {
    console.log('Skipping notarization — APPLE_ID, APPLE_ID_PASSWORD, or APPLE_TEAM_ID not set');
    return;
  }

  const appName = context.packager.appInfo.productFilename;

  console.log(`Notarizing ${appName}...`);

  await notarize({
    appBundleId: 'com.bloop.vibe-kanban',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });

  console.log(`Notarization complete for ${appName}`);
};
