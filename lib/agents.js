/**
 * agents.js
 *
 * Agent/provider registry. Each provider defines how to detect, configure MCP,
 * and install skills for a given AI coding agent.
 *
 * To add a new provider, add an entry to ALL_AGENTS with the required methods.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { run, atomicWriteFileSync } from './utils.js';

const MCP_KEY = 'timbal';
const MCP_URL = 'https://api.timbal.ai/mcp';

// ---------------------------------------------------------------------------
// Helpers for file-based MCP config (shared by Cursor, Codex, etc.)
// ---------------------------------------------------------------------------

/**
 * Create MCP methods for agents that store config in a simple JSON file.
 *
 * @param {() => string} configPathFn - returns the absolute path to the JSON config file
 * @param {object} [opts]
 * @param {string} [opts.serversKey='mcpServers'] - top-level key holding the servers map
 * @param {string} [opts.urlField='url'] - field name for the server URL
 * @returns {{ _configPath, _readConfig, _writeConfig, writeMcp, removeMcp, hasMcp }}
 */
function jsonMcpMethods(configPathFn, { serversKey = 'mcpServers', urlField = 'url' } = {}) {
  return {
    _configPath: configPathFn,

    _readConfig() {
      const p = this._configPath();
      if (!existsSync(p)) return {};
      try {
        return JSON.parse(readFileSync(p, 'utf8'));
      } catch {
        return {};
      }
    },

    _writeConfig(config) {
      atomicWriteFileSync(this._configPath(), JSON.stringify(config, null, 2) + '\n');
    },

    writeMcp(token) {
      try {
        const config = this._readConfig();
        if (!config[serversKey]) config[serversKey] = {};
        config[serversKey][MCP_KEY] = {
          [urlField]: MCP_URL,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        };
        this._writeConfig(config);
        return { ok: true, message: `configured in ${this._configPath()}` };
      } catch (err) {
        return { ok: false, message: err.message };
      }
    },

    removeMcp() {
      try {
        const config = this._readConfig();
        if (config[serversKey]) {
          delete config[serversKey][MCP_KEY];
        }
        this._writeConfig(config);
        return { ok: true, message: 'removed' };
      } catch (err) {
        return { ok: false, message: err.message };
      }
    },

    hasMcp() {
      const config = this._readConfig();
      return !!(config[serversKey] && config[serversKey][MCP_KEY]);
    },
  };
}

// ---------------------------------------------------------------------------
// Provider: Claude Code
// Uses the `claude` CLI to manage MCP servers (never writes ~/.claude.json
// directly — it has complex per-project internal structure).
// ---------------------------------------------------------------------------

const claudeCode = {
  id: 'claude-code',
  name: 'Claude Code',

  detect() {
    const { ok } = run('claude', ['--version']);
    return ok;
  },

  skillsDir() {
    return join(homedir(), '.claude', 'skills', 'timbal');
  },

  writeMcp(token) {
    // Remove first to avoid "already exists" errors
    run('claude', ['mcp', 'remove', MCP_KEY, '--scope', 'user']);

    const { ok, stderr } = run('claude', [
      'mcp', 'add',
      '--transport', 'http',
      '--scope', 'user',
      MCP_KEY,
      MCP_URL,
      '--header', `Authorization: Bearer ${token}`,
    ]);

    return ok
      ? { ok: true, message: 'configured via claude mcp add' }
      : { ok: false, message: stderr };
  },

  removeMcp() {
    const { ok, stderr } = run('claude', ['mcp', 'remove', MCP_KEY, '--scope', 'user']);
    return ok
      ? { ok: true, message: 'removed' }
      : { ok: false, message: stderr };
  },

  hasMcp() {
    const { ok, stdout } = run('claude', ['mcp', 'get', MCP_KEY]);
    return ok && stdout.length > 0;
  },
};

// ---------------------------------------------------------------------------
// Provider: Cursor
// MCP config: ~/.cursor/mcp.json (JSON, mcpServers key)
// Skills: ~/.cursor/skills/timbal/SKILL.md
// ---------------------------------------------------------------------------

const cursor = {
  id: 'cursor',
  name: 'Cursor',

  detect() {
    return existsSync(join(homedir(), '.cursor'));
  },

  skillsDir() {
    return join(homedir(), '.cursor', 'skills', 'timbal');
  },

  ...jsonMcpMethods(() => join(homedir(), '.cursor', 'mcp.json')),
};

// ---------------------------------------------------------------------------
// Provider: Codex (OpenAI)
// MCP config: ~/.codex/config.toml (TOML format, uses `codex mcp add` CLI)
// Skills: ~/.codex/AGENTS.md (single file, not a directory)
// ---------------------------------------------------------------------------

const codex = {
  id: 'codex',
  name: 'Codex',

  detect() {
    const { ok } = run('codex', ['--version']);
    return ok;
  },

  skillsDir() {
    return null; // Codex uses AGENTS.md, handled separately
  },

  /**
   * Path to the global AGENTS.md file for Codex.
   */
  agentsMdPath() {
    return join(homedir(), '.codex', 'AGENTS.md');
  },

  writeMcp(token) {
    // Remove first to avoid "already exists" errors
    run('codex', ['mcp', 'remove', MCP_KEY]);

    const { ok, stderr } = run('codex', [
      'mcp', 'add', MCP_KEY,
      '--url', MCP_URL,
      '--bearer-token-env-var', 'TIMBAL_API_KEY',
    ]);

    // Codex reads the token from an env var at runtime, so we also
    // need to tell the user to set it. But for now, if the CLI
    // doesn't support --header directly, we fall back to writing
    // the config.toml manually.
    if (!ok) {
      return this._writeMcpToml(token);
    }
    return { ok: true, message: 'configured via codex mcp add' };
  },

  /**
   * Fallback: write directly to ~/.codex/config.toml if the CLI fails.
   */
  _writeMcpToml(token) {
    try {
      const configPath = join(homedir(), '.codex', 'config.toml');
      let content = '';
      if (existsSync(configPath)) {
        content = readFileSync(configPath, 'utf8');
      }

      // Remove existing [mcp_servers.timbal] section if present
      content = content.replace(
        /\n*\[mcp_servers\.timbal\]\n(?:[^\[]*?)(?=\n\[|\n*$)/s,
        ''
      );

      // Append new section
      const section = `\n[mcp_servers.timbal]\nurl = "${MCP_URL}"\n\n[mcp_servers.timbal.http_headers]\nAuthorization = "Bearer ${token}"\n`;
      content = content.trimEnd() + '\n' + section;

      atomicWriteFileSync(configPath, content);
      return { ok: true, message: `configured in ${configPath}` };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  },

  removeMcp() {
    const { ok, stderr } = run('codex', ['mcp', 'remove', MCP_KEY]);
    if (!ok) {
      // Fallback: remove from config.toml directly
      try {
        const configPath = join(homedir(), '.codex', 'config.toml');
        if (!existsSync(configPath)) return { ok: true, message: 'nothing to remove' };
        let content = readFileSync(configPath, 'utf8');
        content = content.replace(
          /\n*\[mcp_servers\.timbal\]\n(?:[^\[]*?)(?=\n\[|\n*$)/s,
          ''
        );
        atomicWriteFileSync(configPath, content.trimEnd() + '\n');
        return { ok: true, message: 'removed from config.toml' };
      } catch (err) {
        return { ok: false, message: err.message };
      }
    }
    return { ok: true, message: 'removed via codex mcp remove' };
  },

  hasMcp() {
    // Check config.toml for [mcp_servers.timbal]
    const configPath = join(homedir(), '.codex', 'config.toml');
    if (!existsSync(configPath)) return false;
    try {
      const content = readFileSync(configPath, 'utf8');
      return content.includes('[mcp_servers.timbal]');
    } catch {
      return false;
    }
  },
};

// ---------------------------------------------------------------------------
// Provider: Windsurf (Codeium)
// MCP config: ~/.codeium/windsurf/mcp_config.json (uses `serverUrl` not `url`)
// Rules: ~/.codeium/windsurf/memories/global_rules.md
// ---------------------------------------------------------------------------

const windsurf = {
  id: 'windsurf',
  name: 'Windsurf',

  detect() {
    return existsSync(join(homedir(), '.codeium', 'windsurf'));
  },

  skillsDir() {
    return null; // Windsurf uses global_rules.md, not a skills directory
  },

  ...jsonMcpMethods(
    () => join(homedir(), '.codeium', 'windsurf', 'mcp_config.json'),
    { serversKey: 'mcpServers', urlField: 'serverUrl' },
  ),
};

// ---------------------------------------------------------------------------
// Provider: Gemini CLI (Google)
// Uses `gemini mcp add` CLI (like Claude Code).
// Instructions: ~/.gemini/GEMINI.md
// ---------------------------------------------------------------------------

const geminiCli = {
  id: 'gemini-cli',
  name: 'Gemini CLI',

  detect() {
    const { ok } = run('gemini', ['--version']);
    return ok;
  },

  skillsDir() {
    return null; // Gemini uses GEMINI.md, not a skills directory
  },

  /**
   * Path to the global GEMINI.md instructions file.
   */
  agentsMdPath() {
    return join(homedir(), '.gemini', 'GEMINI.md');
  },

  writeMcp(token) {
    // Remove first to avoid "already exists" errors
    run('gemini', ['mcp', 'remove', MCP_KEY]);

    const { ok, stderr } = run('gemini', [
      'mcp', 'add',
      '--transport', 'http',
      '-H', `Authorization: Bearer ${token}`,
      MCP_KEY,
      MCP_URL,
    ]);

    if (!ok) {
      // Fallback: write to ~/.gemini/settings.json directly
      return this._writeSettingsJson(token);
    }
    return { ok: true, message: 'configured via gemini mcp add' };
  },

  /**
   * Fallback: write directly to ~/.gemini/settings.json.
   */
  _writeSettingsJson(token) {
    try {
      const configPath = join(homedir(), '.gemini', 'settings.json');
      let config = {};
      if (existsSync(configPath)) {
        try {
          config = JSON.parse(readFileSync(configPath, 'utf8'));
        } catch { /* start fresh */ }
      }
      if (!config.mcpServers) config.mcpServers = {};
      config.mcpServers[MCP_KEY] = {
        httpUrl: MCP_URL,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      };
      atomicWriteFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
      return { ok: true, message: `configured in ${configPath}` };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  },

  removeMcp() {
    const { ok } = run('gemini', ['mcp', 'remove', MCP_KEY]);
    if (!ok) {
      // Fallback: remove from settings.json
      try {
        const configPath = join(homedir(), '.gemini', 'settings.json');
        if (!existsSync(configPath)) return { ok: true, message: 'nothing to remove' };
        const config = JSON.parse(readFileSync(configPath, 'utf8'));
        if (config.mcpServers) delete config.mcpServers[MCP_KEY];
        atomicWriteFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
        return { ok: true, message: 'removed from settings.json' };
      } catch (err) {
        return { ok: false, message: err.message };
      }
    }
    return { ok: true, message: 'removed via gemini mcp remove' };
  },

  hasMcp() {
    const configPath = join(homedir(), '.gemini', 'settings.json');
    if (!existsSync(configPath)) return false;
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      return !!(config.mcpServers && config.mcpServers[MCP_KEY]);
    } catch {
      return false;
    }
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** @type {Array} */
export const ALL_AGENTS = [claudeCode, cursor, codex, windsurf, geminiCli];

/**
 * Return detected agents, optionally filtered by id.
 *
 * @param {string[]|undefined} filter
 * @returns {Array}
 */
export function detectAgents(filter) {
  return ALL_AGENTS.filter((agent) => {
    if (filter && filter.length > 0 && !filter.includes(agent.id)) return false;
    return agent.detect();
  });
}

/**
 * Return all agents matching the filter (regardless of detection).
 *
 * @param {string[]|undefined} filter
 * @returns {Array}
 */
export function getAgents(filter) {
  if (!filter || filter.length === 0) return ALL_AGENTS;
  return ALL_AGENTS.filter((a) => filter.includes(a.id));
}
