/**
 * credentials.js
 *
 * Resolves the Timbal API token from (in priority order):
 *   1. Explicit --token CLI flag (passed in as argument)
 *   2. TIMBAL_API_KEY environment variable
 *   3. TIMBAL_API_TOKEN environment variable
 *   4. ~/.timbal/credentials INI file, using TIMBAL_PROFILE env or --profile flag
 *      (defaults to [default] section)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Parse a simple INI file into a nested object.
 * Supports [section] headers and key=value pairs.
 * Ignores blank lines and lines starting with # or ;.
 *
 * @param {string} content - raw INI file content
 * @returns {Record<string, Record<string, string>>}
 */
export function parseIni(content) {
  const result = {};
  let currentSection = '__default__';

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#') || line.startsWith(';')) {
      continue;
    }

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      if (!result[currentSection]) result[currentSection] = {};
      continue;
    }

    const eqIndex = line.indexOf('=');
    if (eqIndex !== -1) {
      const key = line.slice(0, eqIndex).trim();
      const value = line.slice(eqIndex + 1).trim();
      if (!result[currentSection]) result[currentSection] = {};
      result[currentSection][key] = value;
    }
  }

  return result;
}

/**
 * Read ~/.timbal/credentials and return the parsed sections.
 * Returns an empty object if the file does not exist.
 *
 * @returns {Record<string, Record<string, string>>}
 */
export function readCredentialsFile() {
  const credPath = join(homedir(), '.timbal', 'credentials');
  if (!existsSync(credPath)) return {};
  try {
    const content = readFileSync(credPath, 'utf8');
    return parseIni(content);
  } catch {
    return {};
  }
}

/**
 * Resolve the Timbal API token.
 *
 * @param {object} opts
 * @param {string|undefined} opts.token   - value of --token flag
 * @param {string|undefined} opts.profile - value of --profile flag (default: "default")
 * @returns {{ token: string, source: string } | { token: null, source: null }}
 */
export function resolveToken({ token, profile } = {}) {
  // 1. Explicit --token flag
  if (token) {
    return { token, source: '--token flag' };
  }

  // 2. TIMBAL_API_KEY env var
  if (process.env.TIMBAL_API_KEY) {
    return { token: process.env.TIMBAL_API_KEY, source: 'TIMBAL_API_KEY env var' };
  }

  // 3. TIMBAL_API_TOKEN env var
  if (process.env.TIMBAL_API_TOKEN) {
    return { token: process.env.TIMBAL_API_TOKEN, source: 'TIMBAL_API_TOKEN env var' };
  }

  // 4. ~/.timbal/credentials INI file
  const activeProfile = profile || process.env.TIMBAL_PROFILE || 'default';
  const sections = readCredentialsFile();
  const section = sections[activeProfile];

  if (section) {
    const tok = section.token || section.api_key || section.api_token;
    if (tok) {
      return {
        token: tok,
        source: `~/.timbal/credentials (profile: ${activeProfile})`,
      };
    }
  }

  return { token: null, source: null };
}
