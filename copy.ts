import fs from "fs/promises";
import path from "path";
import { maplibreJs, maplibreNative } from "./paths.js";

async function copyDirectory(src: string, dest: string) {
  try {
    const entries = await fs.readdir(src, { withFileTypes: true });

    await fs.mkdir(dest, { recursive: true });

    for (let entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  } catch (error) {
    console.error(`Error copying directory from ${src} to ${dest}:`, error);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error("Usage: scriptname [from-js|from-native] [path]");
    process.exit(1);
  }

  const [direction, userPath] = args;
  const src = path.resolve(direction === "from-js" ? maplibreJs : maplibreNative, userPath);
  const dest = path.resolve(direction === "from-js" ? maplibreNative : maplibreJs, userPath);

  console.log({src, dest});

  if (direction === "from-js" || direction === "from-native") {
    await copyDirectory(src, dest);
    console.log(`Successfully copied from ${src} to ${dest}`);
  } else {
    console.error('Invalid direction. Use either "from-js" or "from-native".');
    process.exit(1);
  }
}

main();
