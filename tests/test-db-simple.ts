#!/usr/bin/env node

import { spawn } from "child_process";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function executeDbCommand(command: string, arg?: string): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'database-manager.ts');
    const args = ['npx', 'tsc', scriptPath, '--outDir', 'build/scripts', '--target', 'ES2022', '--module', 'Node16', '--moduleResolution', 'Node16', '&&', 'node', 'build/scripts/database-manager.js', command];
    
    if (arg) {
      args.push(arg);
    }

    console.log(`Running: ${args.join(' ')}`);

    const child = spawn('sh', ['-c', args.join(' ')], {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe'
    });

    let output = '';
    let errorOutput = '';

    child.stdout?.on('data', (data) => {
      output += data.toString();
    });

    child.stderr?.on('data', (data) => {
      errorOutput += data.toString();
    });

    child.on('close', (code) => {
      console.log(`Exit code: ${code}`);
      console.log(`Output: ${output}`);
      console.log(`Error: ${errorOutput}`);
      resolve({
        output: output + errorOutput,
        exitCode: code || 0
      });
    });
  });
}

async function testDbStats() {
  console.log("Testing database stats...");
  const result = await executeDbCommand('stats');
  console.log("Result:", result);
}

testDbStats(); 