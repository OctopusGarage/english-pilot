#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdirSync, watch, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repo = process.cwd();
const srcDir = join(repo, 'src');
const cliPath = join(repo, 'dist', 'src', 'bin', 'english-pilot.js');
const statusPath = join(process.env.ENGLISH_PILOT_HOME ?? join(process.env.HOME ?? repo, '.english-pilot'), 'run', 'dev-supervisor.json');
const debounceMs = Number.parseInt(process.env.ENGLISH_PILOT_DEV_RELOAD_DEBOUNCE_MS ?? '300', 10);

let child;
let timer;
let running = false;
let pending = false;
let stoppingForReload = false;
let watcher;

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

log('dev supervisor starting');
await rebuildAndRestart('initial');
watchSource();

function watchSource() {
  watcher = watch(srcDir, { recursive: true }, (_event, file) => {
    if (!file || !shouldReload(String(file))) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      pending = true;
      void drainReloads(String(file));
    }, Number.isFinite(debounceMs) ? debounceMs : 300);
  });
}

async function drainReloads(reason) {
  if (running) return;
  while (pending) {
    pending = false;
    running = true;
    try {
      await rebuildAndRestart(reason);
    } finally {
      running = false;
    }
  }
}

async function rebuildAndRestart(reason) {
  writeStatus({ state: 'building', reason });
  const code = await runBuild();
  if (code !== 0) {
    writeStatus({ state: 'build-failed', reason, lastError: `npm run build exited ${code}` });
    log(`build failed; keeping last-good daemon (exit ${code})`);
    return;
  }

  await stopChild();
  startChild();
  writeStatus({ state: 'running', reason, lastReloadAt: new Date().toISOString() });
  log(`daemon reloaded after clean build (${reason})`);
}

function runBuild() {
  return new Promise((resolve) => {
    const build = spawn('npm', ['run', 'build'], {
      cwd: repo,
      env: process.env,
      stdio: 'inherit',
    });
    build.once('error', (error) => {
      log(`build spawn failed: ${error.message}`);
      resolve(1);
    });
    build.once('exit', (code) => resolve(code ?? 1));
  });
}

function startChild() {
  child = spawn(process.execPath, [cliPath, 'run'], {
    cwd: repo,
    env: process.env,
    stdio: 'inherit',
  });
  child.once('error', (error) => {
    log(`daemon spawn failed: ${error.message}`);
  });
  child.once('exit', (code, signal) => {
    const expected = stoppingForReload;
    child = undefined;
    if (expected) return;
    writeStatus({ state: 'daemon-exited', lastError: `daemon exited code=${code ?? 'null'} signal=${signal ?? 'null'}` });
    log(`daemon exited unexpectedly code=${code ?? 'null'} signal=${signal ?? 'null'}`);
    process.exitCode = code ?? 1;
    watcher?.close();
  });
}

function stopChild() {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) {
      child = undefined;
      resolve();
      return;
    }
    const current = child;
    stoppingForReload = true;
    const killTimer = setTimeout(() => current.kill('SIGKILL'), 10_000);
    current.once('exit', () => {
      clearTimeout(killTimer);
      stoppingForReload = false;
      if (child === current) child = undefined;
      resolve();
    });
    current.kill('SIGTERM');
  });
}

async function shutdown(signal) {
  log(`dev supervisor received ${signal}; shutting down`);
  watcher?.close();
  if (timer) clearTimeout(timer);
  await stopChild();
  process.exit(0);
}

function shouldReload(file) {
  return /\.(ts|mts|cts)$/.test(file) && !/\.test\.(ts|mts|cts)$/.test(file);
}

function writeStatus(status) {
  try {
    mkdirSync(join(statusPath, '..'), { recursive: true });
    writeFileSync(statusPath, `${JSON.stringify({ ...status, updatedAt: new Date().toISOString() }, null, 2)}\n`);
  } catch {
    // Status is diagnostic only; never let it take down the managed service.
  }
}

function log(message) {
  console.log(`[english-pilot-dev] ${message}`);
}
