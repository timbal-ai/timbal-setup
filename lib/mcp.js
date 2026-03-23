/**
 * mcp.js
 *
 * Configure the Timbal MCP server for each agent.
 *
 * For Claude Code, we delegate to `claude mcp add/remove` CLI commands
 * rather than writing config files directly — Claude Code's internal
 * state file (~/.claude.json) has a complex per-project structure that
 * should not be modified by external tools.
 */

import { execFileSync } from 'node:child_process';

const MCP_KEY = 'timbal';
const MCP_URL = 'https://api.timbal.ai/mcp';

/**
 * Run a command and return { ok, stdout, stderr }.
 *
 * @param {string} cmd
 * @param {string[]} args
 * @returns {{ ok: boolean, stdout: string, stderr: string }}
 */
function run(cmd, args) {
  try {
    const stdout = execFileSync(cmd, args, {
      encoding: 'utf8',
      timeout: 15_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true, stdout: stdout.trim(), stderr: '' };
  } catch (err) {
    return {
      ok: false,
      stdout: (err.stdout || '').trim(),
      stderr: (err.stderr || err.message || '').trim(),
    };
  }
}

/**
 * Check whether the `claude` CLI is available.
 *
 * @returns {boolean}
 */
export function hasClaudeCli() {
  const { ok } = run('claude', ['--version']);
  return ok;
}

/**
 * Add the Timbal MCP server to Claude Code via `claude mcp add`.
 * Uses --scope user so it applies across all projects.
 *
 * @param {string} token
 * @returns {{ ok: boolean, message: string }}
 */
export function writeMcpConfig(_settingsPath, token) {
  // Remove first to avoid "already exists" errors
  run('claude', ['mcp', 'remove', MCP_KEY, '--scope', 'user']);

  const { ok, stderr } = run('claude', [
    'mcp', 'add',
    '--transport', 'http',
    '--scope', 'user',
    '--header', `Authorization: Bearer ${token}`,
    MCP_KEY,
    MCP_URL,
  ]);

  if (!ok) {
    return { ok: false, message: stderr };
  }
  return { ok: true, message: 'configured via claude mcp add' };
}

/**
 * Remove the Timbal MCP server from Claude Code via `claude mcp remove`.
 *
 * @returns {{ ok: boolean, message: string }}
 */
export function removeMcpConfig(_settingsPath) {
  const { ok, stderr } = run('claude', ['mcp', 'remove', MCP_KEY, '--scope', 'user']);
  if (!ok) {
    return { ok: false, message: stderr };
  }
  return { ok: true, message: 'removed via claude mcp remove' };
}

/**
 * Check whether the Timbal MCP server is configured in Claude Code.
 *
 * @returns {boolean}
 */
export function hasMcpConfig(_settingsPath) {
  const { ok, stdout } = run('claude', ['mcp', 'get', MCP_KEY]);
  return ok && stdout.length > 0;
}
