/**
 * skills.js
 *
 * Copy bundled skill files to the agent's skills directory.
 * Tracks the installed version via a .version file.
 * On re-run, only updates if the package version is newer (or --force).
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  copyFileSync,
  rmSync,
} from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWriteFileSync, PACKAGE_VERSION } from './utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Absolute path to the bundled skill/ directory (sibling of lib/) */
export const BUNDLED_SKILL_DIR = join(__dirname, '..', 'skill');

/** Name of the version tracking file inside the skills directory */
const VERSION_FILE = '.version';

/**
 * Read the installed version from the skills directory.
 *
 * @param {string} skillsDir
 * @returns {string|null}
 */
export function readInstalledVersion(skillsDir) {
  const versionPath = join(skillsDir, VERSION_FILE);
  if (!existsSync(versionPath)) return null;
  try {
    return readFileSync(versionPath, 'utf8').trim();
  } catch {
    return null;
  }
}

/**
 * Compare two semver strings.
 * Returns:
 *  1  if a > b
 *  0  if a === b
 * -1  if a < b
 *
 * @param {string} a
 * @param {string} b
 * @returns {1|0|-1}
 */
export function compareSemver(a, b) {
  const parse = (v) => v.split('.').map(Number);
  const [aMajor, aMinor, aPatch] = parse(a);
  const [bMajor, bMinor, bPatch] = parse(b);
  if (aMajor !== bMajor) return aMajor > bMajor ? 1 : -1;
  if (aMinor !== bMinor) return aMinor > bMinor ? 1 : -1;
  if (aPatch !== bPatch) return aPatch > bPatch ? 1 : -1;
  return 0;
}

/**
 * Recursively copy all files from src to dst.
 *
 * @param {string} src
 * @param {string} dst
 */
function copyDirSync(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const dstPath = join(dst, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDirSync(srcPath, dstPath);
    } else {
      copyFileSync(srcPath, dstPath);
    }
  }
}

/**
 * Install skill files to the target directory.
 *
 * @param {string} skillsDir - absolute path to the agent's timbal skills dir
 * @param {object} opts
 * @param {boolean} [opts.force] - install even if version is the same or older
 * @returns {{ action: 'installed'|'updated'|'skipped', fromVersion: string|null, toVersion: string }}
 */
export function installSkills(skillsDir, { force = false } = {}) {
  const installed = readInstalledVersion(skillsDir);
  const target = PACKAGE_VERSION;

  if (installed !== null && !force) {
    const cmp = compareSemver(target, installed);
    if (cmp <= 0) {
      return { action: 'skipped', fromVersion: installed, toVersion: target };
    }
  }

  const action = installed === null ? 'installed' : 'updated';

  copyDirSync(BUNDLED_SKILL_DIR, skillsDir);
  atomicWriteFileSync(join(skillsDir, VERSION_FILE), target + '\n');

  return { action, fromVersion: installed, toVersion: target };
}

/**
 * Remove the skill directory entirely.
 *
 * @param {string} skillsDir
 * @returns {boolean} true if the directory existed and was removed
 */
export function uninstallSkills(skillsDir) {
  if (!existsSync(skillsDir)) return false;
  rmSync(skillsDir, { recursive: true, force: true });
  return true;
}

// ---------------------------------------------------------------------------
// AGENTS.md support (for Codex and similar tools)
// ---------------------------------------------------------------------------

const AGENTS_MD_MARKER = '<!-- timbal-setup -->';

/**
 * Read the bundled SKILL.md, strip YAML frontmatter, and return as markdown.
 *
 * @returns {string}
 */
function readSkillContent() {
  const raw = readFileSync(join(BUNDLED_SKILL_DIR, 'SKILL.md'), 'utf8');
  // Strip YAML frontmatter (---\n...\n---)
  return raw.replace(/^---\n[\s\S]*?\n---\n*/, '').trim();
}

/**
 * Install the Timbal skill content into an AGENTS.md file.
 * Appends a marked section so it can be updated/removed later.
 *
 * @param {string} agentsMdPath - absolute path to AGENTS.md
 * @returns {{ action: 'installed'|'updated'|'skipped' }}
 */
export function installAgentsMd(agentsMdPath) {
  const skillContent = readSkillContent();
  const section = `\n\n${AGENTS_MD_MARKER}\n${skillContent}\n${AGENTS_MD_MARKER}\n`;

  let existing = '';
  if (existsSync(agentsMdPath)) {
    existing = readFileSync(agentsMdPath, 'utf8');
  }

  const markerRegex = new RegExp(
    `\\n*${AGENTS_MD_MARKER}\\n[\\s\\S]*?${AGENTS_MD_MARKER}\\n*`
  );

  if (markerRegex.test(existing)) {
    const updated = existing.replace(markerRegex, section);
    atomicWriteFileSync(agentsMdPath, updated);
    return { action: 'updated' };
  }

  atomicWriteFileSync(agentsMdPath, existing + section);
  return { action: 'installed' };
}

/**
 * Remove the Timbal section from an AGENTS.md file.
 *
 * @param {string} agentsMdPath
 * @returns {boolean} true if the section was found and removed
 */
export function uninstallAgentsMd(agentsMdPath) {
  if (!existsSync(agentsMdPath)) return false;

  const existing = readFileSync(agentsMdPath, 'utf8');
  const markerRegex = new RegExp(
    `\\n*${AGENTS_MD_MARKER}\\n[\\s\\S]*?${AGENTS_MD_MARKER}\\n*`
  );

  if (!markerRegex.test(existing)) return false;

  const cleaned = existing.replace(markerRegex, '\n').trim();
  if (cleaned.length === 0) {
    rmSync(agentsMdPath, { force: true });
  } else {
    atomicWriteFileSync(agentsMdPath, cleaned + '\n');
  }
  return true;
}

/**
 * Check if the Timbal section exists in an AGENTS.md file.
 *
 * @param {string} agentsMdPath
 * @returns {boolean}
 */
export function hasAgentsMd(agentsMdPath) {
  if (!existsSync(agentsMdPath)) return false;
  const content = readFileSync(agentsMdPath, 'utf8');
  return content.includes(AGENTS_MD_MARKER);
}
