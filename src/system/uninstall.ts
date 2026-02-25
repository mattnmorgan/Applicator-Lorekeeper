export async function OnUninstallation(context: {
  version: string;
  appId: string;
}) {
  console.log(`${context.appId} ${context.version} uninstalled`);
}
