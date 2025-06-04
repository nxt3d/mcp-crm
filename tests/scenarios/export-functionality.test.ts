#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { TestReporter, TestResult, TestDataGenerator, TestValidator, TestDatabaseManager } from "../client/test-utilities.js";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ExportFunctionalityTests {
  private client: Client;
  private transport?: StdioClientTransport;
  private reporter: TestReporter;
  private testContactIds: number[] = [];
  private dbManager: TestDatabaseManager;

  constructor() {
    this.client = new Client({
      name: "crm-export-test-client",
      version: "1.0.0"
    });
    this.reporter = new TestReporter();
    this.dbManager = new TestDatabaseManager("export-functionality");
  }

  async runAllTests(): Promise<void> {
    console.log("🧪 Starting Export Functionality Tests");
    console.log("=" .repeat(60));
    
    this.reporter.startReport();

    try {
      // Setup test database
      const testDbPath = await this.dbManager.setupTestDatabase();
      
      // Setup
      await this.connect(testDbPath);
      
      // B3: Export Functionality Tests
      await this.setupTestData();
      await this.testExportContactsCSV();
      await this.testExportContactHistoryCSV();
      await this.testExportFullCRMCSV();
      
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
    this.reporter.saveReport(report, `export-functionality-test-${timestamp}.json`);
  }

  private async connect(testDbPath: string): Promise<void> {
    const serverPath = path.join(__dirname, "..", "..", "build", "crm-server.js");
    
    this.transport = new StdioClientTransport({
      command: "node",
      args: [serverPath, `--db-path=${testDbPath}`]
    });
    
    await this.client.connect(this.transport);
    console.log("✅ Connected to CRM server for export testing with test database");
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

  // Setup: Create test data for export testing
  private async setupTestData(): Promise<void> {
    console.log("\n🔧 Setup: Creating test data for export testing");
    
    const testContacts = [
      {
        name: "Export Test User 1",
        organization: "ExportCorp",
        job_title: "Data Manager",
        email: "export1@exportcorp.com",
        phone: "+1-555-0301",
        telegram: "@export_user1",
        x_account: "@ExportUser1",
        notes: "Test contact for export validation"
      },
      {
        name: "Export Test User 2", 
        organization: "ExportCorp",
        job_title: "Analytics Lead",
        email: "export2@exportcorp.com",
        phone: "+1-555-0302",
        telegram: "@export_user2",
        x_account: "@ExportUser2",
        notes: "Second test contact for export validation"
      }
    ];

    // Add test contacts
    for (const contact of testContacts) {
      try {
        const { result } = await this.callTool("add_contact", contact);
        const responseText = result.content[0].text;
        const idMatch = responseText.match(/with ID (\d+)/);
        const contactId = idMatch ? parseInt(idMatch[1]) : null;
        
        if (contactId) {
          this.testContactIds.push(contactId);
          console.log(`  ✅ Created test contact: ${contact.name} (ID: ${contactId})`);
        }
        
      } catch (error) {
        console.error(`  ❌ Failed to create test contact ${contact.name}:`, error);
      }
    }

    // Add some history entries for export testing
    if (this.testContactIds.length > 0) {
      const historyEntries = [
        {
          contact_id: this.testContactIds[0],
          entry_type: "call",
          subject: "Export test call",
          content: "Testing export functionality with call data"
        },
        {
          contact_id: this.testContactIds[0],
          entry_type: "email",
          subject: "Export test email",
          content: "Testing export functionality with email data"
        }
      ];

      for (const entry of historyEntries) {
        try {
          await this.callTool("add_contact_entry", entry);
          console.log(`  ✅ Created history entry: ${entry.entry_type} for contact ${entry.contact_id}`);
        } catch (error) {
          console.error(`  ❌ Failed to create history entry:`, error);
        }
      }
    }

    console.log(`  📊 Setup complete: ${this.testContactIds.length} contacts with history data`);
  }

  // Test 1: Export Contacts CSV
  private async testExportContactsCSV(): Promise<void> {
    console.log("\n📝 Test 1: Export Contacts CSV");
    
    try {
      // Test without archived contacts
      const { result: activeResult, duration: activeDuration, timestamp } = await this.callTool("export_contacts_csv", {
        include_archived: false
      });
      
      const activeResponseText = activeResult.content[0].text;
      const activeCsvContent = this.extractCsvContent(activeResponseText);
      const activeValidCsv = TestValidator.validateCSVContent(activeCsvContent);
      const activeHasHeaders = activeCsvContent.includes("ID,Name,Organization") && 
                              activeCsvContent.includes("Telegram") && 
                              activeCsvContent.includes("X Account");
      const activeHasTestData = activeCsvContent.includes("ExportCorp");
      const activeHasNewFieldData = activeCsvContent.includes("@export_user1") && 
                                   activeCsvContent.includes("@ExportUser1");

      console.log(`  📄 Active contacts CSV: ${activeValidCsv ? 'Valid' : 'Invalid'}`);
      console.log(`  📄 Headers present (incl. new fields): ${activeHasHeaders ? 'Yes' : 'No'}`);
      console.log(`  📄 Test data present: ${activeHasTestData ? 'Yes' : 'No'}`);
      console.log(`  📄 New field data present: ${activeHasNewFieldData ? 'Yes' : 'No'}`);

      // Test with archived contacts
      const { result: archivedResult, duration: archivedDuration } = await this.callTool("export_contacts_csv", {
        include_archived: true
      });
      
      const archivedResponseText = archivedResult.content[0].text;
      const archivedCsvContent = this.extractCsvContent(archivedResponseText);
      const archivedValidCsv = TestValidator.validateCSVContent(archivedCsvContent);
      const archivedHasHeaders = archivedCsvContent.includes("ID,Name,Organization") && 
                                archivedCsvContent.includes("Telegram") && 
                                archivedCsvContent.includes("X Account");

      console.log(`  📄 All contacts CSV (with archived): ${archivedValidCsv ? 'Valid' : 'Invalid'}`);

      this.reporter.addResult({
        testName: "Export Contacts CSV",
        success: activeValidCsv && activeHasHeaders && activeHasTestData && activeHasNewFieldData && 
                archivedValidCsv && archivedHasHeaders,
        duration: activeDuration + archivedDuration,
        timestamp,
        data: { 
          activeContactsValid: activeValidCsv,
          archivedContactsValid: archivedValidCsv,
          activeHasHeaders: activeHasHeaders,
          archivedHasHeaders: archivedHasHeaders,
          testDataPresent: activeHasTestData,
          newFieldDataPresent: activeHasNewFieldData,
          activeCsvLength: activeCsvContent.length,
          archivedCsvLength: archivedCsvContent.length
        }
      });
      
    } catch (error) {
      this.reporter.addResult({
        testName: "Export Contacts CSV",
        success: false,
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      console.error("  ❌ Test failed:", error);
    }
  }

  // Test 2: Export Contact History CSV
  private async testExportContactHistoryCSV(): Promise<void> {
    console.log("\n📝 Test 2: Export Contact History CSV");
    
    if (this.testContactIds.length === 0) {
      console.log("  ⚠️ Skipping - no test contacts available");
      return;
    }

    try {
      // Test specific contact history
      const testContactId = this.testContactIds[0];
      const { result: specificResult, duration: specificDuration, timestamp } = await this.callTool("export_contact_history_csv", {
        contact_id: testContactId
      });
      
      const specificResponseText = specificResult.content[0].text;
      const specificCsvContent = this.extractCsvContent(specificResponseText);
      const specificValidCsv = TestValidator.validateCSVContent(specificCsvContent);
      const specificHasHeaders = specificCsvContent.includes("Entry ID,Contact Name,Entry Type");
      const specificHasTestData = specificCsvContent.includes("Export test");

      console.log(`  📄 Specific contact history CSV: ${specificValidCsv ? 'Valid' : 'Invalid'}`);
      console.log(`  📄 Headers present: ${specificHasHeaders ? 'Yes' : 'No'}`);
      console.log(`  📄 Test data present: ${specificHasTestData ? 'Yes' : 'No'}`);

      // Test all contact history
      const { result: allResult, duration: allDuration } = await this.callTool("export_contact_history_csv", {});
      
      const allResponseText = allResult.content[0].text;
      const allCsvContent = this.extractCsvContent(allResponseText);
      const allValidCsv = TestValidator.validateCSVContent(allCsvContent);
      const allHasHeaders = allCsvContent.includes("Entry ID,Contact Name,Entry Type");

      console.log(`  📄 All contact history CSV: ${allValidCsv ? 'Valid' : 'Invalid'}`);

      this.reporter.addResult({
        testName: "Export Contact History CSV",
        success: specificValidCsv && specificHasHeaders && specificHasTestData && allValidCsv && allHasHeaders,
        duration: specificDuration + allDuration,
        timestamp,
        data: { 
          specificContactId: testContactId,
          specificHistoryValid: specificValidCsv,
          allHistoryValid: allValidCsv,
          specificHasHeaders: specificHasHeaders,
          allHasHeaders: allHasHeaders,
          testDataPresent: specificHasTestData,
          specificCsvLength: specificCsvContent.length,
          allCsvLength: allCsvContent.length
        }
      });
      
    } catch (error) {
      this.reporter.addResult({
        testName: "Export Contact History CSV",
        success: false,
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      console.error("  ❌ Test failed:", error);
    }
  }

  // Test 3: Export Full CRM CSV
  private async testExportFullCRMCSV(): Promise<void> {
    console.log("\n📝 Test 3: Export Full CRM CSV");
    
    try {
      const { result, duration, timestamp } = await this.callTool("export_full_crm_csv", {});
      
      const responseText = result.content[0].text;
      const csvContent = this.extractCsvContent(responseText);
      const validCsv = TestValidator.validateCSVContent(csvContent);
      const hasContactsSection = csvContent.includes("=== CONTACTS ===");
      const hasHistorySection = csvContent.includes("=== CONTACT HISTORY ===");
      const hasContactHeaders = csvContent.includes("ID,Name,Organization") && 
                              csvContent.includes("Telegram") && 
                              csvContent.includes("X Account");
      const hasHistoryHeaders = csvContent.includes("Entry ID,Contact Name,Entry Type");
      const hasTestData = csvContent.includes("ExportCorp") && csvContent.includes("Export test");
      const hasNewFieldData = csvContent.includes("@export_user1") && csvContent.includes("@ExportUser1");

      console.log(`  📄 Full CRM CSV: ${validCsv ? 'Valid' : 'Invalid'}`);
      console.log(`  📄 Contacts section: ${hasContactsSection ? 'Present' : 'Missing'}`);
      console.log(`  📄 History section: ${hasHistorySection ? 'Present' : 'Missing'}`);
      console.log(`  📄 Contact headers (incl. new fields): ${hasContactHeaders ? 'Present' : 'Missing'}`);
      console.log(`  📄 History headers: ${hasHistoryHeaders ? 'Present' : 'Missing'}`);
      console.log(`  📄 Test data: ${hasTestData ? 'Present' : 'Missing'}`);
      console.log(`  📄 New field data: ${hasNewFieldData ? 'Present' : 'Missing'}`);

      // Verify both sections have data
      const contactsSection = csvContent.split("=== CONTACT HISTORY ===")[0];
      const historySection = csvContent.split("=== CONTACT HISTORY ===")[1] || "";
      const contactsHasData = contactsSection.split('\n').length > 3; // Header + at least 2 data rows
      const historyHasData = historySection.split('\n').length > 3;

      console.log(`  📄 Contacts data rows: ${contactsHasData ? 'Present' : 'Missing'}`);
      console.log(`  📄 History data rows: ${historyHasData ? 'Present' : 'Missing'}`);

      this.reporter.addResult({
        testName: "Export Full CRM CSV",
        success: validCsv && hasContactsSection && hasHistorySection && hasContactHeaders && 
                hasHistoryHeaders && hasTestData && hasNewFieldData && contactsHasData && historyHasData,
        duration,
        timestamp,
        data: { 
          validCsv,
          hasContactsSection,
          hasHistorySection,
          hasContactHeaders,
          hasHistoryHeaders,
          hasTestData,
          hasNewFieldData,
          contactsHasData,
          historyHasData,
          csvLength: csvContent.length,
          contactsSectionLength: contactsSection.length,
          historySectionLength: historySection.length
        }
      });
      
    } catch (error) {
      this.reporter.addResult({
        testName: "Export Full CRM CSV",
        success: false,
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      console.error("  ❌ Test failed:", error);
    }
  }

  // Helper method to extract CSV content from tool response
  private extractCsvContent(responseText: string): string {
    const csvMatch = responseText.match(/--- CSV Content ---\n([\s\S]*?)$/);
    return csvMatch ? csvMatch[1].trim() : "";
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tests = new ExportFunctionalityTests();
  tests.runAllTests()
    .then(() => {
      console.log("\n🎉 Export Functionality tests completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Export Functionality tests failed:", error);
      process.exit(1);
    });
}