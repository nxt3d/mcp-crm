#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { TestReporter, TestResult } from "../client/test-utilities.js";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ContactHistoryTests {
  private client: Client;
  private transport?: StdioClientTransport;
  private reporter: TestReporter;
  private testContactId: number | null = null;
  private testEntryIds: number[] = [];

  constructor() {
    this.client = new Client({
      name: "crm-history-test-client",
      version: "1.0.0"
    });
    this.reporter = new TestReporter();
  }

  async runAllTests(): Promise<void> {
    console.log("🧪 Starting Contact History Tests");
    console.log("=" .repeat(60));
    
    this.reporter.startReport();

    try {
      // Setup
      await this.connect();
      await this.setupTestContact();
      
      // B2: Contact History Tools (3 tools)
      await this.testAddContactEntry();
      await this.testAddMultipleEntries();
      await this.testGetContactHistory();
      await this.testGetRecentActivities();
      
      // Cleanup
      await this.disconnect();
      
    } catch (error) {
      console.error("💥 Test suite failed:", error);
      throw error;
    }

    // Generate report
    const report = this.reporter.generateReport();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.reporter.saveReport(report, `contact-history-test-${timestamp}.json`);
  }

  private async connect(): Promise<void> {
    const serverPath = path.join(__dirname, "..", "..", "build", "crm-server.js");
    
    this.transport = new StdioClientTransport({
      command: "node",
      args: [serverPath]
    });
    
    await this.client.connect(this.transport);
    console.log("✅ Connected to CRM server for history testing");
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
  private async setupTestContact(): Promise<void> {
    console.log("\n🔧 Setup: Creating test contact for history testing");
    
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
      this.testContactId = idMatch ? parseInt(idMatch[1]) : null;
      
      if (this.testContactId) {
        console.log(`  ✅ Test contact created with ID: ${this.testContactId}`);
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
    
    if (!this.testContactId) {
      console.log("  ⚠️ Skipping - no test contact available");
      return;
    }

    try {
      const { result, duration, timestamp } = await this.callTool("add_contact_entry", {
        contact_id: this.testContactId,
        entry_type: "call",
        subject: "Initial consultation call",
        content: "Discussed potential partnership opportunities and their current needs."
      });

      const responseText = result.content[0].text;
      const success = responseText.includes("Successfully added");
      const idMatch = responseText.match(/Entry ID: (\d+)/);
      const entryId = idMatch ? parseInt(idMatch[1]) : null;
      
      if (entryId) {
        this.testEntryIds.push(entryId);
      }

      this.reporter.addResult({
        testName: "Add Contact Entry - Basic",
        success,
        duration,
        timestamp,
        data: { 
          contactId: this.testContactId,
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

  // Test 2: Add Multiple Entries (Different Types)
  private async testAddMultipleEntries(): Promise<void> {
    console.log("\n📝 Test 2: Add Multiple Contact Entries");
    
    if (!this.testContactId) {
      console.log("  ⚠️ Skipping - no test contact available");
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
        content: "Met at their office to discuss implementation timeline and budget."
      },
      {
        entry_type: "note" as const,
        subject: "Research notes",
        content: "Competitor analysis shows they're looking for cloud-based solutions."
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
          contact_id: this.testContactId,
          ...entry
        });
        
        const responseText = result.content[0].text;
        const success = responseText.includes("Successfully added");
        const idMatch = responseText.match(/Entry ID: (\d+)/);
        const entryId = idMatch ? parseInt(idMatch[1]) : null;
        
        if (success && entryId) {
          this.testEntryIds.push(entryId);
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
        contactId: this.testContactId,
        entriesAdded: successCount,
        totalEntries: testEntries.length,
        entryIds: this.testEntryIds,
        entryTypes: testEntries.map(e => e.entry_type)
      }
    });

    console.log(`  📊 Added ${successCount}/${testEntries.length} entries successfully`);
  }

  // Test 3: Get Contact History
  private async testGetContactHistory(): Promise<void> {
    console.log("\n📝 Test 3: Get Contact History");
    
    if (!this.testContactId) {
      console.log("  ⚠️ Skipping - no test contact available");
      return;
    }

    try {
      // Test full history
      const { result: fullResult, duration: fullDuration, timestamp } = await this.callTool("get_contact_history", {
        contact_id: this.testContactId
      });
      
      const fullResponseText = fullResult.content[0].text;
      const fullEntryCount = (fullResponseText.match(/•/g) || []).length;
      const expectedEntries = this.testEntryIds.length;
      const fullHistorySuccess = fullEntryCount >= expectedEntries;

      console.log(`  📚 Full history: ${fullEntryCount} entries (expected at least ${expectedEntries})`);

      // Test limited history
      const { result: limitedResult, duration: limitedDuration } = await this.callTool("get_contact_history", {
        contact_id: this.testContactId,
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
          contactId: this.testContactId,
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

  // Test 4: Get Recent Activities
  private async testGetRecentActivities(): Promise<void> {
    console.log("\n📝 Test 4: Get Recent Activities");
    
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

      // Check if our test contact appears in recent activities
      const testContactInRecent = defaultResponseText.includes("Sarah Wilson") || 
                                 customResponseText.includes("Sarah Wilson");

      this.reporter.addResult({
        testName: "Get Recent Activities",
        success: defaultSuccess && customSuccess && testContactInRecent,
        duration: defaultDuration + customDuration,
        timestamp,
        data: { 
          defaultActivityCount,
          customActivityCount,
          testContactInRecent,
          expectedTestContactEntries: this.testEntryIds.length,
          defaultResponse: defaultResponseText,
          customResponse: customResponseText
        }
      });

      console.log(`  📊 Test contact in recent activities: ${testContactInRecent ? 'Yes' : 'No'}`);
      
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