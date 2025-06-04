#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { TestReporter, TestResult, TestDataGenerator, TestValidator, TestDatabaseManager } from "../client/test-utilities.js";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ContactManagementTests {
  private client: Client;
  private transport?: StdioClientTransport;
  private reporter: TestReporter;
  private testContactIds: number[] = [];
  private dbManager: TestDatabaseManager;

  constructor() {
    this.client = new Client({
      name: "crm-contact-test-client",
      version: "1.0.0"
    });
    this.reporter = new TestReporter();
    this.dbManager = new TestDatabaseManager("contact-management");
  }

  async runAllTests(): Promise<void> {
    console.log("🧪 Starting Contact Management Tests");
    console.log("=" .repeat(60));
    
    this.reporter.startReport();

    try {
      // Setup test database
      const testDbPath = await this.dbManager.setupTestDatabase();
      
      // Setup
      await this.connect(testDbPath);
      
      // B1: Contact Management Tools (7 tools)
      await this.testAddContact();
      await this.testAddMultipleContacts();
      await this.testListContacts();
      await this.testGetContactDetails();
      await this.testSearchContacts();
      await this.testListContactsByOrganization();
      await this.testUpdateContact();
      await this.testArchiveContact();
      
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
    this.reporter.saveReport(report, `contact-management-test-${timestamp}.json`);
  }

  private async connect(testDbPath: string): Promise<void> {
    const serverPath = path.join(__dirname, "..", "..", "build", "crm-server.js");
    
    this.transport = new StdioClientTransport({
      command: "node",
      args: [serverPath, `--db-path=${testDbPath}`]
    });
    
    await this.client.connect(this.transport);
    console.log("✅ Connected to CRM server for testing with test database");
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

  // Test 1: Add Contact (Basic)
  private async testAddContact(): Promise<void> {
    console.log("\n📝 Test 1: Add Contact (Basic)");
    
    try {
      const { result, duration, timestamp } = await this.callTool("add_contact", {
        name: "John Doe",
        organization: "TechCorp Inc",
        job_title: "Senior Software Engineer",
        email: "john.doe@techcorp.com",
        phone: "+1-555-0101",
        notes: "Met at tech conference 2024"
      });

      // Extract contact ID from response
      const responseText = result.content[0].text;
      const idMatch = responseText.match(/with ID (\d+)/);
      const contactId = idMatch ? parseInt(idMatch[1]) : null;
      
      if (contactId) {
        this.testContactIds.push(contactId);
      }

      this.reporter.addResult({
        testName: "Add Contact - Basic",
        success: responseText.includes("Successfully added"),
        duration,
        timestamp,
        data: { contactId, response: responseText }
      });

      console.log(contactId ? `  ✅ Contact added with ID: ${contactId}` : "  ❌ Failed to extract contact ID");
      
    } catch (error) {
      this.reporter.addResult({
        testName: "Add Contact - Basic",
        success: false,
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      console.error("  ❌ Test failed:", error);
    }
  }

  // Test 2: Add Multiple Contacts
  private async testAddMultipleContacts(): Promise<void> {
    console.log("\n📝 Test 2: Add Multiple Contacts");
    
    const testContacts = [
      {
        name: "Alice Smith",
        organization: "StartupXYZ",
        job_title: "CTO",
        email: "alice@startupxyz.com",
        phone: "+1-555-0102"
      },
      {
        name: "Bob Johnson", 
        organization: "TechCorp Inc",
        job_title: "Product Manager",
        email: "bob.johnson@techcorp.com",
        phone: "+1-555-0103"
      },
      {
        name: "Carol Davis",
        organization: "InnovateCo",
        job_title: "CEO",
        email: "carol@innovateco.com",
        notes: "Potential partnership opportunity"
      }
    ];

    let successCount = 0;
    let totalDuration = 0;

    for (const contact of testContacts) {
      try {
        const { result, duration } = await this.callTool("add_contact", contact);
        const responseText = result.content[0].text;
        const idMatch = responseText.match(/with ID (\d+)/);
        const contactId = idMatch ? parseInt(idMatch[1]) : null;
        
        if (contactId) {
          this.testContactIds.push(contactId);
          successCount++;
        }
        
        totalDuration += duration;
        console.log(`  📝 Added ${contact.name}: ${contactId ? `ID ${contactId}` : 'Failed'}`);
        
      } catch (error) {
        console.error(`  ❌ Failed to add ${contact.name}:`, error);
      }
    }

    this.reporter.addResult({
      testName: "Add Multiple Contacts",
      success: successCount === testContacts.length,
      duration: totalDuration,
      timestamp: new Date().toISOString(),
      data: { 
        contactsAdded: successCount,
        totalContacts: testContacts.length,
        contactIds: this.testContactIds
      }
    });

    console.log(`  📊 Added ${successCount}/${testContacts.length} contacts successfully`);
  }

  // Test 3: List Contacts
  private async testListContacts(): Promise<void> {
    console.log("\n📝 Test 3: List Contacts");
    
    try {
      const { result, duration, timestamp } = await this.callTool("list_contacts", {});
      const responseText = result.content[0].text;
      const contactCount = (responseText.match(/•/g) || []).length;

      this.reporter.addResult({
        testName: "List Contacts",
        success: contactCount >= this.testContactIds.length,
        duration,
        timestamp,
        data: { 
          contactsFound: contactCount,
          expectedMinimum: this.testContactIds.length,
          response: responseText
        }
      });

      console.log(`  📋 Found ${contactCount} contacts (expected at least ${this.testContactIds.length})`);
      
    } catch (error) {
      this.reporter.addResult({
        testName: "List Contacts",
        success: false,
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      console.error("  ❌ Test failed:", error);
    }
  }

  // Test 4: Get Contact Details
  private async testGetContactDetails(): Promise<void> {
    console.log("\n📝 Test 4: Get Contact Details");
    
    if (this.testContactIds.length === 0) {
      console.log("  ⚠️ Skipping - no contact IDs available");
      return;
    }

    const testContactId = this.testContactIds[0];

    try {
      const { result, duration, timestamp } = await this.callTool("get_contact_details", {
        id: testContactId
      });
      
      const responseText = result.content[0].text;
      const hasContactData = responseText.includes('"id":') && responseText.includes('"name":');

      this.reporter.addResult({
        testName: "Get Contact Details",
        success: hasContactData,
        duration,
        timestamp,
        data: { 
          contactId: testContactId,
          hasValidData: hasContactData,
          response: responseText
        }
      });

      console.log(`  📄 Contact details for ID ${testContactId}: ${hasContactData ? 'Success' : 'Failed'}`);
      
    } catch (error) {
      this.reporter.addResult({
        testName: "Get Contact Details",
        success: false,
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      console.error("  ❌ Test failed:", error);
    }
  }

  // Test 5: Search Contacts
  private async testSearchContacts(): Promise<void> {
    console.log("\n📝 Test 5: Search Contacts");
    
    const searchQueries = [
      { query: "TechCorp", expectedMin: 2, description: "organization search" },
      { query: "John", expectedMin: 1, description: "name search" },
      { query: "CTO", expectedMin: 1, description: "job title search" },
      { query: "nonexistent", expectedMin: 0, description: "no results search" }
    ];

    let successCount = 0;
    let totalDuration = 0;

    for (const search of searchQueries) {
      try {
        const { result, duration } = await this.callTool("search_contacts", {
          query: search.query
        });
        
        const responseText = result.content[0].text;
        const contactCount = (responseText.match(/•/g) || []).length;
        const success = search.expectedMin === 0 ? 
          responseText.includes("No contacts found") :
          contactCount >= search.expectedMin;

        if (success) successCount++;
        totalDuration += duration;

        console.log(`  🔍 Search "${search.query}" (${search.description}): ${contactCount} results`);
        
      } catch (error) {
        console.error(`  ❌ Search "${search.query}" failed:`, error);
      }
    }

    this.reporter.addResult({
      testName: "Search Contacts",
      success: successCount === searchQueries.length,
      duration: totalDuration,
      timestamp: new Date().toISOString(),
      data: { 
        searchesSuccessful: successCount,
        totalSearches: searchQueries.length,
        queries: searchQueries
      }
    });

    console.log(`  📊 ${successCount}/${searchQueries.length} search queries successful`);
  }

  // Test 6: List Contacts by Organization
  private async testListContactsByOrganization(): Promise<void> {
    console.log("\n📝 Test 6: List Contacts by Organization");
    
    try {
      const { result, duration, timestamp } = await this.callTool("list_contacts_by_organization", {
        organization: "TechCorp"
      });
      
      const responseText = result.content[0].text;
      const contactCount = (responseText.match(/•/g) || []).length;
      const success = contactCount >= 2; // We added 2 TechCorp contacts

      this.reporter.addResult({
        testName: "List Contacts by Organization",
        success,
        duration,
        timestamp,
        data: { 
          organization: "TechCorp",
          contactsFound: contactCount,
          expectedMinimum: 2,
          response: responseText
        }
      });

      console.log(`  🏢 TechCorp contacts found: ${contactCount} (expected at least 2)`);
      
    } catch (error) {
      this.reporter.addResult({
        testName: "List Contacts by Organization",
        success: false,
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      console.error("  ❌ Test failed:", error);
    }
  }

  // Test 7: Update Contact
  private async testUpdateContact(): Promise<void> {
    console.log("\n📝 Test 7: Update Contact");
    
    if (this.testContactIds.length === 0) {
      console.log("  ⚠️ Skipping - no contact IDs available");
      return;
    }

    const testContactId = this.testContactIds[0];

    try {
      const { result, duration, timestamp } = await this.callTool("update_contact", {
        id: testContactId,
        job_title: "Lead Software Engineer",
        notes: "Updated during testing - promoted to lead role"
      });
      
      const responseText = result.content[0].text;
      const success = responseText.includes("Successfully updated");

      this.reporter.addResult({
        testName: "Update Contact",
        success,
        duration,
        timestamp,
        data: { 
          contactId: testContactId,
          fieldsUpdated: ["job_title", "notes"],
          response: responseText
        }
      });

      console.log(`  ✏️ Update contact ID ${testContactId}: ${success ? 'Success' : 'Failed'}`);
      
    } catch (error) {
      this.reporter.addResult({
        testName: "Update Contact",
        success: false,
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      console.error("  ❌ Test failed:", error);
    }
  }

  // Test 8: Archive Contact
  private async testArchiveContact(): Promise<void> {
    console.log("\n📝 Test 8: Archive Contact");
    
    if (this.testContactIds.length === 0) {
      console.log("  ⚠️ Skipping - no contact IDs available");
      return;
    }

    // Use the last contact ID to avoid disrupting other tests
    const testContactId = this.testContactIds[this.testContactIds.length - 1];

    try {
      const { result, duration, timestamp } = await this.callTool("archive_contact", {
        id: testContactId
      });
      
      const responseText = result.content[0].text;
      const success = responseText.includes("Successfully archived");

      this.reporter.addResult({
        testName: "Archive Contact",
        success,
        duration,
        timestamp,
        data: { 
          contactId: testContactId,
          response: responseText
        }
      });

      console.log(`  🗄️ Archive contact ID ${testContactId}: ${success ? 'Success' : 'Failed'}`);
      
    } catch (error) {
      this.reporter.addResult({
        testName: "Archive Contact",
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
  const tests = new ContactManagementTests();
  tests.runAllTests()
    .then(() => {
      console.log("\n🎉 Contact Management tests completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Contact Management tests failed:", error);
      process.exit(1);
    });
} 