#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { TestReporter, TestResult, TestDataGenerator, TestValidator, TestDatabaseManager } from "../client/test-utilities.js";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ContactHistoryTests {
  private client: Client;
  private transport?: StdioClientTransport;
  private reporter: TestReporter;
  private testContactIds: number[] = [];
  private dbManager: TestDatabaseManager;

  constructor() {
    this.client = new Client({
      name: "crm-history-test-client",
      version: "1.0.0"
    });
    this.reporter = new TestReporter();
    this.dbManager = new TestDatabaseManager("contact-history");
  }

  async runAllTests(): Promise<void> {
    console.log("🧪 Starting Contact History Tests");
    console.log("=" .repeat(60));
    
    this.reporter.startReport();

    try {
      // Setup test database
      const testDbPath = await this.dbManager.setupTestDatabase();
      
      // Setup
      await this.connect(testDbPath);
      
      // B2: Contact History Tests
      await this.setupTestContacts();
      await this.testAddContactEntry();
      await this.testAddContactEntryWithHistoricalDate();
      await this.testUpdateContactEntryDate();
      await this.testGetContactHistory();
      await this.testGetRecentActivities();
      await this.testMultipleEntryTypes();
      await this.testHistoryPagination();
      
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
    this.reporter.saveReport(report, `contact-history-test-${timestamp}.json`);
  }

  private async connect(testDbPath: string): Promise<void> {
    const serverPath = path.join(__dirname, "..", "..", "build", "crm-server.js");
    
    this.transport = new StdioClientTransport({
      command: "node",
      args: [serverPath, `--db-path=${testDbPath}`]
    });
    
    await this.client.connect(this.transport);
    console.log("✅ Connected to CRM server for history testing with test database");
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
    
    return {
      result,
      duration,
      timestamp: new Date().toISOString()
    };
  }

  // Setup: Create a test contact for history testing
  private async setupTestContacts(): Promise<void> {
    console.log("\n🔧 Setup: Creating test contacts for history testing");
    
    try {
      const { result } = await this.callTool("add_contact", {
        name: "Sarah Wilson",
        organization: "HistoryTest Corp",
        job_title: "Business Development Manager",
        email: "sarah.wilson@historytest.com",
        phone: "+1-555-0200",
        notes: "Test contact for interaction history validation"
      });

      const responseText = result.content[0].text;
      const idMatch = responseText.match(/with ID (\d+)/);
      const testContactId = idMatch ? parseInt(idMatch[1]) : null;
      
      if (testContactId) {
        this.testContactIds.push(testContactId);
        console.log(`  ✅ Test contact created with ID: ${testContactId}`);
      } else {
        throw new Error("Failed to create test contact");
      }
      
    } catch (error) {
      console.error("  ❌ Failed to create test contact:", error);
      throw error;
    }
  }

  // Test 1: Add Contact Entry (Basic)
  private async testAddContactEntry(): Promise<void> {
    console.log("\n📝 Test 1: Add Contact Entry (Basic)");
    
    if (this.testContactIds.length === 0) {
      console.log("  ⚠️ Skipping - no test contacts available");
      return;
    }

    try {
      const { result, duration, timestamp } = await this.callTool("add_contact_entry", {
        contact_id: this.testContactIds[0],
        entry_type: "call",
        subject: "Initial consultation call",
        content: "Discussed potential partnership opportunities and their current needs."
      });

      const responseText = result.content[0].text;
      const success = responseText.includes("Successfully added");
      const idMatch = responseText.match(/Entry ID: (\d+)/);
      const entryId = idMatch ? parseInt(idMatch[1]) : null;
      
      if (entryId) {
        this.testContactIds.push(entryId);
      }

      this.reporter.addResult({
        testName: "Add Contact Entry - Basic",
        success,
        duration,
        timestamp,
        data: { 
          contactId: this.testContactIds[0],
          entryId,
          entryType: "call",
          response: responseText
        }
      });

      console.log(`  ✅ Contact entry added: ${entryId ? `Entry ID ${entryId}` : 'Success'}`);
      
    } catch (error) {
      this.reporter.addResult({
        testName: "Add Contact Entry - Basic",
        success: false,
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      console.error("  ❌ Test failed:", error);
    }
  }

  // Test 1.5: Add Contact Entry with Historical Date
  private async testAddContactEntryWithHistoricalDate(): Promise<void> {
    console.log("\n📝 Test 1.5: Add Contact Entry with Historical Date");
    
    if (this.testContactIds.length === 0) {
      console.log("  ⚠️ Skipping - no test contacts available");
      return;
    }

    try {
      const historicalDate = "2025-05-27T14:30:00Z";
      const { result, duration, timestamp } = await this.callTool("add_contact_entry", {
        contact_id: this.testContactIds[0],
        entry_type: "meeting",
        subject: "Historical Meeting - EthPrague Conference",
        content: "Met at EthPrague conference to discuss potential collaboration on L2 name services.",
        interaction_date: historicalDate
      });

      const responseText = result.content[0].text;
      const success = responseText.includes("Successfully added");
      const idMatch = responseText.match(/Entry ID: (\d+)/);
      const entryId = idMatch ? parseInt(idMatch[1]) : null;
      
      if (entryId) {
        this.testContactIds.push(entryId);
      }

      // Verify the date was set correctly by getting the history
      const { result: historyResult } = await this.callTool("get_contact_history", {
        contact_id: this.testContactIds[0]
      });
      
      const historyText = historyResult.content[0].text;
      const dateVerification = historyText.includes("2025-05-27");

      this.reporter.addResult({
        testName: "Add Contact Entry - Historical Date",
        success: success && dateVerification,
        duration,
        timestamp,
        data: { 
          contactId: this.testContactIds[0],
          entryId,
          historicalDate,
          entryType: "meeting",
          dateVerified: dateVerification,
          response: responseText
        }
      });

      console.log(`  ✅ Historical entry added: ${entryId ? `Entry ID ${entryId}` : 'Success'}`);
      console.log(`  📅 Date verification: ${dateVerification ? 'PASSED' : 'FAILED'}`);
      
    } catch (error) {
      this.reporter.addResult({
        testName: "Add Contact Entry - Historical Date",
        success: false,
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      console.error("  ❌ Test failed:", error);
    }
  }

  // Test 1.6: Update Contact Entry Date
  private async testUpdateContactEntryDate(): Promise<void> {
    console.log("\n📝 Test 1.6: Update Contact Entry Date");
    
    if (this.testContactIds.length < 2) {
      console.log("  ⚠️ Skipping - no entry IDs available for update test");
      return;
    }

    try {
      const newDate = "2025-05-28T10:15:00Z";
      const entryIdToUpdate = this.testContactIds[this.testContactIds.length - 1]; // Use the last entry ID
      
      const { result, duration, timestamp } = await this.callTool("update_contact_entry", {
        entry_id: entryIdToUpdate,
        interaction_date: newDate
      });

      const responseText = result.content[0].text;
      const success = responseText.includes("Successfully updated");

      // Verify the date was updated correctly by getting the history
      const { result: historyResult } = await this.callTool("get_contact_history", {
        contact_id: this.testContactIds[0]
      });
      
      const historyText = historyResult.content[0].text;
      const dateVerification = historyText.includes("2025-05-28");

      this.reporter.addResult({
        testName: "Update Contact Entry - Date",
        success: success && dateVerification,
        duration,
        timestamp,
        data: { 
          entryId: entryIdToUpdate,
          newDate,
          dateVerified: dateVerification,
          response: responseText
        }
      });

      console.log(`  ✅ Entry date updated: ${entryIdToUpdate}`);
      console.log(`  📅 Date verification: ${dateVerification ? 'PASSED' : 'FAILED'}`);
      
    } catch (error) {
      this.reporter.addResult({
        testName: "Update Contact Entry - Date",
        success: false,
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      console.error("  ❌ Test failed:", error);
    }
  }

  // Test 2: Get Contact History
  private async testGetContactHistory(): Promise<void> {
    console.log("\n📝 Test 2: Get Contact History");
    
    if (this.testContactIds.length === 0) {
      console.log("  ⚠️ Skipping - no test contacts available");
      return;
    }

    try {
      // Test full history
      const { result: fullResult, duration: fullDuration, timestamp } = await this.callTool("get_contact_history", {
        contact_id: this.testContactIds[0]
      });
      
      const fullResponseText = fullResult.content[0].text;
      const fullEntryCount = (fullResponseText.match(/•/g) || []).length;
      const expectedEntries = this.testContactIds.length - 1;
      const fullHistorySuccess = fullEntryCount >= expectedEntries;

      console.log(`  📚 Full history: ${fullEntryCount} entries (expected at least ${expectedEntries})`);

      // Test limited history
      const { result: limitedResult, duration: limitedDuration } = await this.callTool("get_contact_history", {
        contact_id: this.testContactIds[0],
        limit: 3
      });
      
      const limitedResponseText = limitedResult.content[0].text;
      const limitedEntryCount = (limitedResponseText.match(/•/g) || []).length;
      const limitedHistorySuccess = limitedEntryCount <= 3 && limitedEntryCount > 0;

      console.log(`  📚 Limited history (3): ${limitedEntryCount} entries`);

      this.reporter.addResult({
        testName: "Get Contact History",
        success: fullHistorySuccess && limitedHistorySuccess,
        duration: fullDuration + limitedDuration,
        timestamp,
        data: { 
          contactId: this.testContactIds[0],
          fullHistoryEntries: fullEntryCount,
          limitedHistoryEntries: limitedEntryCount,
          expectedEntries,
          fullHistoryResponse: fullResponseText,
          limitedHistoryResponse: limitedResponseText
        }
      });
      
    } catch (error) {
      this.reporter.addResult({
        testName: "Get Contact History",
        success: false,
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      console.error("  ❌ Test failed:", error);
    }
  }

  // Test 3: Get Recent Activities
  private async testGetRecentActivities(): Promise<void> {
    console.log("\n📝 Test 3: Get Recent Activities");
    
    try {
      // Test default limit (10)
      const { result: defaultResult, duration: defaultDuration, timestamp } = await this.callTool("get_recent_activities", {});
      
      const defaultResponseText = defaultResult.content[0].text;
      const defaultActivityCount = (defaultResponseText.match(/•/g) || []).length;
      const defaultSuccess = defaultActivityCount > 0;

      console.log(`  📊 Recent activities (default): ${defaultActivityCount} activities`);

      // Test custom limit
      const { result: customResult, duration: customDuration } = await this.callTool("get_recent_activities", {
        limit: 5
      });
      
      const customResponseText = customResult.content[0].text;
      const customActivityCount = (customResponseText.match(/•/g) || []).length;
      const customSuccess = customActivityCount <= 5 && customActivityCount > 0;

      console.log(`  📊 Recent activities (limit 5): ${customActivityCount} activities`);

      // Check if our test contacts appear in recent activities
      const testContactsInRecent = defaultResponseText.includes("Sarah Wilson") || 
                                   customResponseText.includes("Sarah Wilson");

      this.reporter.addResult({
        testName: "Get Recent Activities",
        success: defaultSuccess && customSuccess && testContactsInRecent,
        duration: defaultDuration + customDuration,
        timestamp,
        data: { 
          defaultActivityCount,
          customActivityCount,
          testContactsInRecent,
          expectedTestContactEntries: this.testContactIds.length - 1,
          defaultResponse: defaultResponseText,
          customResponse: customResponseText
        }
      });

      console.log(`  📊 Test contacts in recent activities: ${testContactsInRecent ? 'Yes' : 'No'}`);
      
    } catch (error) {
      this.reporter.addResult({
        testName: "Get Recent Activities",
        success: false,
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      console.error("  ❌ Test failed:", error);
    }
  }

  // Test 4: Add Multiple Entry Types
  private async testMultipleEntryTypes(): Promise<void> {
    console.log("\n📝 Test 4: Add Multiple Entry Types");
    
    if (this.testContactIds.length === 0) {
      console.log("  ⚠️ Skipping - no test contacts available");
      return;
    }

    const testEntries = [
      {
        entry_type: "email" as const,
        subject: "Follow-up email with proposal",
        content: "Sent detailed proposal document for their Q1 initiatives."
      },
      {
        entry_type: "meeting" as const,
        subject: "Strategy meeting",
        content: "Met at their office to discuss implementation timeline and budget.",
        interaction_date: "2025-05-29T09:30:00Z"
      },
      {
        entry_type: "note" as const,
        subject: "Research notes",
        content: "Competitor analysis shows they're looking for cloud-based solutions.",
        interaction_date: "2025-05-30T16:45:00Z"
      },
      {
        entry_type: "task" as const,
        subject: "Prepare technical demo",
        content: "Schedule demo session for next week with their technical team."
      }
    ];

    let successCount = 0;
    let totalDuration = 0;

    for (const entry of testEntries) {
      try {
        const { result, duration } = await this.callTool("add_contact_entry", {
          contact_id: this.testContactIds[0],
          ...entry
        });
        
        const responseText = result.content[0].text;
        const success = responseText.includes("Successfully added");
        const idMatch = responseText.match(/Entry ID: (\d+)/);
        const entryId = idMatch ? parseInt(idMatch[1]) : null;
        
        if (success && entryId) {
          this.testContactIds.push(entryId);
          successCount++;
        }
        
        totalDuration += duration;
        console.log(`  📝 Added ${entry.entry_type} entry: ${entryId ? `ID ${entryId}` : 'Failed'}`);
        
      } catch (error) {
        console.error(`  ❌ Failed to add ${entry.entry_type} entry:`, error);
      }
    }

    this.reporter.addResult({
      testName: "Add Multiple Contact Entries",
      success: successCount === testEntries.length,
      duration: totalDuration,
      timestamp: new Date().toISOString(),
      data: { 
        contactId: this.testContactIds[0],
        entriesAdded: successCount,
        totalEntries: testEntries.length,
        entryIds: this.testContactIds,
        entryTypes: testEntries.map(e => e.entry_type)
      }
    });

    console.log(`  📊 Added ${successCount}/${testEntries.length} entries successfully`);
  }

  // Test 5: Test History Pagination
  private async testHistoryPagination(): Promise<void> {
    console.log("\n📝 Test 5: Test History Pagination");
    
    if (this.testContactIds.length === 0) {
      console.log("  ⚠️ Skipping - no test contacts available");
      return;
    }

    try {
      // Test full history
      const { result: fullResult, duration: fullDuration, timestamp } = await this.callTool("get_contact_history", {
        contact_id: this.testContactIds[0]
      });
      
      const fullResponseText = fullResult.content[0].text;
      const fullEntryCount = (fullResponseText.match(/•/g) || []).length;
      const expectedEntries = this.testContactIds.length - 1;
      const fullHistorySuccess = fullEntryCount >= expectedEntries;

      console.log(`  📚 Full history: ${fullEntryCount} entries (expected at least ${expectedEntries})`);

      // Test limited history
      const { result: limitedResult, duration: limitedDuration } = await this.callTool("get_contact_history", {
        contact_id: this.testContactIds[0],
        limit: 3
      });
      
      const limitedResponseText = limitedResult.content[0].text;
      const limitedEntryCount = (limitedResponseText.match(/•/g) || []).length;
      const limitedHistorySuccess = limitedEntryCount <= 3 && limitedEntryCount > 0;

      console.log(`  📚 Limited history (3): ${limitedEntryCount} entries`);

      this.reporter.addResult({
        testName: "Get Contact History",
        success: fullHistorySuccess && limitedHistorySuccess,
        duration: fullDuration + limitedDuration,
        timestamp,
        data: { 
          contactId: this.testContactIds[0],
          fullHistoryEntries: fullEntryCount,
          limitedHistoryEntries: limitedEntryCount,
          expectedEntries,
          fullHistoryResponse: fullResponseText,
          limitedHistoryResponse: limitedResponseText
        }
      });
      
    } catch (error) {
      this.reporter.addResult({
        testName: "Get Contact History",
        success: false,
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      console.error("  ❌ Test failed:", error);
    }
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tests = new ContactHistoryTests();
  tests.runAllTests()
    .then(() => {
      console.log("\n🎉 Contact History tests completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Contact History tests failed:", error);
      process.exit(1);
    });
} 