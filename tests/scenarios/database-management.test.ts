#!/usr/bin/env node

import { TestReporter } from "../client/test-utilities.js";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DatabaseManagementTests {
  private reporter: TestReporter;
  private archiveDir: string;
  private testResults: Array<{testName: string; success: boolean}> = [];

  constructor() {
    this.reporter = new TestReporter();
    this.archiveDir = path.join(__dirname, '..', '..', 'data', 'archives');
  }

  /**
   * Execute a database management command
   */
  private async executeDbCommand(command: string, arg?: string): Promise<{ output: string; exitCode: number }> {
    return new Promise((resolve) => {
      let npmScript = '';
      switch (command) {
        case 'stats':
          npmScript = 'npm run db:stats';
          break;
        case 'archive':
          npmScript = arg ? `npm run db:archive ${arg}` : 'npm run db:archive';
          break;
        case 'list':
          npmScript = 'npm run db:list';
          break;
        case 'reset':
          npmScript = arg ? `npm run db:reset ${arg}` : 'npm run db:reset';
          break;
        case 'help':
          npmScript = 'npm run db:help';
          break;
        default:
          // For invalid commands, compile and run manually to test error handling
          const scriptPath = path.join(__dirname, '..', '..', '..', 'scripts', 'database-manager.ts');
          npmScript = `npx tsc ${scriptPath} --outDir build/scripts --target ES2022 --module Node16 --moduleResolution Node16 && node build/scripts/database-manager.js ${command}`;
          break;
      }

      const child = spawn('sh', ['-c', npmScript], {
        cwd: path.join(__dirname, '..', '..', '..'),
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

  /**
   * Test database statistics command
   */
  async testDatabaseStats(): Promise<void> {
    const startTime = Date.now();

    try {
      const result = await this.executeDbCommand('stats');

      const success = result.exitCode === 0 && 
                     result.output.includes('📊 Current Database Statistics') &&
                     result.output.includes('Contacts:') &&
                     result.output.includes('Entries:') &&
                     result.output.includes('Size:');

      this.testResults.push({ testName: "Database Statistics Command", success });

      const duration = Date.now() - startTime;
      this.reporter.addResult({
        testName: "Database Statistics Command",
        success,
        duration,
        timestamp: new Date(startTime).toISOString(),
        data: { 
          exitCode: result.exitCode,
          outputLength: result.output.length,
          hasStatsHeader: result.output.includes('📊 Current Database Statistics'),
          hasContactsCount: result.output.includes('Contacts:'),
          hasEntriesCount: result.output.includes('Entries:'),
          hasSize: result.output.includes('Size:')
        }
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      this.reporter.addResult({
        testName: "Database Statistics Command",
        success: false,
        duration,
        timestamp: new Date(startTime).toISOString(),
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Test database archiving command
   */
  async testDatabaseArchive(): Promise<void> {
    const startTime = Date.now();

    try {
      const reason = "formal-test-archive";
      const result = await this.executeDbCommand('archive', reason);

      const success = result.exitCode === 0 && 
                     result.output.includes('📦 Database archived successfully!') &&
                     result.output.includes(reason) &&
                     result.output.includes('Location:');

      // The archive is created in the project root data/archives
      // Check in the correct location by parsing the output
      const locationMatch = result.output.match(/Location: (.+\.sqlite)/);
      const archiveExists = locationMatch ? fs.existsSync(locationMatch[1]) : false;

      const finalSuccess = success && archiveExists;
      this.testResults.push({ testName: "Database Archive Command", success: finalSuccess });

      const duration = Date.now() - startTime;
      this.reporter.addResult({
        testName: "Database Archive Command",
        success: finalSuccess,
        duration,
        timestamp: new Date(startTime).toISOString(),
        data: { 
          exitCode: result.exitCode,
          hasSuccessMessage: result.output.includes('📦 Database archived successfully!'),
          hasReason: result.output.includes(reason),
          hasLocation: result.output.includes('Location:'),
          archiveFileExists: archiveExists
        }
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      this.reporter.addResult({
        testName: "Database Archive Command",
        success: false,
        duration,
        timestamp: new Date(startTime).toISOString(),
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Test database reset command
   */
  async testDatabaseReset(): Promise<void> {
    const startTime = Date.now();

    try {
      // Get stats before reset
      const statsBefore = await this.executeDbCommand('stats');
      
      const reason = "formal-test-reset";
      const result = await this.executeDbCommand('reset', reason);

      const success = result.exitCode === 0 && 
                     result.output.includes('🔄 Resetting CRM Database') &&
                     result.output.includes('📦 Database archived successfully!') &&
                     result.output.includes('🗑️ Current database removed') &&
                     result.output.includes('✅ Fresh database created with empty tables') &&
                     result.output.includes('🎉 Database reset complete!');

      // Verify database was reset by checking stats
      const statsAfter = await this.executeDbCommand('stats');
      const isReset = statsAfter.output.includes('Contacts: 0') && 
                     statsAfter.output.includes('Entries: 0');

      const finalSuccess = success && isReset;
      this.testResults.push({ testName: "Database Reset Command", success: finalSuccess });

      const duration = Date.now() - startTime;
      this.reporter.addResult({
        testName: "Database Reset Command",
        success: finalSuccess,
        duration,
        timestamp: new Date(startTime).toISOString(),
        data: { 
          exitCode: result.exitCode,
          hasResetHeader: result.output.includes('🔄 Resetting CRM Database'),
          hasArchiveMessage: result.output.includes('📦 Database archived successfully!'),
          hasRemovalMessage: result.output.includes('🗑️ Current database removed'),
          hasCreationMessage: result.output.includes('✅ Fresh database created'),
          hasCompletionMessage: result.output.includes('🎉 Database reset complete!'),
          databaseIsEmpty: isReset,
          statsBefore: statsBefore.output.substring(0, 200),
          statsAfter: statsAfter.output.substring(0, 200)
        }
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      this.reporter.addResult({
        testName: "Database Reset Command",
        success: false,
        duration,
        timestamp: new Date(startTime).toISOString(),
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Test database list archives command
   */
  async testListArchives(): Promise<void> {
    const startTime = Date.now();

    try {
      const result = await this.executeDbCommand('list');

      const success = result.exitCode === 0 && 
                     (result.output.includes('📦 Database Archives') || 
                      result.output.includes('📭 No archives found'));

      // Check if we have archives (should have some from previous tests)
      const hasArchives = result.output.includes('📦 Database Archives') &&
                         result.output.includes('📁 crm-backup-') &&
                         result.output.includes('Created:') &&
                         result.output.includes('Size:') &&
                         result.output.includes('Path:');

      this.testResults.push({ testName: "List Archives Command", success });

      const duration = Date.now() - startTime;
      this.reporter.addResult({
        testName: "List Archives Command",
        success,
        duration,
        timestamp: new Date(startTime).toISOString(),
        data: { 
          exitCode: result.exitCode,
          hasArchivesHeader: result.output.includes('📦 Database Archives'),
          hasNoArchivesMessage: result.output.includes('📭 No archives found'),
          hasArchiveEntries: hasArchives,
          outputLength: result.output.length
        }
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      this.reporter.addResult({
        testName: "List Archives Command",
        success: false,
        duration,
        timestamp: new Date(startTime).toISOString(),
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Test database help command
   */
  async testDatabaseHelp(): Promise<void> {
    const startTime = Date.now();

    try {
      const result = await this.executeDbCommand('help');

      const success = result.exitCode === 0 && 
                     result.output.includes('🗄️ CRM Database Manager') &&
                     result.output.includes('Available commands:') &&
                     result.output.includes('reset [reason]') &&
                     result.output.includes('archive [reason]') &&
                     result.output.includes('list') &&
                     result.output.includes('restore <name>') &&
                     result.output.includes('stats') &&
                     result.output.includes('Examples:');

      this.testResults.push({ testName: "Database Help Command", success });

      const duration = Date.now() - startTime;
      this.reporter.addResult({
        testName: "Database Help Command",
        success,
        duration,
        timestamp: new Date(startTime).toISOString(),
        data: { 
          exitCode: result.exitCode,
          hasHelpHeader: result.output.includes('🗄️ CRM Database Manager'),
          hasCommandsList: result.output.includes('Available commands:'),
          hasExamples: result.output.includes('Examples:'),
          hasAllCommands: ['reset', 'archive', 'list', 'restore', 'stats'].every(cmd => 
            result.output.includes(cmd)
          )
        }
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      this.reporter.addResult({
        testName: "Database Help Command",
        success: false,
        duration,
        timestamp: new Date(startTime).toISOString(),
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Test error handling for invalid commands
   */
  async testErrorHandling(): Promise<void> {
    const startTime = Date.now();

    try {
      // Test invalid command using direct script execution
      const scriptPath = path.join(__dirname, '..', '..', '..', 'scripts', 'database-manager.ts');
      const invalidCmd = `npx tsc ${scriptPath} --outDir build/scripts --target ES2022 --module Node16 --moduleResolution Node16 && node build/scripts/database-manager.js invalid-command`;
      
      const invalidResult = await new Promise<{ output: string; exitCode: number }>((resolve) => {
        const child = spawn('sh', ['-c', invalidCmd], {
          cwd: path.join(__dirname, '..', '..', '..'),
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
      
      // Test restore without argument using direct script execution
      const restoreCmd = `npx tsc ${scriptPath} --outDir build/scripts --target ES2022 --module Node16 --moduleResolution Node16 && node build/scripts/database-manager.js restore`;
      
      const restoreResult = await new Promise<{ output: string; exitCode: number }>((resolve) => {
        const child = spawn('sh', ['-c', restoreCmd], {
          cwd: path.join(__dirname, '..', '..', '..'),
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

      const invalidCommandHandled = invalidResult.output.includes('🗄️ CRM Database Manager') &&
                                   invalidResult.output.includes('Available commands:');

      const restoreErrorHandled = restoreResult.exitCode !== 0 &&
                                 restoreResult.output.includes('❌ Please specify an archive name');

      const success = invalidCommandHandled && restoreErrorHandled;

      this.testResults.push({ testName: "Error Handling", success });

      const duration = Date.now() - startTime;
      this.reporter.addResult({
        testName: "Error Handling",
        success,
        duration,
        timestamp: new Date(startTime).toISOString(),
        data: { 
          invalidCommandShowsHelp: invalidCommandHandled,
          restoreWithoutArgShowsError: restoreErrorHandled,
          restoreExitCode: restoreResult.exitCode
        }
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      this.reporter.addResult({
        testName: "Error Handling",
        success: false,
        duration,
        timestamp: new Date(startTime).toISOString(),
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Run all database management tests
   */
  async runTests(): Promise<void> {
    console.log("🧪 Starting Database Management Tests");
    console.log("=" .repeat(50));

    try {
      // D1: Basic Commands
      await this.testDatabaseStats();
      await this.testDatabaseHelp();
      
      // D2: Archive Operations
      await this.testDatabaseArchive();
      await this.testListArchives();
      
      // D3: Reset Operations
      await this.testDatabaseReset();
      
      // D4: Error Handling
      await this.testErrorHandling();
      
      console.log("\n" + "=" .repeat(50));
      console.log("📋 Database Management Test Results");
      console.log("=" .repeat(50));
      this.reporter.generateReport();
      
      const successCount = this.testResults.filter(r => r.success).length;
      const totalCount = this.testResults.length;
      
      if (successCount === totalCount) {
        console.log(`\n🎉 All ${totalCount} database management tests passed!`);
      } else {
        console.log(`\n⚠️ ${successCount}/${totalCount} database management tests passed`);
        process.exit(1);
      }
      
    } catch (error) {
      console.error("\n💥 Database Management tests failed:", error);
      process.exit(1);
    }
  }
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tests = new DatabaseManagementTests();
  tests.runTests()
    .then(() => {
      console.log("\n✅ Database Management tests completed successfully");
    })
    .catch((error) => {
      console.error("\n💥 Database Management tests failed:", error);
      process.exit(1);
    });
} 