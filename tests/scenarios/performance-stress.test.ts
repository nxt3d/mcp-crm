#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { TestReporter, TestResult } from "../client/test-utilities.js";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PerformanceStressTests {
  private client: Client;
  private transport?: StdioClientTransport;
  private reporter: TestReporter;
  private testContactIds: number[] = [];
  private performanceMetrics: Array<{operation: string, duration: number, timestamp: number}> = [];

  constructor() {
    this.client = new Client({
      name: "crm-performance-test-client",
      version: "1.0.0"
    });
    this.reporter = new TestReporter();
  }

  async runAllTests(): Promise<void> {
    console.log("🧪 Starting Performance & Stress Tests");
    console.log("=" .repeat(60));
    
    this.reporter.startReport();

    try {
      // Setup
      await this.connect();
      
      // D1: Bulk Operations Performance
      await this.testBulkContactCreation();
      await this.testBulkHistoryCreation();
      
      // D2: Large Dataset Operations
      await this.testLargeDatasetSearch();
      await this.testLargeDatasetExport();
      
      // D3: Response Time Performance
      await this.testResponseTimes();
      
      // D4: Memory and Resource Usage
      await this.testResourceUsage();
      
      // Cleanup
      await this.disconnect();
      
    } catch (error) {
      console.error("💥 Test suite failed:", error);
      throw error;
    }

    // Generate report
    const report = this.reporter.generateReport();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.reporter.saveReport(report, `performance-stress-test-${timestamp}.json`);
  }

  private async connect(): Promise<void> {
    const serverPath = path.join(__dirname, "..", "..", "build", "crm-server.js");
    
    this.transport = new StdioClientTransport({
      command: "node",
      args: [serverPath]
    });
    
    await this.client.connect(this.transport);
    console.log("✅ Connected to CRM server for performance testing");
  }

  private async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      console.log("🔌 Disconnected from CRM server");
    }
  }

  private async callTool(name: string, args: any = {}): Promise<any> {
    const startTime = Date.now();
    const result = await this.client.callTool({ name, arguments: args });
    const duration = Date.now() - startTime;
    
    // Track performance metrics
    this.performanceMetrics.push({
      operation: name,
      duration,
      timestamp: startTime
    });
    
    return {
      result,
      duration,
      timestamp: new Date().toISOString()
    };
  }

  // Test 1: Bulk Contact Creation
  private async testBulkContactCreation(): Promise<void> {
    console.log("\n📝 Test 1: Bulk Contact Creation Performance");
    
    const bulkSizes = [10, 50, 100];
    let allTestsPassed = true;
    let totalDuration = 0;

    for (const bulkSize of bulkSizes) {
      console.log(`\n  🔄 Creating ${bulkSize} contacts in sequence...`);
      
      const batchStartTime = Date.now();
      let successCount = 0;
      let batchDurations: number[] = [];

      for (let i = 0; i < bulkSize; i++) {
        try {
          const { result, duration } = await this.callTool("add_contact", {
            name: `Bulk Test Contact ${i + 1}`,
            organization: `BulkTest Corp ${Math.floor(i / 10) + 1}`,
            job_title: "Performance Test Role",
            email: `bulk${i + 1}@perftest.com`,
            phone: `+1-555-${String(i + 1).padStart(4, '0')}`,
            notes: `Generated for bulk performance test #${i + 1}`
          });

          const responseText = result.content[0].text;
          const idMatch = responseText.match(/with ID (\d+)/);
          const contactId = idMatch ? parseInt(idMatch[1]) : null;
          
          if (contactId) {
            this.testContactIds.push(contactId);
            successCount++;
            batchDurations.push(duration);
          }
          
        } catch (error) {
          console.error(`    ❌ Failed to create contact ${i + 1}:`, error);
          allTestsPassed = false;
        }
      }

      const batchTotalTime = Date.now() - batchStartTime;
      const avgDuration = batchDurations.reduce((sum, d) => sum + d, 0) / batchDurations.length;
      const maxDuration = Math.max(...batchDurations);
      const minDuration = Math.min(...batchDurations);
      
      totalDuration += batchTotalTime;

      console.log(`    📊 Batch Results for ${bulkSize} contacts:`);
      console.log(`       ✅ Success Rate: ${successCount}/${bulkSize} (${(successCount/bulkSize*100).toFixed(1)}%)`);
      console.log(`       ⏱️  Total Time: ${batchTotalTime}ms`);
      console.log(`       📈 Avg Response: ${avgDuration.toFixed(2)}ms`);
      console.log(`       🏃 Min Response: ${minDuration}ms`);
      console.log(`       🐌 Max Response: ${maxDuration}ms`);
      console.log(`       🔥 Throughput: ${(successCount / (batchTotalTime / 1000)).toFixed(2)} contacts/sec`);

      // Performance thresholds
      const passThresholds = {
        successRate: successCount / bulkSize >= 0.95, // 95% success rate
        avgResponse: avgDuration < 100, // Under 100ms average
        maxResponse: maxDuration < 500, // No single request over 500ms
        throughput: (successCount / (batchTotalTime / 1000)) > 5 // At least 5 contacts/sec
      };

      const batchPassed = Object.values(passThresholds).every(Boolean);
      if (!batchPassed) allTestsPassed = false;

      console.log(`    🎯 Batch ${bulkSize}: ${batchPassed ? '✅ PASSED' : '❌ FAILED'}`);
    }

    this.reporter.addResult({
      testName: "Bulk Contact Creation Performance",
      success: allTestsPassed,
      duration: totalDuration,
      timestamp: new Date().toISOString(),
      data: { 
        totalContactsCreated: this.testContactIds.length,
        bulkSizes,
        performanceMetrics: this.performanceMetrics.filter(m => m.operation === 'add_contact')
      }
    });

    console.log(`\n  📈 Overall Bulk Creation: ${allTestsPassed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`     Total contacts created: ${this.testContactIds.length}`);
  }

  // Test 2: Bulk History Creation
  private async testBulkHistoryCreation(): Promise<void> {
    console.log("\n📝 Test 2: Bulk History Entry Performance");
    
    if (this.testContactIds.length === 0) {
      console.log("  ⚠️ Skipping - no test contacts available");
      return;
    }

    const entriesPerContact = 20;
    const testContactIds = this.testContactIds.slice(0, 10); // Use first 10 contacts
    
    console.log(`\n  🔄 Creating ${entriesPerContact} history entries for ${testContactIds.length} contacts...`);
    
    const entryTypes = ['call', 'email', 'meeting', 'note', 'task'];
    let successCount = 0;
    let totalDuration = 0;
    let entryDurations: number[] = [];
    
    const startTime = Date.now();

    for (const contactId of testContactIds) {
      for (let i = 0; i < entriesPerContact; i++) {
        try {
          const entryType = entryTypes[i % entryTypes.length];
          const { result, duration } = await this.callTool("add_contact_entry", {
            contact_id: contactId,
            entry_type: entryType,
            subject: `Performance Test ${entryType} #${i + 1}`,
            content: `This is a performance test entry of type ${entryType} for contact ${contactId}. Entry number ${i + 1} of ${entriesPerContact}.`
          });

          const responseText = result.content[0].text;
          if (responseText.includes("Successfully added")) {
            successCount++;
            entryDurations.push(duration);
          }
          
        } catch (error) {
          console.error(`    ❌ Failed to create entry ${i + 1} for contact ${contactId}:`, error);
        }
      }
    }

    totalDuration = Date.now() - startTime;
    const avgDuration = entryDurations.reduce((sum, d) => sum + d, 0) / entryDurations.length;
    const maxDuration = Math.max(...entryDurations);
    const minDuration = Math.min(...entryDurations);
    const expectedEntries = testContactIds.length * entriesPerContact;

    console.log(`    📊 Bulk History Results:`);
    console.log(`       ✅ Success Rate: ${successCount}/${expectedEntries} (${(successCount/expectedEntries*100).toFixed(1)}%)`);
    console.log(`       ⏱️  Total Time: ${totalDuration}ms`);
    console.log(`       📈 Avg Response: ${avgDuration.toFixed(2)}ms`);
    console.log(`       🏃 Min Response: ${minDuration}ms`);
    console.log(`       🐌 Max Response: ${maxDuration}ms`);
    console.log(`       🔥 Throughput: ${(successCount / (totalDuration / 1000)).toFixed(2)} entries/sec`);

    const testPassed = successCount >= expectedEntries * 0.95 && avgDuration < 50;

    this.reporter.addResult({
      testName: "Bulk History Entry Performance", 
      success: testPassed,
      duration: totalDuration,
      timestamp: new Date().toISOString(),
      data: { 
        entriesCreated: successCount,
        expectedEntries,
        avgDuration,
        maxDuration,
        minDuration,
        throughput: successCount / (totalDuration / 1000)
      }
    });

    console.log(`\n  📈 Bulk History Creation: ${testPassed ? '✅ PASSED' : '❌ FAILED'}`);
  }

  // Test 3: Large Dataset Search Performance
  private async testLargeDatasetSearch(): Promise<void> {
    console.log("\n📝 Test 3: Large Dataset Search Performance");
    
    const searchQueries = [
      { query: "Test", description: "Common term search" },
      { query: "BulkTest", description: "Organization search" },
      { query: "Performance", description: "Job title search" },
      { query: "bulk1@perftest.com", description: "Email search" },
      { query: "555-", description: "Phone search" },
      { query: "nonexistentterm12345", description: "No results search" }
    ];

    let allTestsPassed = true;
    let totalDuration = 0;

    for (const searchTest of searchQueries) {
      try {
        console.log(`\n  🔍 Testing: ${searchTest.description}`);
        
        const { result, duration } = await this.callTool("search_contacts", { query: searchTest.query });
        totalDuration += duration;
        
        const responseText = result.content[0].text;
        const resultCount = (responseText.match(/•/g) || []).length;
        
        console.log(`    📋 Query: "${searchTest.query}"`);
        console.log(`    📊 Results: ${resultCount} contacts found`);
        console.log(`    ⏱️  Response Time: ${duration}ms`);
        
        // Performance thresholds for search
        const searchPassed = duration < 200; // Under 200ms for search
        if (!searchPassed) allTestsPassed = false;
        
        console.log(`    🎯 Search: ${searchPassed ? '✅ PASSED' : '❌ FAILED'} (${duration}ms)`);
        
      } catch (error) {
        console.error(`    ❌ Search failed for "${searchTest.query}":`, error);
        allTestsPassed = false;
      }
    }

    this.reporter.addResult({
      testName: "Large Dataset Search Performance",
      success: allTestsPassed,
      duration: totalDuration,
      timestamp: new Date().toISOString(),
      data: { 
        searchQueries: searchQueries.length,
        totalDatasetSize: this.testContactIds.length,
        avgSearchTime: totalDuration / searchQueries.length
      }
    });

    console.log(`\n  📈 Large Dataset Search: ${allTestsPassed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`     Average search time: ${(totalDuration / searchQueries.length).toFixed(2)}ms`);
  }

  // Test 4: Large Dataset Export Performance
  private async testLargeDatasetExport(): Promise<void> {
    console.log("\n📝 Test 4: Large Dataset Export Performance");
    
    const exportTests = [
      { tool: "export_contacts_csv", args: {}, description: "Full contacts export" },
      { tool: "export_contact_history_csv", args: {}, description: "Full history export" },
      { tool: "export_full_crm_csv", args: {}, description: "Complete CRM export" }
    ];

    let allTestsPassed = true;
    let totalDuration = 0;

    for (const exportTest of exportTests) {
      try {
        console.log(`\n  📤 Testing: ${exportTest.description}`);
        
        const { result, duration } = await this.callTool(exportTest.tool, exportTest.args);
        totalDuration += duration;
        
        const responseText = result.content[0].text;
        const dataSize = responseText.length;
        const csvLines = responseText.split('\n').length;
        
        console.log(`    📊 Export Size: ${(dataSize / 1024).toFixed(2)} KB`);
        console.log(`    📋 CSV Lines: ${csvLines}`);
        console.log(`    ⏱️  Export Time: ${duration}ms`);
        console.log(`    🔥 Throughput: ${(dataSize / duration).toFixed(2)} bytes/ms`);
        
        // Performance thresholds for exports
        const exportPassed = duration < 2000; // Under 2 seconds for export
        if (!exportPassed) allTestsPassed = false;
        
        console.log(`    🎯 Export: ${exportPassed ? '✅ PASSED' : '❌ FAILED'} (${duration}ms)`);
        
      } catch (error) {
        console.error(`    ❌ Export failed for ${exportTest.description}:`, error);
        allTestsPassed = false;
      }
    }

    this.reporter.addResult({
      testName: "Large Dataset Export Performance",
      success: allTestsPassed,
      duration: totalDuration,
      timestamp: new Date().toISOString(),
      data: { 
        exportTypes: exportTests.length,
        totalDatasetSize: this.testContactIds.length,
        avgExportTime: totalDuration / exportTests.length
      }
    });

    console.log(`\n  📈 Large Dataset Export: ${allTestsPassed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`     Average export time: ${(totalDuration / exportTests.length).toFixed(2)}ms`);
  }

  // Test 5: Response Time Consistency
  private async testResponseTimes(): Promise<void> {
    console.log("\n📝 Test 5: Response Time Consistency");
    
    if (this.testContactIds.length === 0) {
      console.log("  ⚠️ Skipping - no test contacts available");
      return;
    }

    const iterations = 50;
    const testContactId = this.testContactIds[0];
    
    console.log(`\n  🔄 Testing response time consistency with ${iterations} iterations...`);
    
    let responseTimes: number[] = [];
    let successCount = 0;

    for (let i = 0; i < iterations; i++) {
      try {
        const { result, duration } = await this.callTool("get_contact_details", { id: testContactId });
        responseTimes.push(duration);
        successCount++;
        
        if ((i + 1) % 10 === 0) {
          process.stdout.write(`.`);
        }
        
      } catch (error) {
        console.error(`\n    ❌ Iteration ${i + 1} failed:`, error);
      }
    }

    console.log(``); // New line after dots

    if (responseTimes.length > 0) {
      const avgTime = responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length;
      const minTime = Math.min(...responseTimes);
      const maxTime = Math.max(...responseTimes);
      const median = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length / 2)];
      const stdDev = Math.sqrt(responseTimes.reduce((sum, t) => sum + Math.pow(t - avgTime, 2), 0) / responseTimes.length);
      
      console.log(`    📊 Response Time Analysis:`);
      console.log(`       ✅ Success Rate: ${successCount}/${iterations} (${(successCount/iterations*100).toFixed(1)}%)`);
      console.log(`       📈 Average: ${avgTime.toFixed(2)}ms`);
      console.log(`       📊 Median: ${median}ms`);
      console.log(`       🏃 Minimum: ${minTime}ms`);
      console.log(`       🐌 Maximum: ${maxTime}ms`);
      console.log(`       📏 Std Dev: ${stdDev.toFixed(2)}ms`);
      console.log(`       🎯 Consistency: ${stdDev < avgTime * 0.3 ? 'Good' : 'Poor'} (${(stdDev/avgTime*100).toFixed(1)}% variation)`);

      // Performance thresholds
      const testPassed = successCount >= iterations * 0.95 && 
                        avgTime < 50 && 
                        maxTime < 200 && 
                        stdDev < avgTime * 0.5;

      this.reporter.addResult({
        testName: "Response Time Consistency",
        success: testPassed,
        duration: responseTimes.reduce((sum, t) => sum + t, 0),
        timestamp: new Date().toISOString(),
        data: { 
          iterations,
          successCount,
          avgTime,
          minTime,
          maxTime,
          median,
          stdDev,
          consistencyRating: stdDev < avgTime * 0.3 ? 'Good' : 'Poor'
        }
      });

      console.log(`\n  📈 Response Time Consistency: ${testPassed ? '✅ PASSED' : '❌ FAILED'}`);
    } else {
      console.log(`\n  ❌ No successful responses to analyze`);
    }
  }

  // Test 6: Resource Usage Estimation
  private async testResourceUsage(): Promise<void> {
    console.log("\n📝 Test 6: Resource Usage Analysis");
    
    // Analyze performance metrics collected during tests
    if (this.performanceMetrics.length === 0) {
      console.log("  ⚠️ No performance metrics available");
      return;
    }

    const operationStats = new Map<string, number[]>();
    
    // Group metrics by operation
    for (const metric of this.performanceMetrics) {
      if (!operationStats.has(metric.operation)) {
        operationStats.set(metric.operation, []);
      }
      operationStats.get(metric.operation)!.push(metric.duration);
    }

    console.log(`\n  📊 Performance Summary by Operation:`);
    
    let overallHealthy = true;
    
    for (const [operation, durations] of operationStats) {
      const count = durations.length;
      const avg = durations.reduce((sum, d) => sum + d, 0) / count;
      const min = Math.min(...durations);
      const max = Math.max(...durations);
      
      console.log(`\n    🔧 ${operation}:`);
      console.log(`       📈 Calls: ${count}`);
      console.log(`       ⏱️  Avg: ${avg.toFixed(2)}ms`);
      console.log(`       🏃 Min: ${min}ms`);
      console.log(`       🐌 Max: ${max}ms`);
      
      // Health check per operation
      const healthy = avg < 100 && max < 500;
      if (!healthy) overallHealthy = false;
      
      console.log(`       💊 Health: ${healthy ? '✅ Good' : '⚠️ Concerning'}`);
    }

    // Memory usage estimation based on data created
    const estimatedMemoryUsage = this.testContactIds.length * 1024; // Rough estimate
    console.log(`\n  🧠 Estimated Memory Impact:`);
    console.log(`     📋 Test Data Created: ${this.testContactIds.length} contacts`);
    console.log(`     💾 Estimated Size: ${(estimatedMemoryUsage / 1024).toFixed(2)} KB`);

    this.reporter.addResult({
      testName: "Resource Usage Analysis",
      success: overallHealthy,
      duration: 0,
      timestamp: new Date().toISOString(),
      data: { 
        operationCounts: Object.fromEntries(
          Array.from(operationStats.entries()).map(([op, durations]) => [op, durations.length])
        ),
        performanceMetrics: this.performanceMetrics,
        estimatedMemoryUsage,
        overallHealthy
      }
    });

    console.log(`\n  📈 Resource Usage: ${overallHealthy ? '✅ HEALTHY' : '⚠️ CONCERNING'}`);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tests = new PerformanceStressTests();
  tests.runAllTests()
    .then(() => {
      console.log("\n🎉 Performance & Stress tests completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Performance & Stress tests failed:", error);
      process.exit(1);
    });
} 