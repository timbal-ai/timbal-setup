/**
 * agents.js
 *
 * Agent detection and configuration path resolution.
 * Phase 1: Claude Code only.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * @typedef {object} AgentDescriptor
 * @property {string} id             - internal identifier (e.g. "claude-code")
 * @property {string} name           - display name (e.g. "Claude Code")
 * @property {() => boolean} detect  - returns true if the agent is installed
 * @property {() => string} configDir - path to the agent's config directory
 * @property {() => string} settingsFile - path to the agent's settings JSON file
 * @property {() => string} skillsDir - path where skill files should be installed
 */

/** @type {AgentDescriptor[]} */
export const ALL_AGENTS = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    detect() {
      return existsSync(join(homedir(), '.claude'));
    },
    configDir() {
      return join(homedir(), '.claude');
    },
    settingsFile() {
      return join(homedir(), '.claude.json');
    },
    skillsDir() {
      return join(homedir(), '.claude', 'skills', 'timbal');
    },
  },
];

/**
 * Return the subset of ALL_AGENTS that are currently detected as installed.
 *
 * @param {string[]|undefined} filter - if provided, only return agents whose id is in this list
 * @returns {AgentDescriptor[]}
 */
export function detectAgents(filter) {
  return ALL_AGENTS.filter((agent) => {
    if (filter && filter.length > 0 && !filter.includes(agent.id)) {
      return false;
    }
    return agent.detect();
  });
}

/**
 * Return all agents matching the filter, regardless of detection result.
 * Used for --status and --uninstall to report on all known agents.
 *
 * @param {string[]|undefined} filter
 * @returns {AgentDescriptor[]}
 */
export function getAgents(filter) {
  if (!filter || filter.length === 0) return ALL_AGENTS;
  return ALL_AGENTS.filter((a) => filter.includes(a.id));
}
