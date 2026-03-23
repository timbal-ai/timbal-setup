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
import { installSkills, uninstallSkills, readInstalledVersion, installAgentsMd, uninstallAgentsMd, hasAgentsMd } from '../lib/skills.js';
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

    const mcpInstalled = agent.hasMcp();

    if (mcpInstalled) {
      logSuccess(`${agent.name} — MCP server configured`);
    } else {
      logError(`${agent.name} — MCP server NOT configured`);
    }

    if (agent.skillsDir()) {
      const skillVersion = readInstalledVersion(agent.skillsDir());
      if (skillVersion) {
        logSuccess(`${agent.name} — Skills installed at ${agent.skillsDir()} (v${skillVersion})`);
      } else {
        logError(`${agent.name} — Skills NOT installed`);
      }
    }

    if (agent.agentsMdPath) {
      if (hasAgentsMd(agent.agentsMdPath())) {
        logSuccess(`${agent.name} — AGENTS.md configured at ${agent.agentsMdPath()}`);
      } else {
        logError(`${agent.name} — AGENTS.md NOT configured`);
      }
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

    const removeResult = agent.removeMcp();
    if (removeResult.ok) {
      logSuccess(`${agent.name} — MCP server removed`);
    } else {
      logError(`${agent.name} — Failed to remove MCP server: ${removeResult.message}`);
    }

    if (agent.skillsDir()) {
      const removed = uninstallSkills(agent.skillsDir());
      if (removed) {
        logSuccess(`${agent.name} — Skills removed from ${agent.skillsDir()}`);
      } else {
        logInfo(`${agent.name} — Skills directory was not present`);
      }
    }

    if (agent.agentsMdPath) {
      const removed = uninstallAgentsMd(agent.agentsMdPath());
      if (removed) {
        logSuccess(`${agent.name} — AGENTS.md section removed from ${agent.agentsMdPath()}`);
      } else {
        logInfo(`${agent.name} — AGENTS.md section was not present`);
      }
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
  const all = getAgents(opts.agents.length > 0 ? opts.agents : undefined);

  for (const agent of all) {
    if (!agent.detect()) {
      logError(`${agent.name} — not detected, skipping`);
      continue;
    }

    // Write MCP config
    const mcpResult = agent.writeMcp(token);
    if (mcpResult.ok) {
      logSuccess(`${agent.name} — MCP server configured`);
    } else {
      logError(`${agent.name} — Failed to configure MCP server: ${mcpResult.message}`);
      continue;
    }

    // Install skills (only if the agent supports a skills directory)
    if (agent.skillsDir()) {
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

    // Install AGENTS.md (for Codex and similar tools)
    if (agent.agentsMdPath) {
      const result = installAgentsMd(agent.agentsMdPath());
      if (result.action === 'updated') {
        logSuccess(`${agent.name} — AGENTS.md updated at ${agent.agentsMdPath()}`);
      } else {
        logSuccess(`${agent.name} — AGENTS.md installed at ${agent.agentsMdPath()}`);
      }
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
