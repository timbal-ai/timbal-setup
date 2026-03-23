/**
 * agents.test.js
 *
 * Tests for lib/agents.js using Node's built-in test runner.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_AGENTS, detectAgents, getAgents } from '../lib/agents.js';

describe('ALL_AGENTS', () => {
  test('includes all expected agent entries', () => {
    const ids = ALL_AGENTS.map((a) => a.id);
    for (const expected of ['claude-code', 'cursor', 'codex', 'windsurf', 'gemini-cli']) {
      assert.ok(ids.includes(expected), `should have ${expected} agent`);
    }
  });

  test('every agent has required fields', () => {
    for (const agent of ALL_AGENTS) {
      assert.ok(typeof agent.id === 'string', `${agent.id}: id must be string`);
      assert.ok(typeof agent.name === 'string', `${agent.id}: name must be string`);
      assert.ok(typeof agent.detect === 'function', `${agent.id}: detect must be function`);
      assert.ok(typeof agent.writeMcp === 'function', `${agent.id}: writeMcp must be function`);
      assert.ok(typeof agent.removeMcp === 'function', `${agent.id}: removeMcp must be function`);
      assert.ok(typeof agent.hasMcp === 'function', `${agent.id}: hasMcp must be function`);
      assert.ok(typeof agent.skillsDir === 'function', `${agent.id}: skillsDir must be function`);
    }
  });

  test('detect() returns a boolean', () => {
    for (const agent of ALL_AGENTS) {
      const result = agent.detect();
      assert.ok(typeof result === 'boolean', `${agent.id}: detect() should return boolean`);
    }
  });

  test('hasMcp() returns a boolean', () => {
    for (const agent of ALL_AGENTS) {
      const result = agent.hasMcp();
      assert.ok(typeof result === 'boolean', `${agent.id}: hasMcp() should return boolean`);
    }
  });

  test('claude-code skillsDir returns path containing timbal', () => {
    const agent = ALL_AGENTS.find((a) => a.id === 'claude-code');
    assert.ok(agent.skillsDir().includes('timbal'));
  });

  test('cursor skillsDir returns path containing .cursor/skills/timbal', () => {
    const agent = ALL_AGENTS.find((a) => a.id === 'cursor');
    const dir = agent.skillsDir();
    assert.ok(dir.includes('.cursor'));
    assert.ok(dir.includes('skills'));
    assert.ok(dir.includes('timbal'));
  });

  test('codex skillsDir returns null', () => {
    const agent = ALL_AGENTS.find((a) => a.id === 'codex');
    assert.equal(agent.skillsDir(), null);
  });

  test('codex has agentsMdPath method', () => {
    const agent = ALL_AGENTS.find((a) => a.id === 'codex');
    assert.ok(typeof agent.agentsMdPath === 'function');
    assert.ok(agent.agentsMdPath().endsWith('AGENTS.md'));
  });

  test('windsurf skillsDir returns null', () => {
    const agent = ALL_AGENTS.find((a) => a.id === 'windsurf');
    assert.equal(agent.skillsDir(), null);
  });

  test('gemini-cli has agentsMdPath pointing to GEMINI.md', () => {
    const agent = ALL_AGENTS.find((a) => a.id === 'gemini-cli');
    assert.ok(typeof agent.agentsMdPath === 'function');
    assert.ok(agent.agentsMdPath().endsWith('GEMINI.md'));
  });

  test('gemini-cli skillsDir returns null', () => {
    const agent = ALL_AGENTS.find((a) => a.id === 'gemini-cli');
    assert.equal(agent.skillsDir(), null);
  });
});

describe('getAgents', () => {
  test('returns all agents when no filter provided', () => {
    const agents = getAgents(undefined);
    assert.equal(agents.length, ALL_AGENTS.length);
  });

  test('returns all agents when empty filter array provided', () => {
    const agents = getAgents([]);
    assert.equal(agents.length, ALL_AGENTS.length);
  });

  test('filters to matching agents', () => {
    for (const id of ['claude-code', 'cursor', 'codex']) {
      const agents = getAgents([id]);
      assert.equal(agents.length, 1);
      assert.equal(agents[0].id, id);
    }
  });

  test('returns empty array for unknown agent id', () => {
    const agents = getAgents(['nonexistent-agent']);
    assert.equal(agents.length, 0);
  });
});

describe('detectAgents', () => {
  test('returns an array', () => {
    const agents = detectAgents(undefined);
    assert.ok(Array.isArray(agents));
  });

  test('only returns agents that pass detect()', () => {
    const agents = detectAgents(undefined);
    for (const agent of agents) {
      assert.ok(agent.detect(), `${agent.id} should have passed detection`);
    }
  });

  test('respects filter — unknown agent id returns empty array', () => {
    const agents = detectAgents(['nonexistent-agent-xyz']);
    assert.equal(agents.length, 0);
  });
});
