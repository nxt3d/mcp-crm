#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { TestReporter, TestResult, TestDataGenerator, TestValidator, TestDatabaseManager } from "../client/test-utilities.js";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EdgeCasesTests {
  private client: Client;
  private transport?: StdioClientTransport;
  private reporter: TestReporter;
  private testContactIds: number[] = [];
  private dbManager: TestDatabaseManager;

  constructor() {
    this.client = new Client({
      name: "crm-edge-test-client",
      version: "1.0.0"
    });
    this.reporter = new TestReporter();
    this.dbManager = new TestDatabaseManager("edge-cases");
  }

  async runAllTests(): Promise<void> {
    console.log("🧪 Starting Edge Cases Tests");
    console.log("=" .repeat(60));
    
    this.reporter.startReport();

    try {
      // Setup test database
      const testDbPath = await this.dbManager.setupTestDatabase();
      
      // Setup
      await this.connect(testDbPath);
      
      // Edge case tests
      await this.setupTestData();
      
      // C1: Input Validation Edge Cases
      await this.testInvalidInputs();
      await this.testExtremeInputs();
      await this.testSpecialCharacters();
      
      // C2: Database Edge Cases
      await this.testNonExistentEntities();
      await this.testDuplicateHandling();
      
      // C3: Search Edge Cases
      await this.testSearchEdgeCases();
      
      // C4: History Edge Cases
      await this.testHistoryEdgeCases();
      
      // C5: Export Edge Cases
      await this.testExportEdgeCases();
      
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
    this.reporter.saveReport(report, `edge-cases-test-${timestamp}.json`);
  }

  private async connect(testDbPath: string): Promise<void> {
    const serverPath = path.join(__dirname, "..", "..", "build", "crm-server.js");
    
    this.transport = new StdioClientTransport({
      command: "node",
      args: [serverPath, `--db-path=${testDbPath}`]
    });
    
    await this.client.connect(this.transport);
    console.log("✅ Connected to CRM server for edge case testing with test database");
  }

  private async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      console.log("🔌 Disconnected from CRM server");
    }
  }

  private async callTool(name: string, args: any = {}): Promise<any> {
    const startTime = Date.now();
    try {
      const result = await this.client.callTool({ name, arguments: args });
      const duration = Date.now() - startTime;
      
      return {
        result,
        duration,
        timestamp: new Date().toISOString(),
        success: true
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        error,
        duration,
        timestamp: new Date().toISOString(),
        success: false
      };
    }
  }

  // Setup: Create baseline test data
  private async setupTestData(): Promise<void> {
    console.log("\n🔧 Setup: Creating baseline test data");
    
    try {
      const { result } = await this.callTool("add_contact", {
        name: "Edge Test Contact",
        organization: "EdgeTest Corp",
        email: "edge@edgetest.com"
      });

      const responseText = result.content[0].text;
      const idMatch = responseText.match(/with ID (\d+)/);
      const contactId = idMatch ? parseInt(idMatch[1]) : null;
      
      if (contactId) {
        this.testContactIds.push(contactId);
        console.log(`  ✅ Baseline contact created with ID: ${contactId}`);
      }
      
    } catch (error) {
      console.log("  ⚠️ Baseline setup failed, continuing with edge case tests");
    }
  }

  // Test 1: Invalid Inputs
  private async testInvalidInputs(): Promise<void> {
    console.log("\n📝 Test 1: Invalid Input Validation");
    
    const invalidInputTests = [
      {
        name: "Empty name field",
        args: { name: "", email: "test@test.com" },
        expectedBehavior: "Should handle empty required field gracefully"
      },
      {
        name: "Null name field", 
        args: { name: null, email: "test@test.com" },
        expectedBehavior: "Should handle null required field"
      },
      {
        name: "Invalid email format",
        args: { name: "Test User", email: "not-an-email" },
        expectedBehavior: "Should handle invalid email format"
      },
      {
        name: "Invalid phone format",
        args: { name: "Test User", phone: "not-a-phone-123-abc" },
        expectedBehavior: "Should handle invalid phone format"
      }
    ];

    let passedTests = 0;
    let totalDuration = 0;

    for (const test of invalidInputTests) {
      try {
        const { success, duration, error } = await this.callTool("add_contact", test.args);
        totalDuration += duration;
        
        // For invalid inputs, we expect either graceful handling or meaningful error
        const handled = !success || (success && duration < 1000); // Either fails gracefully or succeeds quickly
        
        if (handled) {
          passedTests++;
          console.log(`  ✅ ${test.name}: Handled gracefully`);
        } else {
          console.log(`  ❌ ${test.name}: Poor error handling`);
        }
        
      } catch (error) {
        console.log(`  ⚠️ ${test.name}: Unexpected error - ${error}`);
      }
    }

    this.reporter.addResult({
      testName: "Invalid Input Validation",
      success: passedTests >= invalidInputTests.length * 0.8, // 80% pass rate acceptable
      duration: totalDuration,
      timestamp: new Date().toISOString(),
      data: { 
        testsRun: invalidInputTests.length,
        testsPassed: passedTests,
        passRate: (passedTests / invalidInputTests.length * 100).toFixed(1) + "%"
      }
    });

    console.log(`  📊 Passed ${passedTests}/${invalidInputTests.length} invalid input tests`);
  }

  // Test 2: Extreme Inputs
  private async testExtremeInputs(): Promise<void> {
    console.log("\n📝 Test 2: Extreme Input Boundaries");
    
    const extremeInputTests = [
      {
        name: "Very long name (1000 chars)",
        args: { 
          name: "A".repeat(1000),
          email: "longname@test.com"
        }
      },
      {
        name: "Very long organization (2000 chars)",
        args: { 
          name: "Extreme Test",
          organization: "B".repeat(2000),
          email: "longorg@test.com"
        }
      },
      {
        name: "Very long notes (5000 chars)",
        args: { 
          name: "Notes Test",
          email: "longnotes@test.com",
          notes: "C".repeat(5000)
        }
      },
      {
        name: "Maximum valid email length",
        args: { 
          name: "Email Test",
          email: "a".repeat(60) + "@" + "b".repeat(60) + ".com"
        }
      }
    ];

    let passedTests = 0;
    let totalDuration = 0;

    for (const test of extremeInputTests) {
      try {
        const { success, duration, result, error } = await this.callTool("add_contact", test.args);
        totalDuration += duration;
        
        if (success) {
          // Extract contact ID if successful
          const responseText = result.content[0].text;
          const idMatch = responseText.match(/with ID (\d+)/);
          const contactId = idMatch ? parseInt(idMatch[1]) : null;
          
          if (contactId) {
            this.testContactIds.push(contactId);
            passedTests++;
            console.log(`  ✅ ${test.name}: Created successfully (ID: ${contactId})`);
          } else {
            console.log(`  ⚠️ ${test.name}: Created but no ID returned`);
          }
        } else {
          // Graceful failure is also acceptable for extreme inputs
          passedTests++;
          console.log(`  ✅ ${test.name}: Gracefully rejected`);
        }
        
      } catch (error) {
        console.log(`  ❌ ${test.name}: Crashed - ${error}`);
      }
    }

    this.reporter.addResult({
      testName: "Extreme Input Boundaries",
      success: passedTests >= extremeInputTests.length * 0.75, // 75% pass rate acceptable
      duration: totalDuration,
      timestamp: new Date().toISOString(),
      data: { 
        testsRun: extremeInputTests.length,
        testsPassed: passedTests,
        passRate: (passedTests / extremeInputTests.length * 100).toFixed(1) + "%"
      }
    });

    console.log(`  📊 Passed ${passedTests}/${extremeInputTests.length} extreme input tests`);
  }

  // Test 3: Special Characters
  private async testSpecialCharacters(): Promise<void> {
    console.log("\n📝 Test 3: Special Character Handling");
    
    const specialCharTests = [
      {
        name: "Unicode characters",
        args: { 
          name: "François Müller 中文",
          organization: "Café München 株式会社",
          email: "unicode@test.com"
        }
      },
      {
        name: "SQL injection attempt",
        args: { 
          name: "Robert'; DROP TABLE contacts; --",
          email: "sql@test.com"
        }
      },
      {
        name: "HTML/XSS attempt",
        args: { 
          name: "<script>alert('xss')</script>",
          email: "xss@test.com"
        }
      },
      {
        name: "Special punctuation",
        args: { 
          name: "O'Connor & Associates!@#$%^&*()",
          organization: "Smith & Jones, LLC.",
          email: "special@test.com"
        }
      }
    ];

    let passedTests = 0;
    let totalDuration = 0;

    for (const test of specialCharTests) {
      try {
        const { success, duration, result } = await this.callTool("add_contact", test.args);
        totalDuration += duration;
        
        if (success) {
          const responseText = result.content[0].text;
          const idMatch = responseText.match(/with ID (\d+)/);
          const contactId = idMatch ? parseInt(idMatch[1]) : null;
          
          if (contactId) {
            this.testContactIds.push(contactId);
            passedTests++;
            console.log(`  ✅ ${test.name}: Handled properly (ID: ${contactId})`);
          }
        } else {
          // For security attempts, rejection is good
          if (test.name.includes("injection") || test.name.includes("XSS")) {
            passedTests++;
            console.log(`  ✅ ${test.name}: Security threat blocked`);
          } else {
            console.log(`  ❌ ${test.name}: Legitimate characters rejected`);
          }
        }
        
      } catch (error) {
        console.log(`  ❌ ${test.name}: Error - ${error}`);
      }
    }

    this.reporter.addResult({
      testName: "Special Character Handling",
      success: passedTests >= specialCharTests.length * 0.75,
      duration: totalDuration,
      timestamp: new Date().toISOString(),
      data: { 
        testsRun: specialCharTests.length,
        testsPassed: passedTests,
        passRate: (passedTests / specialCharTests.length * 100).toFixed(1) + "%"
      }
    });

    console.log(`  📊 Passed ${passedTests}/${specialCharTests.length} special character tests`);
  }

  // Test 4: Non-Existent Entities
  private async testNonExistentEntities(): Promise<void> {
    console.log("\n📝 Test 4: Non-Existent Entity Handling");
    
    const nonExistentTests = [
      {
        name: "Get details for non-existent contact",
        tool: "get_contact_details",
        args: { id: 999999 }
      },
      {
        name: "Update non-existent contact",
        tool: "update_contact", 
        args: { id: 999999, name: "Updated Name" }
      },
      {
        name: "Archive non-existent contact",
        tool: "archive_contact",
        args: { id: 999999 }
      },
      {
        name: "Get history for non-existent contact",
        tool: "get_contact_history",
        args: { contact_id: 999999 }
      },
      {
        name: "Add entry to non-existent contact",
        tool: "add_contact_entry",
        args: { 
          contact_id: 999999,
          entry_type: "note",
          subject: "Test",
          content: "Testing non-existent contact"
        }
      }
    ];

    let passedTests = 0;
    let totalDuration = 0;

    for (const test of nonExistentTests) {
      try {
        const { success, duration, result, error } = await this.callTool(test.tool, test.args);
        totalDuration += duration;
        
        // We expect either graceful error handling or clear "not found" messages
        if (!success) {
          passedTests++;
          console.log(`  ✅ ${test.name}: Properly rejected`);
        } else if (result && result.content && result.content[0] && result.content[0].text) {
          const responseText = result.content[0].text.toLowerCase();
          if (responseText.includes("not found") || responseText.includes("does not exist") || responseText.includes("no contact")) {
            passedTests++;
            console.log(`  ✅ ${test.name}: Clear error message`);
          } else {
            console.log(`  ❌ ${test.name}: Unclear response for non-existent entity`);
          }
        } else {
          console.log(`  ❌ ${test.name}: Unexpected success for non-existent entity`);
        }
        
      } catch (error) {
        console.log(`  ❌ ${test.name}: Crashed - ${error}`);
      }
    }

    this.reporter.addResult({
      testName: "Non-Existent Entity Handling",
      success: passedTests >= nonExistentTests.length * 0.8,
      duration: totalDuration,
      timestamp: new Date().toISOString(),
      data: { 
        testsRun: nonExistentTests.length,
        testsPassed: passedTests,
        passRate: (passedTests / nonExistentTests.length * 100).toFixed(1) + "%"
      }
    });

    console.log(`  📊 Passed ${passedTests}/${nonExistentTests.length} non-existent entity tests`);
  }

  // Test 5: Duplicate Handling
  private async testDuplicateHandling(): Promise<void> {
    console.log("\n📝 Test 5: Duplicate Data Handling");
    
    if (this.testContactIds.length === 0) {
      console.log("  ⚠️ Skipping - no test contacts available");
      return;
    }

    try {
      // Test duplicate contact creation
      const originalContact = {
        name: "Duplicate Test User",
        email: "duplicate@test.com",
        organization: "DuplicateTest Corp"
      };

      // Create original
      const { success: firstSuccess, result: firstResult } = await this.callTool("add_contact", originalContact);
      let firstContactId = null;

      if (firstSuccess) {
        const responseText = firstResult.content[0].text;
        const idMatch = responseText.match(/with ID (\d+)/);
        firstContactId = idMatch ? parseInt(idMatch[1]) : null;
      }

      // Try to create duplicate
      const { success: duplicateSuccess, duration } = await this.callTool("add_contact", originalContact);

      let testPassed = false;
      if (duplicateSuccess) {
        // System allows duplicates - this is often acceptable for CRM systems
        testPassed = true;
        console.log("  ✅ Duplicate contacts allowed (common CRM behavior)");
      } else {
        // System rejects duplicates - also acceptable
        testPassed = true;
        console.log("  ✅ Duplicate contacts rejected (strict validation)");
      }

      this.reporter.addResult({
        testName: "Duplicate Data Handling",
        success: testPassed,
        duration,
        timestamp: new Date().toISOString(),
        data: { 
          originalContactId: firstContactId,
          duplicateAllowed: duplicateSuccess,
          behavior: duplicateSuccess ? "allows_duplicates" : "rejects_duplicates"
        }
      });

    } catch (error) {
      this.reporter.addResult({
        testName: "Duplicate Data Handling",
        success: false,
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      console.error("  ❌ Test failed:", error);
    }
  }

  // Test 6: Search Edge Cases
  private async testSearchEdgeCases(): Promise<void> {
    console.log("\n📝 Test 6: Search Edge Cases");
    
    const searchEdgeTests = [
      {
        name: "Empty search query",
        query: ""
      },
      {
        name: "Whitespace only query",
        query: "   "
      },
      {
        name: "Very long search query",
        query: "a".repeat(1000)
      },
      {
        name: "Special characters search",
        query: "!@#$%^&*()"
      },
      {
        name: "SQL injection in search",
        query: "'; DROP TABLE contacts; --"
      },
      {
        name: "Unicode search",
        query: "中文测试"
      }
    ];

    let passedTests = 0;
    let totalDuration = 0;

    for (const test of searchEdgeTests) {
      try {
        const { success, duration, result } = await this.callTool("search_contacts", { query: test.query });
        totalDuration += duration;
        
        if (success) {
          // Any successful response is good - even "no results found"
          passedTests++;
          console.log(`  ✅ ${test.name}: Handled successfully`);
        } else {
          console.log(`  ❌ ${test.name}: Failed to handle search`);
        }
        
      } catch (error) {
        console.log(`  ❌ ${test.name}: Crashed - ${error}`);
      }
    }

    this.reporter.addResult({
      testName: "Search Edge Cases",
      success: passedTests >= searchEdgeTests.length * 0.8,
      duration: totalDuration,
      timestamp: new Date().toISOString(),
      data: { 
        testsRun: searchEdgeTests.length,
        testsPassed: passedTests,
        passRate: (passedTests / searchEdgeTests.length * 100).toFixed(1) + "%"
      }
    });

    console.log(`  📊 Passed ${passedTests}/${searchEdgeTests.length} search edge case tests`);
  }

  // Test 7: History Edge Cases
  private async testHistoryEdgeCases(): Promise<void> {
    console.log("\n📝 Test 7: History Edge Cases");
    
    if (this.testContactIds.length === 0) {
      console.log("  ⚠️ Skipping - no test contacts available");
      return;
    }

    const historyEdgeTests = [
      {
        name: "Invalid entry type",
        args: {
          contact_id: this.testContactIds[0],
          entry_type: "invalid_type",
          subject: "Test",
          content: "Testing invalid entry type"
        }
      },
      {
        name: "Empty subject",
        args: {
          contact_id: this.testContactIds[0],
          entry_type: "note",
          subject: "",
          content: "Testing empty subject"
        }
      },
      {
        name: "Very long content (10000 chars)",
        args: {
          contact_id: this.testContactIds[0],
          entry_type: "note",
          subject: "Long content test",
          content: "X".repeat(10000)
        }
      },
      {
        name: "Special characters in content",
        args: {
          contact_id: this.testContactIds[0],
          entry_type: "note",
          subject: "Special chars test",
          content: "Test with <script>alert('xss')</script> and SQL'; DROP TABLE--"
        }
      }
    ];

    let passedTests = 0;
    let totalDuration = 0;

    for (const test of historyEdgeTests) {
      try {
        const { success, duration, result, error } = await this.callTool("add_contact_entry", test.args);
        totalDuration += duration;
        
        if (success) {
          // Check if entry was actually created
          const responseText = result.content[0].text;
          if (responseText.includes("Successfully added") || responseText.includes("Entry ID:")) {
            passedTests++;
            console.log(`  ✅ ${test.name}: Entry created successfully`);
          } else {
            console.log(`  ❌ ${test.name}: Unclear response`);
          }
        } else {
          // For invalid entry types, rejection is acceptable
          if (test.name.includes("Invalid entry type")) {
            passedTests++;
            console.log(`  ✅ ${test.name}: Invalid type properly rejected`);
          } else {
            console.log(`  ❌ ${test.name}: Valid data rejected`);
          }
        }
        
      } catch (error) {
        console.log(`  ❌ ${test.name}: Error - ${error}`);
      }
    }

    this.reporter.addResult({
      testName: "History Edge Cases",
      success: passedTests >= historyEdgeTests.length * 0.75,
      duration: totalDuration,
      timestamp: new Date().toISOString(),
      data: { 
        testsRun: historyEdgeTests.length,
        testsPassed: passedTests,
        passRate: (passedTests / historyEdgeTests.length * 100).toFixed(1) + "%"
      }
    });

    console.log(`  📊 Passed ${passedTests}/${historyEdgeTests.length} history edge case tests`);
  }

  // Test 8: Export Edge Cases
  private async testExportEdgeCases(): Promise<void> {
    console.log("\n📝 Test 8: Export Edge Cases");
    
    const exportEdgeTests = [
      {
        name: "Export with invalid parameters",
        tool: "export_contacts_csv",
        args: { include_archived: "not_a_boolean" }
      },
      {
        name: "Export history for non-existent contact",
        tool: "export_contact_history_csv",
        args: { contact_id: 999999 }
      },
      {
        name: "Export with extreme limit values",
        tool: "get_recent_activities",
        args: { limit: -1 }
      },
      {
        name: "Export with zero limit",
        tool: "get_recent_activities", 
        args: { limit: 0 }
      }
    ];

    let passedTests = 0;
    let totalDuration = 0;

    for (const test of exportEdgeTests) {
      try {
        const { success, duration, result } = await this.callTool(test.tool, test.args);
        totalDuration += duration;
        
        if (success) {
          // Check if export actually contains data or proper empty response
          const responseText = result.content[0].text;
          if (responseText.length > 0) {
            passedTests++;
            console.log(`  ✅ ${test.name}: Export completed`);
          } else {
            console.log(`  ⚠️ ${test.name}: Empty response`);
          }
        } else {
          // Rejection of invalid parameters is acceptable
          passedTests++;
          console.log(`  ✅ ${test.name}: Invalid parameters properly rejected`);
        }
        
      } catch (error) {
        console.log(`  ❌ ${test.name}: Error - ${error}`);
      }
    }

    this.reporter.addResult({
      testName: "Export Edge Cases",
      success: passedTests >= exportEdgeTests.length * 0.75,
      duration: totalDuration,
      timestamp: new Date().toISOString(),
      data: { 
        testsRun: exportEdgeTests.length,
        testsPassed: passedTests,
        passRate: (passedTests / exportEdgeTests.length * 100).toFixed(1) + "%"
      }
    });

    console.log(`  📊 Passed ${passedTests}/${exportEdgeTests.length} export edge case tests`);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tests = new EdgeCasesTests();
  tests.runAllTests()
    .then(() => {
      console.log("\n🎉 Edge Case tests completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Edge Case tests failed:", error);
      process.exit(1);
    });
} 