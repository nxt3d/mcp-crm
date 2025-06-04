#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { TestReporter, TestResult, DEFAULT_TEST_CONFIG } from "./client/test-utilities.js";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BasicConnectionTest {
  private client: Client;
  private transport?: StdioClientTransport;
  private reporter: TestReporter;

  constructor() {
    this.client = new Client({
      name: "crm-basic-test-client",
      version: "1.0.0"
    });
    this.reporter = new TestReporter();
  }

  async runTests(): Promise<void> {
    console.log("🧪 Starting Basic Connection Tests for CRM Server");
    console.log("=" .repeat(60));
    
    this.reporter.startReport();

    // Test 1: Server Connection
    await this.testConnection();
    
    // Test 2: Tool Discovery
    await this.testToolDiscovery();
    
    // Test 3: Basic Tool Call
    await this.testBasicToolCall();
    
    // Test 4: Disconnect
    await this.testDisconnection();

    // Generate report
    const report = this.reporter.generateReport();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.reporter.saveReport(report, `basic-connection-test-${timestamp}.json`);
  }

  private async testConnection(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log("\n🔌 Test 1: Server Connection");
      
      // Use absolute path to the CRM server
      const serverPath = path.join(__dirname, "..", "..", "build", "crm-server.js");
      console.log(`  📁 Server path: ${serverPath}`);
      
      this.transport = new StdioClientTransport({
        command: "node",
        args: [serverPath]
      });
      
      await this.client.connect(this.transport);
      
      const duration = Date.now() - startTime;
      
      this.reporter.addResult({
        testName: "Server Connection",
        success: true,
        duration,
        timestamp: new Date().toISOString(),
        data: { connected: true }
      });
      
      console.log("  ✅ Successfully connected to CRM server");
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.reporter.addResult({
        testName: "Server Connection",
        success: false,
        duration,
        error: errorMessage,
        timestamp: new Date().toISOString()
      });
      
      console.error("  ❌ Failed to connect:", errorMessage);
      throw error;
    }
  }

  private async testToolDiscovery(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log("\n🔍 Test 2: Tool Discovery");
      
      const toolsResponse = await this.client.listTools();
      const duration = Date.now() - startTime;
      
      console.log(`  📋 Discovered ${toolsResponse.tools.length} tools:`);
      toolsResponse.tools.forEach(tool => {
        console.log(`    - ${tool.name}: ${tool.description}`);
      });
      
      const expectedTools = [
        'add_contact', 'search_contacts', 'list_contacts', 
        'list_contacts_by_organization', 'get_contact_details',
        'archive_contact', 'update_contact', 'add_contact_entry',
        'get_contact_history', 'get_recent_activities',
        'export_contacts_csv', 'export_contact_history_csv', 'export_full_crm_csv'
      ];
      
      const discoveredToolNames = toolsResponse.tools.map(t => t.name);
      const missingTools = expectedTools.filter(tool => !discoveredToolNames.includes(tool));
      
      if (missingTools.length === 0) {
        this.reporter.addResult({
          testName: "Tool Discovery",
          success: true,
          duration,
          timestamp: new Date().toISOString(),
          data: { 
            toolsDiscovered: toolsResponse.tools.length,
            tools: discoveredToolNames
          }
        });
        console.log("  ✅ All expected tools discovered");
      } else {
        throw new Error(`Missing tools: ${missingTools.join(', ')}`);
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.reporter.addResult({
        testName: "Tool Discovery",
        success: false,
        duration,
        error: errorMessage,
        timestamp: new Date().toISOString()
      });
      
      console.error("  ❌ Tool discovery failed:", errorMessage);
      throw error;
    }
  }

  private async testBasicToolCall(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log("\n🔧 Test 3: Basic Tool Call (list_contacts)");
      
      const result = await this.client.callTool({
        name: "list_contacts",
        arguments: {}
      });
      
      const duration = Date.now() - startTime;
      
      console.log("  📝 Tool call successful");
      console.log("  📊 Result type:", typeof result);
      
      this.reporter.addResult({
        testName: "Basic Tool Call",
        success: true,
        duration,
        timestamp: new Date().toISOString(),
        data: { 
          toolName: "list_contacts",
          resultReceived: true
        }
      });
      
      console.log("  ✅ Basic tool call working");
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.reporter.addResult({
        testName: "Basic Tool Call",
        success: false,
        duration,
        error: errorMessage,
        timestamp: new Date().toISOString()
      });
      
      console.error("  ❌ Basic tool call failed:", errorMessage);
      throw error;
    }
  }

  private async testDisconnection(): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log("\n🔌 Test 4: Disconnection");
      
      if (this.transport) {
        await this.transport.close();
      }
      
      const duration = Date.now() - startTime;
      
      this.reporter.addResult({
        testName: "Disconnection",
        success: true,
        duration,
        timestamp: new Date().toISOString(),
        data: { disconnected: true }
      });
      
      console.log("  ✅ Successfully disconnected");
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.reporter.addResult({
        testName: "Disconnection",
        success: false,
        duration,
        error: errorMessage,
        timestamp: new Date().toISOString()
      });
      
      console.error("  ❌ Disconnection failed:", errorMessage);
    }
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new BasicConnectionTest();
  test.runTests()
    .then(() => {
      console.log("\n🎉 Basic connection tests completed!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Basic connection tests failed:", error);
      process.exit(1);
    });
} 