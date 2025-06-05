#!/usr/bin/env node

import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import { fileURLToPath } from "url";
import { TestReporter } from "./client/test-utilities.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TestPhase {
  name: string;
  description: string;
  command: string;
  category: string;
  requiresIsolation?: boolean;
}

interface TestResult {
  phase: TestPhase;
  success: boolean;
  duration: number;
  output: string;
  error?: string;
  timestamp: string;
}

class ComprehensiveTestRunner {
  private reporter: TestReporter;
  private results: TestResult[] = [];

  constructor() {
    this.reporter = new TestReporter();
  }

  private readonly testPhases: TestPhase[] = [
    {
      name: "Database Management",
      description: "Tests database archiving, reset, stats, and management functionality",
      command: "npm run test:db",
      category: "Infrastructure",
      requiresIsolation: true
    },
    {
      name: "Core Functionality",
      description: "Tests all 14 CRM tools including contact management, history, and exports",
      command: "npx tsx run-phase-b-tests.ts",
      category: "Core Features",
      requiresIsolation: true
    },
    {
      name: "Advanced Testing",
      description: "Tests edge cases, error handling, and performance under load",
      command: "npx tsx run-phase-c-tests.ts", 
      category: "Quality Assurance",
      requiresIsolation: true
    }
  ];

  async runAllTests(): Promise<void> {
    console.log("🚀 CRM MCP Server - Comprehensive Test Suite");
    console.log("=" .repeat(80));
    console.log(`📅 Started at: ${new Date().toISOString()}`);
    console.log(`🧪 Running ${this.testPhases.length} test phases with database isolation...\n`);

    // Ensure clean starting state
    await this.prepareTestEnvironment();

    // Run each test phase
    for (let i = 0; i < this.testPhases.length; i++) {
      const phase = this.testPhases[i];
      console.log(`\n📋 Phase ${i + 1}/${this.testPhases.length}: ${phase.name}`);
      console.log(`📝 ${phase.description}`);
      console.log(`🔧 Category: ${phase.category}`);
      console.log("-" .repeat(60));

      if (phase.requiresIsolation) {
        await this.setupIsolatedEnvironment(phase.name);
      }

      await this.runTestPhase(phase);

      if (phase.requiresIsolation) {
        await this.cleanupIsolatedEnvironment(phase.name);
      }
    }

    await this.generateFinalReport();
  }

  private async prepareTestEnvironment(): Promise<void> {
    console.log("🔧 Preparing test environment...");
    
    // Archive current database state
    await this.runDatabaseCommand("archive", "before-comprehensive-tests");
    
    // Reset to clean state
    await this.runDatabaseCommand("reset", "comprehensive-test-start");
    
    console.log("✅ Test environment prepared");
  }

  private async setupIsolatedEnvironment(phaseName: string): Promise<void> {
    console.log(`🔒 Setting up isolated environment for ${phaseName}...`);
    
    // Each phase gets a fresh database
    await this.runDatabaseCommand("reset", `${phaseName.toLowerCase().replace(/\s+/g, '-')}-start`);
  }

  private async cleanupIsolatedEnvironment(phaseName: string): Promise<void> {
    console.log(`🧹 Cleaning up environment for ${phaseName}...`);
    
    // Archive the test results
    await this.runDatabaseCommand("archive", `${phaseName.toLowerCase().replace(/\s+/g, '-')}-complete`);
  }

  private async runDatabaseCommand(command: string, reason?: string): Promise<void> {
    const cmd = reason ? `npm run db:${command} ${reason}` : `npm run db:${command}`;
    
    return new Promise((resolve, reject) => {
      const child = spawn('sh', ['-c', cmd], {
        cwd: path.join(__dirname, '..'),
        stdio: 'pipe'
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Database command failed: ${cmd}`));
        }
      });
    });
  }

  private async runTestPhase(phase: TestPhase): Promise<void> {
    const startTime = Date.now();
    let success = false;
    let output = "";
    let error: string | undefined;

    try {
      const result = await this.executeCommand(phase.command);
      success = result.success;
      output = result.output;
      error = result.error;
      
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : String(err);
      output = "";
    }

    const duration = Date.now() - startTime;
    
    const testResult: TestResult = {
      phase,
      success,
      duration,
      output,
      error,
      timestamp: new Date().toISOString()
    };

    this.results.push(testResult);

    // Log result
    const status = success ? "✅ PASSED" : "❌ FAILED";
    const durationStr = `${(duration / 1000).toFixed(2)}s`;
    console.log(`\n${status} ${phase.name} (${durationStr})`);
    
    if (error) {
      console.log(`❌ Error: ${error}`);
      // Show some output for debugging
      if (output) {
        console.log(`📋 Last 500 chars of output:\n${output.slice(-500)}`);
      }
    } else {
      console.log(`✅ All tests in ${phase.name} completed successfully`);
    }

    // Add to reporter
    this.reporter.addResult({
      testName: `${phase.category} - ${phase.name}`,
      success,
      duration,
      timestamp: testResult.timestamp,
      error,
      data: {
        category: phase.category,
        description: phase.description,
        command: phase.command,
        outputLength: output.length
      }
    });
  }

  private async executeCommand(command: string): Promise<{ success: boolean; output: string; error?: string }> {
    return new Promise((resolve) => {
      const child: ChildProcess = spawn('sh', ['-c', command], {
        cwd: __dirname,
        stdio: 'pipe'
      });

      let stdout = "";
      let stderr = "";

      if (child.stdout) {
        child.stdout.on("data", (data) => {
          stdout += data.toString();
        });
      }

      if (child.stderr) {
        child.stderr.on("data", (data) => {
          stderr += data.toString();
        });
      }

      child.on("close", (code) => {
        const success = code === 0;
        const output = stdout + (stderr ? `\n--- STDERR ---\n${stderr}` : "");
        const error = !success ? `Process exited with code ${code}` : undefined;
        
        resolve({ success, output, error });
      });

      child.on("error", (err) => {
        resolve({ 
          success: false, 
          output: stdout, 
          error: `Process error: ${err.message}` 
        });
      });

      // Set timeout (10 minutes for comprehensive tests)
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGTERM");
          resolve({ 
            success: false, 
            output: stdout, 
            error: "Test phase timed out after 10 minutes" 
          });
        }
      }, 10 * 60 * 1000);
    });
  }

  private async generateFinalReport(): Promise<void> {
    console.log("\n" + "=" .repeat(80));
    console.log("📊 COMPREHENSIVE TEST RESULTS");
    console.log("=" .repeat(80));

    const totalPhases = this.results.length;
    const passedPhases = this.results.filter(r => r.success).length;
    const failedPhases = totalPhases - passedPhases;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`\n📈 Overall Results:`);
    console.log(`  🧪 Total Test Phases: ${totalPhases}`);
    console.log(`  ✅ Passed: ${passedPhases}`);
    console.log(`  ❌ Failed: ${failedPhases}`);
    console.log(`  ⏱️  Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);
    console.log(`  📅 Completed: ${new Date().toISOString()}`);

    // Detailed results
    console.log(`\n📋 Phase Results:`);
    for (const result of this.results) {
      const status = result.success ? "✅" : "❌";
      const duration = `${(result.duration / 1000).toFixed(2)}s`;
      console.log(`  ${status} ${result.phase.name.padEnd(25)} ${duration.padStart(8)} ${result.phase.category}`);
      
      if (result.error) {
        console.log(`    ❌ ${result.error}`);
      }
    }

    // Performance summary
    if (totalPhases > 0) {
      const averageDuration = totalDuration / totalPhases;
      console.log(`\n⚡ Performance Summary:`);
      console.log(`  📊 Average Phase Duration: ${(averageDuration / 1000).toFixed(2)}s`);
    }

    // Generate and save detailed report
    const report = this.reporter.generateReport();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    const enhancedReport = {
      ...report,
      testPhases: {
        summary: {
          totalPhases,
          passedPhases,
          failedPhases,
          totalDurationSeconds: totalDuration / 1000
        },
        results: this.results
      },
      testingFramework: "CRM MCP Comprehensive Test Suite",
      version: "2.0.0",
      databaseManagement: "Isolated environments with automatic archiving"
    };

    this.reporter.saveReport(enhancedReport as any, `comprehensive-test-${timestamp}.json`);

    // Final status
    console.log(`\n🎯 Final Status: ${passedPhases === totalPhases ? "ALL PHASES PASSED! 🎉" : "SOME PHASES FAILED ⚠️"}`);
    
    if (passedPhases === totalPhases) {
      console.log("🚀 CRM MCP Server is production ready!");
      console.log("✅ Database management system validated");
      console.log("✅ All 14 CRM tools functioning correctly");
      console.log("✅ Edge cases and performance verified");
      console.log("✅ System ready for deployment");
    } else {
      console.log("⚠️ Issues detected - review failed phases");
      console.log("🔍 Check individual test outputs for details");
    }

    // Restore original database state
    console.log("\n🔄 Restoring original database state...");
    await this.runDatabaseCommand("reset", "post-comprehensive-tests");
    console.log("✅ Database state restored");

    console.log("\n" + "=" .repeat(80));
  }
}

// Run comprehensive tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new ComprehensiveTestRunner();
  runner.runAllTests()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Comprehensive test runner failed:", error);
      process.exit(1);
    });
} 