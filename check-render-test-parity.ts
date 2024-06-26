import * as fs from "node:fs/promises";
import { Octokit } from "@octokit/core";
import { getGitCommit } from "./git.js";
import { maplibreJs, maplibreNative, renderTestPathJs, renderTestPathNative } from "./paths.js";
import * as path from "node:path";

type Report = {
  missingDirsNative: string[];
  missingDirsJs: string[];
  sameDirs: string[];
  missingStylesNative: string[];
  missingStylesJs: string[];
  sameStyles: string[]
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
    const sameStyles = Object.keys(nativeStyles).filter((f) => jsStyles[f]);

    return {
      missingDirsNative,
      missingDirsJs,
      sameDirs,
      missingStylesNative,
      missingStylesJs,
      sameStyles
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
      sameStyles: [...prev.sameStyles, ...curr.sameStyles]
    }),
    comparison,
  );

  return all;
}

function linkIssue(issues: any, renderTest: string, platform: "native" | "js") {
  const issue = issues?.[renderTest]?.[platform];
  if (!issue) return "";
  return issue;
}

function formatIssue(issueLink: string) {
  if (!issueLink) return "";
  return `([Tracking issue](${issueLink}))`
}

async function mdStatusReport(report: Report) {
  const { commit: jsCommit } = await getGitCommit(maplibreJs);
  const { commit: nativeCommit } = await getGitCommit(maplibreNative);

  return `

# MapLibre Render Test Parity Status Report

Generated on: ${new Date().toISOString()} with [this script](https://github.com/louwers/render-test-parity-tool/blob/main/check-render-test-parity.ts).

|Project|Commit|
|-------|------|
|MapLibre GL JS| [${jsCommit}](https://github.com/maplibre/maplibre-gl-js/commit/${jsCommit}) |
|MapLibre Native| [${nativeCommit}](https://github.com/maplibre/maplibre-native/commit/${nativeCommit}) |

${report.sameStyles.length} render tests are shared.`.trim();
}

function missingNative(report: Report, issues: any) {
  return `
  ## Missing MapLibre Native

${report.missingDirsNative.map((d) => `- [\`${d}\`](https://github.com/maplibre/maplibre-gl-js/tree/main/${renderTestPathJs}/${d}) ${formatIssue(linkIssue(issues, d, "native"))}`).join("\n")}
  `;
}

function missingJs(report: Report) {
  return `
  ## Missing MapLibre GL JS

  ${report.missingDirsJs.map((d) => `- [\`${d}\`](https://github.com/maplibre/maplibre-native/tree/main/${renderTestPathNative}/${d})`).join("\n")}`
}

async function run() {
  const result = await compareDirectories(maplibreNative, maplibreJs);

  if (typeof process.env.GIST_ID !== "string") return;
  if (typeof process.env.GITHUB_TOKEN !== "string") return;

  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });

  const mdReport = await mdStatusReport(result);
  const issues = JSON.parse(await fs.readFile("./issues.json", "utf-8"))

  const mdMissingNative = missingNative(result, issues);
  const mdMissingJs = missingJs(result);

  await octokit.request("PATCH /gists/{gist_id}", {
    gist_id: process.env.GIST_ID,
    description: "Render Test Parity Status MapLibre",
    files: {
      "status.md": {
        content: mdReport + mdMissingNative + mdMissingJs,
      },
    },
  });

  await octokit.request("PATCH /repos/{owner}/{repo}/issues/{issue_number}", {
    issue_number: 2445,
    owner: 'maplibre',
    repo: 'maplibre-native',
    body: mdReport + mdMissingNative
  })
}

run();
