#!/usr/bin/env node

import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function executeDbCommand(command: string, arg?: string): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve) => {
    let npmScript = '';
    switch (command) {
      case 'archive':
        npmScript = arg ? `npm run db:archive ${arg}` : 'npm run db:archive';
        break;
      case 'restore':
        npmScript = 'npm run db:restore'; // This should fail since we don't have this script
        break;
      default:
        // For invalid commands, compile and run manually
        const scriptPath = path.join(__dirname, '..', 'scripts', 'database-manager.ts');
        npmScript = `npx tsc ${scriptPath} --outDir build/scripts --target ES2022 --module Node16 --moduleResolution Node16 && node build/scripts/database-manager.js ${command}`;
        if (arg) {
          npmScript += ` ${arg}`;
        }
        break;
    }

    console.log(`Executing: ${npmScript}`);

    const child = spawn('sh', ['-c', npmScript], {
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
      resolve({
        output: output + errorOutput,
        exitCode: code || 0
      });
    });
  });
}

async function testArchive() {
  console.log("🧪 Testing Archive Command");
  console.log("=" .repeat(50));
  
  const archiveDir = path.join(__dirname, '..', 'data', 'archives');
  console.log(`Archive directory: ${archiveDir}`);
  
  // Check what archives exist before
  if (fs.existsSync(archiveDir)) {
    const filesBefore = fs.readdirSync(archiveDir);
    console.log(`Files before: ${filesBefore.length}`);
    filesBefore.forEach(f => console.log(`  - ${f}`));
  } else {
    console.log("Archive directory doesn't exist yet");
  }
  
  const reason = "debug-test-archive";
  const result = await executeDbCommand('archive', reason);
  
  console.log(`\nExit code: ${result.exitCode}`);
  console.log(`Output: ${result.output.substring(0, 500)}...`);
  
  // Check what archives exist after
  if (fs.existsSync(archiveDir)) {
    const filesAfter = fs.readdirSync(archiveDir);
    console.log(`\nFiles after: ${filesAfter.length}`);
    filesAfter.forEach(f => console.log(`  - ${f}`));
    
    const archiveExists = filesAfter.some(file => 
      file.includes(reason) && file.endsWith('.sqlite')
    );
    console.log(`\nArchive with reason '${reason}' exists: ${archiveExists}`);
  }
  
  const success = result.exitCode === 0 && 
                 result.output.includes('📦 Database archived successfully!') &&
                 result.output.includes(reason) &&
                 result.output.includes('Location:');
  
  console.log(`\nTest conditions:`);
  console.log(`  Exit code 0: ${result.exitCode === 0}`);
  console.log(`  Has success message: ${result.output.includes('📦 Database archived successfully!')}`);
  console.log(`  Has reason: ${result.output.includes(reason)}`);
  console.log(`  Has location: ${result.output.includes('Location:')}`);
  console.log(`  Overall success: ${success}`);
}

async function testErrorHandling() {
  console.log("\n\n🧪 Testing Error Handling");
  console.log("=" .repeat(50));
  
  // Test invalid command
  console.log("Testing invalid command...");
  const invalidResult = await executeDbCommand('invalid-command');
  console.log(`Invalid command exit code: ${invalidResult.exitCode}`);
  console.log(`Invalid command output: ${invalidResult.output.substring(0, 300)}...`);
  
  const invalidCommandHandled = invalidResult.output.includes('🗄️ CRM Database Manager') &&
                               invalidResult.output.includes('Available commands:');
  console.log(`Invalid command handled correctly: ${invalidCommandHandled}`);
  
  // Test restore without argument - this will fail because we don't have npm run db:restore
  console.log("\nTesting restore without argument...");
  const restoreResult = await executeDbCommand('restore');
  console.log(`Restore exit code: ${restoreResult.exitCode}`);
  console.log(`Restore output: ${restoreResult.output.substring(0, 300)}...`);
  
  // Since we don't have npm run db:restore, this will fail differently than expected
  // Let's test the actual restore command directly
  console.log("\nTesting restore command directly...");
  const scriptPath = path.join(__dirname, '..', 'scripts', 'database-manager.ts');
  const directRestoreCmd = `npx tsc ${scriptPath} --outDir build/scripts --target ES2022 --module Node16 --moduleResolution Node16 && node build/scripts/database-manager.js restore`;
  
  const directRestoreResult = await new Promise<{ output: string; exitCode: number }>((resolve) => {
    const child = spawn('sh', ['-c', directRestoreCmd], {
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
      resolve({
        output: output + errorOutput,
        exitCode: code || 0
      });
    });
  });
  
  console.log(`Direct restore exit code: ${directRestoreResult.exitCode}`);
  console.log(`Direct restore output: ${directRestoreResult.output}`);
  
  const restoreErrorHandled = directRestoreResult.exitCode !== 0 &&
                             directRestoreResult.output.includes('❌ Please specify an archive name');
  console.log(`Restore error handled correctly: ${restoreErrorHandled}`);
}

async function main() {
  await testArchive();
  await testErrorHandling();
}

main(); 