import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Octokit } from "@octokit/core";
import { getGitCommit } from "./git.js";

const renderTestPathNative = "metrics/integration/render-tests";
const maplibreNative = path.resolve("../maplibre-native", renderTestPathNative);
const renderTestPathJs = "test/integration/render/tests";
const maplibreJs = path.resolve("../maplibre-gl-js", renderTestPathJs);

type Report = {
  missingDirsNative: string[];
  missingDirsJs: string[];
  sameDirs: string[];
  missingStylesNative: string[];
  missingStylesJs: string[];
};

async function compareDirectories(nativePath: string, jsDir: string): Promise<Report> {
  async function getDirs(dirPath: string, relativeTo: string) {
    const dir = await fs.opendir(dirPath);
    const dirs: Record<string, boolean> = {};
    const styles: Record<string, boolean> = {};
    for await (const dirent of dir) {
      const currPath = path.resolve(dirent.path, dirent.name).replace(`${relativeTo}/`, "");
      if (dirent.name === "style.json") {
        styles[currPath] = true;
      } else if (dirent.isDirectory()) {
        dirs[currPath] = true;
      }
    }
    return { dirs, styles };
  }

  const { dirs: nativeDirs, styles: nativeStyles } = await getDirs(nativePath, maplibreNative);
  const { dirs: jsDirs, styles: jsStyles } = await getDirs(jsDir, maplibreJs);

  function compare(nativeDirs: Record<string, boolean>, jsDirs: Record<string, boolean>) {
    const missingDirsNative = Object.keys(jsDirs).filter((d) => !nativeDirs[d]);
    const missingDirsJs = Object.keys(nativeDirs).filter((d) => !jsDirs[d]);
    const sameDirs = Object.keys(jsDirs).filter((d) => nativeDirs[d]);

    const missingStylesNative = Object.keys(jsStyles).filter((f) => !nativeStyles[f]);
    const missingStylesJs = Object.keys(nativeStyles).filter((f) => !jsStyles[f]);

    return {
      missingDirsNative,
      missingDirsJs,
      sameDirs,
      missingStylesNative,
      missingStylesJs,
    };
  }

  const comparison = compare(nativeDirs, jsDirs);
  const { sameDirs } = comparison;
  const all = (
    await Promise.all(
      sameDirs.map((sameDir) =>
        compareDirectories(
          path.resolve(maplibreNative, sameDir),
          path.resolve(maplibreJs, sameDir),
        ),
      ),
    )
  ).reduce(
    (prev, curr) => ({
      missingDirsJs: [...prev.missingDirsJs, ...curr.missingDirsJs],
      missingDirsNative: [...prev.missingDirsNative, ...curr.missingDirsNative],
      sameDirs: [...prev.sameDirs, ...curr.sameDirs],
      missingStylesJs: [...prev.missingStylesJs, ...curr.missingStylesJs],
      missingStylesNative: [...prev.missingStylesNative, ...curr.missingStylesNative],
    }),
    comparison,
  );

  return all;
}

async function mdStatusReport(report: Report) {
  const { commit: jsCommit } = await getGitCommit(maplibreJs);
  const { commit: nativeCommit } = await getGitCommit(maplibreNative);

  return `

# MapLibre Render Test Parity Status Report

Generated on: ${new Date().toISOString()}

|Project|Commit|
|-------|------|
|MapLibre GL JS| [${jsCommit}](https://github.com/maplibre/maplibre-gl-js/commit/${jsCommit}) |
|MapLibre Native| [${nativeCommit}](https://github.com/maplibre/maplibre-native/commit/${nativeCommit}) |

## Missing MapLibre Native

${report.missingDirsNative.map((d) => `- [\`${d}\`](https://github.com/maplibre/maplibre-gl-js/tree/main/${renderTestPathJs}/${d})`).join("\n")}

## Missing MapLibre GL JS

${report.missingDirsJs.map((d) => `- [\`${d}\`](https://github.com/maplibre/maplibre-native/tree/main/${renderTestPathNative}/${d})`).join("\n")}

  `.trim();
}

async function run() {
  const result = await compareDirectories(maplibreNative, maplibreJs);

  if (typeof process.env.GIST_ID !== "string") return;
  if (typeof process.env.GITHUB_TOKEN !== "string") return;

  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });

  const mdReport = await mdStatusReport(result);

  await octokit.request("PATCH /gists/{gist_id}", {
    gist_id: process.env.GIST_ID,
    description: "Render Test Parity Status MapLibre",
    files: {
      "status.md": {
        content: mdReport,
      },
    },
  });
}

run();
