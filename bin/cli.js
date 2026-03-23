#!/usr/bin/env node

/**
 * @timbal-ai/timbal-setup CLI
 *
 * Usage:
 *   npx @timbal-ai/timbal-setup [options]
 *
 * Options:
 *   --token <value>      Explicit Timbal API token
 *   --profile <name>     Profile from ~/.timbal/credentials (default: "default")
 *   --agent <name>       Target specific agent (can be passed multiple times)
 *   --scope global|project  global (default) or project-local config
 *   --uninstall          Remove all timbal config
 *   --status             Show what's currently installed
 *   --force              Allow downgrade / force reinstall of skills
 */

import { resolveToken } from '../lib/credentials.js';
import { ALL_AGENTS, detectAgents, getAgents } from '../lib/agents.js';
import { writeMcpConfig, removeMcpConfig, hasMcpConfig } from '../lib/mcp.js';
import { installSkills, uninstallSkills, readInstalledVersion } from '../lib/skills.js';
import { logSuccess, logError, logInfo, logHeader, logFooter, PACKAGE_VERSION } from '../lib/utils.js';

// ---------------------------------------------------------------------------
// Argument parsing (no external deps — hand-rolled)
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = argv.slice(2); // strip "node" and script path
  const opts = {
    token: undefined,
    profile: undefined,
    agents: [],
    scope: 'global',
    uninstall: false,
    status: false,
    force: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--token':
        opts.token = args[++i];
        break;
      case '--profile':
        opts.profile = args[++i];
        break;
      case '--agent':
        opts.agents.push(args[++i]);
        break;
      case '--scope':
        opts.scope = args[++i];
        break;
      case '--uninstall':
        opts.uninstall = true;
        break;
      case '--status':
        opts.status = true;
        break;
      case '--force':
        opts.force = true;
        break;
      default:
        if (arg.startsWith('--token=')) opts.token = arg.slice('--token='.length);
        else if (arg.startsWith('--profile=')) opts.profile = arg.slice('--profile='.length);
        else if (arg.startsWith('--agent=')) opts.agents.push(arg.slice('--agent='.length));
        else if (arg.startsWith('--scope=')) opts.scope = arg.slice('--scope='.length);
        else {
          console.error(`  Unknown flag: ${arg}`);
          process.exit(1);
        }
    }
  }

  return opts;
}

// ---------------------------------------------------------------------------
// --status
// ---------------------------------------------------------------------------

function runStatus(agentFilter) {
  logHeader();
  console.log('  Installed components:\n');

  for (const agent of getAgents(agentFilter)) {
    const detected = agent.detect();
    if (!detected) {
      logError(`${agent.name} — not detected`);
      continue;
    }

    const mcpInstalled = hasMcpConfig(agent.settingsFile());
    const skillVersion = readInstalledVersion(agent.skillsDir());

    if (mcpInstalled) {
      logSuccess(`${agent.name} — MCP server configured (${agent.settingsFile()})`);
    } else {
      logError(`${agent.name} — MCP server NOT configured`);
    }

    if (skillVersion) {
      logSuccess(`${agent.name} — Skills installed at ${agent.skillsDir()} (v${skillVersion})`);
    } else {
      logError(`${agent.name} — Skills NOT installed`);
    }
  }

  console.log('');
}

// ---------------------------------------------------------------------------
// --uninstall
// ---------------------------------------------------------------------------

function runUninstall(agentFilter) {
  logHeader();

  for (const agent of getAgents(agentFilter)) {
    const detected = agent.detect();
    if (!detected) {
      logError(`${agent.name} — not detected, skipping`);
      continue;
    }

    removeMcpConfig(agent.settingsFile());
    logSuccess(`${agent.name} — MCP server entry removed from ${agent.settingsFile()}`);

    const removed = uninstallSkills(agent.skillsDir());
    if (removed) {
      logSuccess(`${agent.name} — Skills removed from ${agent.skillsDir()}`);
    } else {
      logInfo(`${agent.name} — Skills directory was not present`);
    }
  }

  logFooter();
}

// ---------------------------------------------------------------------------
// Default: install / configure
// ---------------------------------------------------------------------------

function runInstall(opts) {
  logHeader();

  // Token resolution
  const { token, source } = resolveToken({ token: opts.token, profile: opts.profile });

  if (!token) {
    logError('No Timbal API key found.\n');
    console.log('  Set it up in one of these ways:');
    console.log('    1. Run: timbal configure');
    console.log('    2. Set env var: export TIMBAL_API_KEY=t2_xxx');
    console.log('    3. Pass directly: npx @timbal-ai/timbal-setup --token t2_xxx\n');
    process.exit(1);
  }

  logSuccess(`Token found via ${source}`);

  // Agent configuration
  const detected = detectAgents(opts.agents.length > 0 ? opts.agents : undefined);
  const all = getAgents(opts.agents.length > 0 ? opts.agents : undefined);

  for (const agent of all) {
    if (!agent.detect()) {
      logError(`${agent.name} — not detected, skipping`);
      continue;
    }

    // Write MCP config
    writeMcpConfig(agent.settingsFile(), token);
    logSuccess(`${agent.name} — MCP server configured in ${agent.settingsFile()}`);

    // Install skills
    const result = installSkills(agent.skillsDir(), { force: opts.force });
    if (result.action === 'skipped') {
      logInfo(
        `${agent.name} — Skills already up to date at ${agent.skillsDir()} (v${result.toVersion})`
      );
    } else if (result.action === 'updated') {
      logSuccess(
        `${agent.name} — Skills updated at ${agent.skillsDir()} ` +
          `(v${result.fromVersion} → v${result.toVersion})`
      );
    } else {
      logSuccess(
        `${agent.name} — Skills installed to ${agent.skillsDir()} (v${result.toVersion})`
      );
    }
  }

  logFooter();
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const opts = parseArgs(process.argv);

if (opts.status) {
  runStatus(opts.agents.length > 0 ? opts.agents : undefined);
} else if (opts.uninstall) {
  runUninstall(opts.agents.length > 0 ? opts.agents : undefined);
} else {
  runInstall(opts);
}
