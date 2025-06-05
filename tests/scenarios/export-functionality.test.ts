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
          content: "Testing export functionality with call data",
          interaction_date: "2024-01-15T10:00:00Z"
        },
        {
          contact_id: this.testContactIds[0],
          entry_type: "email",
          subject: "Export test email",
          content: "Testing export functionality with email data",
          interaction_date: "2024-01-16T14:30:00Z"
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
      const activeExportSuccess = this.isExportSuccessful(activeResponseText);
      const activeFileInfo = this.extractFileInfo(activeResponseText);
      const activeHasFilename = !!activeFileInfo.filename;
      const activeHasPath = !!activeFileInfo.path;
      const activeHasSize = !!activeFileInfo.size && activeFileInfo.size > 0;

      console.log(`  📄 Active contacts CSV export: ${activeExportSuccess ? 'Success' : 'Failed'}`);
      console.log(`  📄 Filename provided: ${activeHasFilename ? 'Yes' : 'No'}`);
      console.log(`  📄 File path provided: ${activeHasPath ? 'Yes' : 'No'}`);
      console.log(`  📄 File size provided: ${activeHasSize ? 'Yes' : 'No'}`);

      // Test with archived contacts
      const { result: archivedResult, duration: archivedDuration } = await this.callTool("export_contacts_csv", {
        include_archived: true
      });
      
      const archivedResponseText = archivedResult.content[0].text;
      const archivedExportSuccess = this.isExportSuccessful(archivedResponseText);
      const archivedFileInfo = this.extractFileInfo(archivedResponseText);
      const archivedHasFilename = !!archivedFileInfo.filename;
      const archivedHasPath = !!archivedFileInfo.path;
      const archivedHasSize = !!archivedFileInfo.size && archivedFileInfo.size > 0;

      console.log(`  📄 All contacts CSV export (with archived): ${archivedExportSuccess ? 'Success' : 'Failed'}`);

      this.reporter.addResult({
        testName: "Export Contacts CSV",
        success: activeExportSuccess && activeHasFilename && activeHasPath && activeHasSize && 
                archivedExportSuccess && archivedHasFilename && archivedHasPath && archivedHasSize,
        duration: activeDuration + archivedDuration,
        timestamp,
        data: { 
          activeExportSuccess,
          archivedExportSuccess,
          activeHasFilename,
          archivedHasFilename,
          activeHasPath,
          archivedHasPath,
          activeHasSize,
          archivedHasSize,
          activeFileSize: activeFileInfo.size,
          archivedFileSize: archivedFileInfo.size
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
      const specificExportSuccess = this.isExportSuccessful(specificResponseText);
      const specificFileInfo = this.extractFileInfo(specificResponseText);
      const specificHasFilename = !!specificFileInfo.filename;
      const specificHasPath = !!specificFileInfo.path;
      const specificHasSize = !!specificFileInfo.size && specificFileInfo.size > 0;

      console.log(`  📄 Specific contact history export: ${specificExportSuccess ? 'Success' : 'Failed'}`);
      console.log(`  📄 Filename provided: ${specificHasFilename ? 'Yes' : 'No'}`);
      console.log(`  📄 File path provided: ${specificHasPath ? 'Yes' : 'No'}`);
      console.log(`  📄 File size provided: ${specificHasSize ? 'Yes' : 'No'}`);

      // Test all contact history
      const { result: allResult, duration: allDuration } = await this.callTool("export_contact_history_csv", {});
      
      const allResponseText = allResult.content[0].text;
      const allExportSuccess = this.isExportSuccessful(allResponseText);
      const allFileInfo = this.extractFileInfo(allResponseText);
      const allHasFilename = !!allFileInfo.filename;
      const allHasPath = !!allFileInfo.path;
      const allHasSize = !!allFileInfo.size && allFileInfo.size > 0;

      console.log(`  📄 All contact history export: ${allExportSuccess ? 'Success' : 'Failed'}`);

      this.reporter.addResult({
        testName: "Export Contact History CSV",
        success: specificExportSuccess && specificHasFilename && specificHasPath && specificHasSize && 
                allExportSuccess && allHasFilename && allHasPath && allHasSize,
        duration: specificDuration + allDuration,
        timestamp,
        data: { 
          specificContactId: testContactId,
          specificExportSuccess,
          allExportSuccess,
          specificHasFilename,
          allHasFilename,
          specificHasPath,
          allHasPath,
          specificHasSize,
          allHasSize,
          specificFileSize: specificFileInfo.size,
          allFileSize: allFileInfo.size
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
      const exportSuccess = this.isExportSuccessful(responseText);
      const fileInfo = this.extractFileInfo(responseText);
      const hasFilename = !!fileInfo.filename;
      const hasPath = !!fileInfo.path;
      const hasSize = !!fileInfo.size && fileInfo.size > 0;
      const isFullCrmExport = responseText.includes("Full CRM CSV Export Saved:");
      const includesArchivedNote = responseText.includes("All contacts (including archived)");

      console.log(`  📄 Full CRM export: ${exportSuccess ? 'Success' : 'Failed'}`);
      console.log(`  📄 Filename provided: ${hasFilename ? 'Yes' : 'No'}`);
      console.log(`  📄 File path provided: ${hasPath ? 'Yes' : 'No'}`);
      console.log(`  📄 File size provided: ${hasSize ? 'Yes' : 'No'}`);
      console.log(`  📄 Full CRM export identified: ${isFullCrmExport ? 'Yes' : 'No'}`);
      console.log(`  📄 Includes archived note: ${includesArchivedNote ? 'Yes' : 'No'}`);

      this.reporter.addResult({
        testName: "Export Full CRM CSV",
        success: exportSuccess && hasFilename && hasPath && hasSize && isFullCrmExport && includesArchivedNote,
        duration,
        timestamp,
        data: { 
          exportSuccess,
          hasFilename,
          hasPath,
          hasSize,
          isFullCrmExport,
          includesArchivedNote,
          fileSize: fileInfo.size,
          filename: fileInfo.filename
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

  // Helper method to check if export was successful based on file metadata
  private isExportSuccessful(responseText: string): boolean {
    return responseText.includes("CSV Export Saved:") || 
           responseText.includes("Contact History CSV Export Saved:") ||
           responseText.includes("Full CRM CSV Export Saved:");
  }

  // Helper method to extract file information from export response
  private extractFileInfo(responseText: string): { filename?: string; path?: string; size?: number } {
    const info: { filename?: string; path?: string; size?: number } = {};
    
    const filenameMatch = responseText.match(/Filename: (.+)/);
    if (filenameMatch) info.filename = filenameMatch[1];
    
    const pathMatch = responseText.match(/Path: (.+)/);
    if (pathMatch) info.path = pathMatch[1];
    
    const sizeMatch = responseText.match(/Size: (\d+) characters/);
    if (sizeMatch) info.size = parseInt(sizeMatch[1]);
    
    return info;
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