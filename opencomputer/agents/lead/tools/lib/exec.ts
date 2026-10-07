import { execFile } from "node:child_process";

import { emit, scrub } from "./telemetry";

/** What a finished command left behind. */
export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  cwd?: string;
  /** Written to the command's standard input. */
  input?: string;
}

export type Exec = (command: string, args: readonly string[], options?: ExecOptions) => Promise<ExecResult>;

/**
 * Runs a command on the session's computer and never throws on a non-zero exit.
 * Commands run here do not refresh the GitHub token: the platform installs it
 * when the computer starts and refreshes it only when a shell command is
 * dispatched, so after a long gap the lead runs one trivial shell command
 * before `integrate` or `open_pr`, or a long-idle computer may hold an
 * expired token.
 */
export const realExec: Exec = async (command, args, options = {}) => {
  const started = Date.now();
  const result = await spawn(command, args, options).catch(async (error: Error) => {
    await emit({ event: "exec", command: scrub(`${command} ${args.slice(0, 3).join(" ")}`, 160), ms: Date.now() - started, error: scrub(error.message, 300) });
    throw error;
  });
  await emit({
    event: "exec",
    command: scrub(`${command} ${args.slice(0, 3).join(" ")}`, 160),
    code: result.code,
    ms: Date.now() - started,
    ...(result.code === 0 ? {} : { stderr: scrub(result.stderr || result.stdout, 400) }),
  });
  return result;
};

/** One child process; resolves with its exit code and output. */
const spawn: Exec = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      command,
      [...args],
      {
        cwd: options.cwd,
        maxBuffer: 64 * 1024 * 1024,
        // A credential prompt would hang the tool; fail instead.
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GH_PROMPT_DISABLED: "1" },
      },
      (error, stdout, stderr) => {
        if (error && typeof (error as NodeJS.ErrnoException).code === "string") {
          reject(new Error(`${command} could not start: ${error.message}`));
          return;
        }
        const code = error ? Number((error as { code?: unknown }).code ?? 1) || 1 : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
    if (options.input !== undefined) child.stdin?.end(options.input);
  });

/**
 * Where the tools run. On the computer: real commands, clones under
 * `/workspace/.kevin` (the workspace persists across turns, so a clone is a
 * cache), remotes on GitHub. Tests replace `exec` to answer
 * `gh` themselves and point `remoteBase` at local bare repositories.
 */
export const runtime: { exec: Exec; cloneRoot: string; remoteBase: string } = {
  exec: realExec,
  cloneRoot: "/workspace/.kevin",
  remoteBase: "https://github.com/",
};

/** Runs a command and throws with its output when it fails. */
export async function must(command: string, args: readonly string[], options?: ExecOptions): Promise<string> {
  const result = await runtime.exec(command, args, options);
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout).trim().split("\n").slice(-5).join("\n");
    throw new Error(`${command} ${args.slice(0, 2).join(" ")} failed (exit ${result.code}): ${detail}`);
  }
  return result.stdout;
}
