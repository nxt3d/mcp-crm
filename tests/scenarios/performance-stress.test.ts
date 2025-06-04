#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { TestReporter, TestResult, TestDataGenerator, TestValidator, TestDatabaseManager } from "../client/test-utilities.js";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PerformanceStressTests {
  private client: Client;
  private transport?: StdioClientTransport;
  private reporter: TestReporter;
  private testContactIds: number[] = [];
  private dbManager: TestDatabaseManager;
  private performanceMetrics: Array<{operation: string, duration: number, timestamp: number}> = [];

  constructor() {
    this.client = new Client({
      name: "crm-performance-test-client",
      version: "1.0.0"
    });
    this.reporter = new TestReporter();
    this.dbManager = new TestDatabaseManager("performance-stress");
  }

  async runAllTests(): Promise<void> {
    console.log("🧪 Starting Performance & Stress Tests");
    console.log("=" .repeat(60));
    
    this.reporter.startReport();

    try {
      // Setup test database
      const testDbPath = await this.dbManager.setupTestDatabase();
      
      // Setup
      await this.connect(testDbPath);
      
      // Performance tests
      await this.testBulkContactCreation();
      await this.testBulkContactRetrieval();
      await this.testSearchPerformance();
      await this.testConcurrentOperations();
      await this.testLargeDatasetHandling();
      await this.testMemoryUsage();
      await this.testResponseTimeConsistency();
      
      // Cleanup
      await this.disconnect();
      
    } catch (error) {
      console.error("💥 Test suite failed:", error);
      throw error;
    } finally {
      // Always cleanup test database
      await this.dbManager.cleanupTestDatabase();
    }

    // Generate report
    const report = this.reporter.generateReport();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.reporter.saveReport(report, `performance-stress-test-${timestamp}.json`);
  }

  private async connect(testDbPath: string): Promise<void> {
    const serverPath = path.join(__dirname, "..", "..", "build", "crm-server.js");
    
    this.transport = new StdioClientTransport({
      command: "node",
      args: [serverPath, `--db-path=${testDbPath}`]
    });
    
    await this.client.connect(this.transport);
    console.log("✅ Connected to CRM server for performance testing with test database");
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

  // Test 2: Bulk Contact Retrieval
  private async testBulkContactRetrieval(): Promise<void> {
    console.log("\n📝 Test 2: Bulk Contact Retrieval Performance");
    
    if (this.testContactIds.length === 0) {
      console.log("  ⚠️ Skipping - no test contacts available");
      return;
    }

    const retrievalTests = [
      { tool: "get_contact_details", args: { id: this.testContactIds[0] }, description: "Retrieve single contact" },
      { tool: "get_contacts", args: { ids: this.testContactIds.slice(0, 10) }, description: "Retrieve multiple contacts" },
      { tool: "get_contacts", args: { ids: this.testContactIds.slice(0, 50) }, description: "Retrieve more contacts" },
      { tool: "get_contacts", args: { ids: this.testContactIds.slice(0, 100) }, description: "Retrieve all contacts" }
    ];

    let allTestsPassed = true;
    let totalDuration = 0;

    for (const retrievalTest of retrievalTests) {
      try {
        console.log(`\n  🔄 Retrieving ${retrievalTest.description}`);
        
        const { result, duration } = await this.callTool(retrievalTest.tool, retrievalTest.args);
        totalDuration += duration;
        
        const responseText = result.content[0].text;
        const resultCount = (responseText.match(/•/g) || []).length;
        
        console.log(`    📋 Query: "${JSON.stringify(retrievalTest.args)}"`);
        console.log(`    📊 Results: ${resultCount} contacts found`);
        console.log(`    ⏱️  Response Time: ${duration}ms`);
        
        // Performance thresholds for retrieval
        const retrievalPassed = duration < 200; // Under 200ms for retrieval
        if (!retrievalPassed) allTestsPassed = false;
        
        console.log(`    🎯 Retrieval: ${retrievalPassed ? '✅ PASSED' : '❌ FAILED'} (${duration}ms)`);
        
      } catch (error) {
        console.error(`    ❌ Retrieval failed for "${JSON.stringify(retrievalTest.args)}":`, error);
        allTestsPassed = false;
      }
    }

    this.reporter.addResult({
      testName: "Bulk Contact Retrieval Performance",
      success: allTestsPassed,
      duration: totalDuration,
      timestamp: new Date().toISOString(),
      data: { 
        retrievalTests: retrievalTests.length,
        totalDatasetSize: this.testContactIds.length,
        avgRetrievalTime: totalDuration / retrievalTests.length
      }
    });

    console.log(`\n  📈 Bulk Contact Retrieval: ${allTestsPassed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`     Average retrieval time: ${(totalDuration / retrievalTests.length).toFixed(2)}ms`);
  }

  // Test 3: Search Performance
  private async testSearchPerformance(): Promise<void> {
    console.log("\n📝 Test 3: Search Performance");
    
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
      testName: "Search Performance",
      success: allTestsPassed,
      duration: totalDuration,
      timestamp: new Date().toISOString(),
      data: { 
        searchQueries: searchQueries.length,
        totalDatasetSize: this.testContactIds.length,
        avgSearchTime: totalDuration / searchQueries.length
      }
    });

    console.log(`\n  📈 Search Performance: ${allTestsPassed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`     Average search time: ${(totalDuration / searchQueries.length).toFixed(2)}ms`);
  }

  // Test 4: Concurrent Operations
  private async testConcurrentOperations(): Promise<void> {
    console.log("\n📝 Test 4: Concurrent Operations");
    
    const operations = [
      { tool: "add_contact", args: { name: "Concurrent Contact 1", organization: "Concurrent Corp", job_title: "Concurrent Role", email: "concurrent1@perftest.com", phone: "+1-555-1111" }, description: "Add a new contact" },
      { tool: "add_contact", args: { name: "Concurrent Contact 2", organization: "Concurrent Corp", job_title: "Concurrent Role", email: "concurrent2@perftest.com", phone: "+1-555-2222" }, description: "Add another new contact" },
      { tool: "get_contact_details", args: { id: this.testContactIds[0] }, description: "Retrieve details of an existing contact" },
      { tool: "get_contact_details", args: { id: this.testContactIds[1] }, description: "Retrieve details of another existing contact" }
    ];

    let allTestsPassed = true;
    let totalDuration = 0;

    for (const operation of operations) {
      try {
        console.log(`\n  🔄 Performing: ${operation.description}`);
        
        const { result, duration } = await this.callTool(operation.tool, operation.args);
        totalDuration += duration;
        
        const responseText = result.content[0].text;
        console.log(`    📋 Result: ${responseText}`);
        console.log(`    ⏱️  Response Time: ${duration}ms`);
        
        // Performance thresholds for concurrent operations
        const concurrentPassed = duration < 500; // Under 500ms for concurrent operation
        if (!concurrentPassed) allTestsPassed = false;
        
        console.log(`    🎯 Concurrent: ${concurrentPassed ? '✅ PASSED' : '❌ FAILED'} (${duration}ms)`);
        
      } catch (error) {
        console.error(`    ❌ Operation failed for "${operation.description}":`, error);
        allTestsPassed = false;
      }
    }

    this.reporter.addResult({
      testName: "Concurrent Operations",
      success: allTestsPassed,
      duration: totalDuration,
      timestamp: new Date().toISOString(),
      data: { 
        operations: operations.length,
        totalDatasetSize: this.testContactIds.length,
        avgConcurrentTime: totalDuration / operations.length
      }
    });

    console.log(`\n  📈 Concurrent Operations: ${allTestsPassed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`     Average concurrent time: ${(totalDuration / operations.length).toFixed(2)}ms`);
  }

  // Test 5: Large Dataset Handling
  private async testLargeDatasetHandling(): Promise<void> {
    console.log("\n📝 Test 5: Large Dataset Handling");
    
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

  // Test 6: Memory Usage
  private async testMemoryUsage(): Promise<void> {
    console.log("\n📝 Test 6: Memory Usage Analysis");
    
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

  // Test 7: Response Time Consistency
  private async testResponseTimeConsistency(): Promise<void> {
    console.log("\n📝 Test 7: Response Time Consistency");
    
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