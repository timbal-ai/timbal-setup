/**
 * mcp.js
 *
 * Read-modify-write the MCP server configuration for a given agent.
 * Never clobbers existing mcpServers entries — only merges the "timbal" key.
 */

import { readFileSync, existsSync } from 'node:fs';
import { atomicWriteFileSync } from './utils.js';

const MCP_KEY = 'timbal';
const MCP_URL = 'https://api.timbal.ai/mcp';

/**
 * Build the timbal MCP server entry.
 *
 * @param {string} token
 * @returns {object}
 */
export function buildMcpEntry(token) {
  return {
    url: MCP_URL,
    type: 'http',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
}

/**
 * Read the current settings JSON from disk.
 * Returns an empty object if the file does not exist or is not valid JSON.
 *
 * @param {string} settingsPath
 * @returns {object}
 */
export function readSettings(settingsPath) {
  if (!existsSync(settingsPath)) return {};
  try {
    const raw = readFileSync(settingsPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Merge the timbal MCP entry into a settings object (non-destructive).
 *
 * @param {object} settings - existing settings object (mutated in place)
 * @param {string} token
 * @returns {object} the mutated settings object
 */
export function mergeTimbalMcp(settings, token) {
  if (!settings.mcpServers) {
    settings.mcpServers = {};
  }
  settings.mcpServers[MCP_KEY] = buildMcpEntry(token);
  return settings;
}

/**
 * Remove the timbal MCP entry from a settings object.
 *
 * @param {object} settings
 * @returns {object}
 */
export function removeTimbalMcp(settings) {
  if (settings.mcpServers) {
    delete settings.mcpServers[MCP_KEY];
  }
  return settings;
}

/**
 * Write the MCP config for a given agent's settings file.
 *
 * @param {string} settingsPath - absolute path to settings.json
 * @param {string} token
 */
export function writeMcpConfig(settingsPath, token) {
  const settings = readSettings(settingsPath);
  mergeTimbalMcp(settings, token);
  atomicWriteFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

/**
 * Remove the MCP config for a given agent's settings file.
 *
 * @param {string} settingsPath - absolute path to settings.json
 */
export function removeMcpConfig(settingsPath) {
  if (!existsSync(settingsPath)) return;
  const settings = readSettings(settingsPath);
  removeTimbalMcp(settings);
  atomicWriteFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

/**
 * Check whether the timbal MCP entry exists in a settings file.
 *
 * @param {string} settingsPath
 * @returns {boolean}
 */
export function hasMcpConfig(settingsPath) {
  const settings = readSettings(settingsPath);
  return !!(settings.mcpServers && settings.mcpServers[MCP_KEY]);
}
