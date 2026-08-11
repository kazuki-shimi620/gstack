#!/usr/bin/env node

import { getErrorDetails } from '@gstack/core';

import { formatErrorHuman } from './formatters.js';
import { createProgram } from './program.js';

createProgram()
  .parseAsync(process.argv)
  .catch((error: unknown) => {
    process.stderr.write(`${formatErrorHuman(getErrorDetails(error))}\n`);
    process.exitCode = 1;
  });
