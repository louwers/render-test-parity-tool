import { simpleGit } from "simple-git";

export async function getGitCommit(path: string) {
  const git = simpleGit(path);

  const [commitResult] = await Promise.all([git.raw(["rev-parse", "--short", "HEAD"])]);
  const commit = commitResult.trim();
  return { commit };
}
