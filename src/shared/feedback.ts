/** Links for feedback on GitHub. Pure functions — environment details are passed in. */

export const REPO_URL = "https://github.com/ogbozoyan/cmdly";

export interface Environment {
  /** Cmdly version from the manifest. */
  version: string;
  userAgent: string;
  platform: string;
}

/** "Chrome 156.0.8078.47 · macOS" — no full user agent, nothing personal. */
export function describeEnvironment(env: Environment): string {
  const chrome = /Chrome\/([\d.]+)/.exec(env.userAgent)?.[1] ?? "unknown";
  const os = /Mac/.test(env.platform)
    ? "macOS"
    : /Win/.test(env.platform)
      ? "Windows"
      : /CrOS/.test(env.userAgent)
        ? "ChromeOS"
        : /Linux/.test(env.platform)
          ? "Linux"
          : env.platform || "unknown";
  return `Cmdly ${env.version} · Chrome ${chrome} · ${os}`;
}

export function bugReportUrl(env: Environment): string {
  const body = [
    "**What happened**",
    "",
    "",
    "**Steps to reproduce**",
    "1. ",
    "2. ",
    "",
    "**Expected**",
    "",
    "",
    "**Environment**",
    describeEnvironment(env),
  ].join("\n");
  return newIssueUrl({ labels: "bug", body });
}

export function featureRequestUrl(env: Environment): string {
  const body = [
    "**What would you like Cmdly to do?**",
    "",
    "",
    "**Example: what you type and what you expect to see**",
    "",
    "",
    `<sub>${describeEnvironment(env)}</sub>`,
  ].join("\n");
  return newIssueUrl({ labels: "enhancement", body });
}

function newIssueUrl(params: Record<string, string>): string {
  return `${REPO_URL}/issues/new?${new URLSearchParams(params)}`;
}
