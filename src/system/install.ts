export async function OnInstallation(context: {
  priorVersion: string | undefined;
  currentVersion: string;
  appId: string;
}) {
  if (context.priorVersion === undefined) {
    console.log(`${context.appId} ${context.currentVersion} installed`);
  } else {
    console.log(
      `${context.appId} upgraded from ${context.priorVersion} to ${context.currentVersion}`,
    );
  }
}
