const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const logPath = path.resolve(__dirname, "..", "package.log");
const logStream = fs.createWriteStream(logPath, { flags: "w" });

function log(message) {
  const timestamp = new Date().toISOString();
  logStream.write(`[${timestamp}] ${message}\n`);
  console.log(message);
}

async function buildPackage() {
  log("Starting package build...");

  const appJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "src", "meta", "app.json"), "utf8")
  );
  const version = `${appJson.version.major}.${appJson.version.minor}.${appJson.version.dev}`;
  const outputDir = path.resolve(__dirname, "..", "dist");
  const zipPath = path.join(outputDir, `app-${version}.zip`);

  log(`Version: ${version}`);
  log(`Output directory: ${outputDir}`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    log("Created output directory");
  }

  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  output.on("close", () => {
    log(`✓ Package created: app-${version}.zip (${archive.pointer()} bytes)`);
    logStream.end();
  });

  archive.on("error", (err) => {
    log(`✗ Archive error: ${err.message}`);
    throw err;
  });

  archive.pipe(output);

  log("Adding files to archive...");
  archive
    .file("dist/app.json", { name: "app.json" })
    .file("dist/app.js", { name: "app.js" })
    .directory("dist/api/", "api")
    .directory("dist/apps/", "apps");

  const optionalDirs = ["assets", "tables", "agents", "system"];
  for (const dir of optionalDirs) {
    const dirPath = path.join(outputDir, dir);
    if (fs.existsSync(dirPath)) {
      archive.directory(`dist/${dir}/`, dir);
      log(`Added ${dir}/ directory`);
    }
  }

  // Include app.png if present
  const iconPath = path.join(outputDir, "app.png");
  if (fs.existsSync(iconPath)) {
    archive.file("dist/app.png", { name: "app.png" });
  }

  log("Finalizing archive...");
  await archive.finalize();
}

buildPackage().catch((err) => {
  log(`✗ Error building package: ${err.message}`);
  logStream.end();
  process.exit(1);
});
