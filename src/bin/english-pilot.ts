#!/usr/bin/env node
import { runCliFromProcess } from '../adapters/cli.js';

runCliFromProcess().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
