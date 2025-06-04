#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runTest(testFile: string): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(`\n🧪 Running ${testFile}...`);
    console.log("=" .repeat(60));
    
    const child = spawn('node', [join('build', 'scenarios', testFile)], {
      stdio: 'inherit',
      cwd: __dirname
    });
    
    child.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

async function main() {
  console.log("🗄️ CRM Database Management Tests");
  console.log("=" .repeat(60));
  
  try {
    const success = await runTest('database-management.test.js');
    
    if (success) {
      console.log("\n🎉 Database Management Tests completed successfully!");
      process.exit(0);
    } else {
      console.log("\n💥 Database Management Tests failed!");
      process.exit(1);
    }
    
  } catch (error) {
    console.error("💥 Test execution failed:", error);
    process.exit(1);
  }
}

main(); 