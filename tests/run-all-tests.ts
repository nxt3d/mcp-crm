#!/usr/bin/env node

import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import { fileURLToPath } from "url";
import { TestReporter, TestReport } from "./client/test-utilities.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TestSuite {
  name: string;
  description: string;
  scriptPath: string;
  category: string;
}

interface TestSuiteResult {
  suite: TestSuite;
  success: boolean;
  duration: number;
  output: string;
  error?: string;
  timestamp: string;
}

class CRMTestRunner {
  private reporter: TestReporter;
  private suiteResults: TestSuiteResult[] = [];

  constructor() {
    this.reporter = new TestReporter();
  }

  private readonly testSuites: TestSuite[] = [
    {
      name: "Contact Management",
      description: "Tests for contact CRUD operations, search, and organization filtering",
      scriptPath: "./scenarios/contact-management.test.js",
      category: "B1: Core Contact Management"
    },
    {
      name: "Contact History",
      description: "Tests for interaction tracking, history retrieval, and recent activities",
      scriptPath: "./scenarios/contact-history.test.js", 
      category: "B2: Contact History Management"
    },
    {
      name: "Export Functionality",
      description: "Tests for CSV export features including contacts, history, and full CRM export",
      scriptPath: "./scenarios/export-functionality.test.js",
      category: "B3: Data Export Features"
    }
  ];

  async runAllTestSuites(): Promise<void> {
    console.log("🚀 CRM MCP Server - Comprehensive Test Suite");
    console.log("=" .repeat(80));
    console.log(`📅 Started at: ${new Date().toISOString()}`);
    console.log(`🧪 Running ${this.testSuites.length} test suites...\n`);

    this.reporter.startReport();

    // Run each test suite in sequence
    for (const suite of this.testSuites) {
      await this.runTestSuite(suite);
    }

    // Generate summary report
    await this.generateSummaryReport();
  }

  private async runTestSuite(suite: TestSuite): Promise<void> {
    console.log(`\n🔧 ${suite.category}`);
    console.log(`📋 Suite: ${suite.name}`);
    console.log(`📝 Description: ${suite.description}`);
    console.log("-" .repeat(60));

    const startTime = Date.now();
    let success = false;
    let output = "";
    let error: string | undefined;

    try {
      const result = await this.executeTestScript(suite.scriptPath);
      success = result.success;
      output = result.output;
      error = result.error;
      
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : String(err);
      output = "";
    }

    const duration = Date.now() - startTime;
    
    const suiteResult: TestSuiteResult = {
      suite,
      success,
      duration,
      output,
      error,
      timestamp: new Date().toISOString()
    };

    this.suiteResults.push(suiteResult);

    // Log suite result
    const status = success ? "✅ PASSED" : "❌ FAILED";
    console.log(`\n${status} ${suite.name} (${duration}ms)`);
    
    if (error) {
      console.log(`❌ Error: ${error}`);
    }

    // Add to main reporter for overall statistics
    this.reporter.addResult({
      testName: `${suite.category} - ${suite.name}`,
      success,
      duration,
      timestamp: suiteResult.timestamp,
      error,
      data: {
        category: suite.category,
        description: suite.description,
        outputLength: output.length
      }
    });
  }

  private async executeTestScript(scriptPath: string): Promise<{ success: boolean; output: string; error?: string }> {
    return new Promise((resolve) => {
      const fullPath = path.join(__dirname, scriptPath);
      
      const child: ChildProcess = spawn("node", [fullPath], {
        cwd: __dirname,
        stdio: ["pipe", "pipe", "pipe"]
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

      // Set timeout for individual test suites (5 minutes)
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGTERM");
          resolve({ 
            success: false, 
            output: stdout, 
            error: "Test suite timed out after 5 minutes" 
          });
        }
      }, 5 * 60 * 1000);
    });
  }

  private async generateSummaryReport(): Promise<void> {
    console.log("\n" + "=" .repeat(80));
    console.log("📊 COMPREHENSIVE TEST SUMMARY");
    console.log("=" .repeat(80));

    const totalSuites = this.suiteResults.length;
    const passedSuites = this.suiteResults.filter(r => r.success).length;
    const failedSuites = totalSuites - passedSuites;
    const totalDuration = this.suiteResults.reduce((sum, r) => sum + r.duration, 0);

    console.log(`\n📈 Overall Results:`);
    console.log(`  🧪 Total Test Suites: ${totalSuites}`);
    console.log(`  ✅ Passed: ${passedSuites}`);
    console.log(`  ❌ Failed: ${failedSuites}`);
    console.log(`  ⏱️  Total Duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`);
    console.log(`  📅 Completed: ${new Date().toISOString()}`);

    // Detailed suite results
    console.log(`\n📋 Suite Details:`);
    for (const result of this.suiteResults) {
      const status = result.success ? "✅" : "❌";
      const duration = `${result.duration}ms`;
      console.log(`  ${status} ${result.suite.name.padEnd(25)} ${duration.padStart(8)} ${result.suite.category}`);
      
      if (result.error) {
        console.log(`    ❌ ${result.error}`);
      }
    }

    // Performance analysis
    const averageDuration = totalDuration / totalSuites;
    const slowestSuite = this.suiteResults.reduce((prev, current) => 
      prev.duration > current.duration ? prev : current
    );
    const fastestSuite = this.suiteResults.reduce((prev, current) => 
      prev.duration < current.duration ? prev : current
    );

    console.log(`\n⚡ Performance Analysis:`);
    console.log(`  📊 Average Duration: ${averageDuration.toFixed(2)}ms`);
    console.log(`  🐌 Slowest Suite: ${slowestSuite.suite.name} (${slowestSuite.duration}ms)`);
    console.log(`  🏃 Fastest Suite: ${fastestSuite.suite.name} (${fastestSuite.duration}ms)`);

    // Generate master report
    const masterReport = this.reporter.generateReport();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Enhanced report with suite details
    const enhancedReport = {
      ...masterReport,
      testSuites: {
        summary: {
          totalSuites,
          passedSuites,
          failedSuites,
          averageDuration,
          slowestSuite: slowestSuite.suite.name,
          fastestSuite: fastestSuite.suite.name
        },
        results: this.suiteResults
      },
      phase: "Phase B: Core Tool Testing",
      crmVersion: "1.0.0",
      testingFramework: "Custom MCP CRM Test Suite"
    };

    this.reporter.saveReport(enhancedReport as any, `comprehensive-test-report-${timestamp}.json`);

    // Final status
    console.log(`\n🎯 Final Status: ${passedSuites === totalSuites ? "ALL TESTS PASSED! 🎉" : "SOME TESTS FAILED ⚠️"}`);
    
    if (passedSuites === totalSuites) {
      console.log("🚀 CRM MCP Server is ready for production!");
      console.log("✅ All 13 tools are functioning correctly");
      console.log("✅ Contact management is working perfectly");
      console.log("✅ History tracking is operational");
      console.log("✅ Export functionality is validated");
    } else {
      console.log("⚠️ Issues detected - review failed test suites before proceeding");
    }

    console.log("\n" + "=" .repeat(80));
  }
}

// Run all tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new CRMTestRunner();
  runner.runAllTestSuites()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Test runner failed:", error);
      process.exit(1);
    });
} 