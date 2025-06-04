import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";

export interface TestResult {
  success: boolean;
  toolName: string;
  duration: number;
  result?: any;
  error?: string;
  timestamp: string;
}

export interface ConnectionInfo {
  connected: boolean;
  serverName?: string;
  serverVersion?: string;
  toolsDiscovered: number;
  tools: Tool[];
}

export class CRMTestClient {
  private client: Client;
  private transport?: StdioClientTransport;
  private connected: boolean = false;
  private connectionInfo: ConnectionInfo = {
    connected: false,
    toolsDiscovered: 0,
    tools: []
  };

  constructor() {
    this.client = new Client({
      name: "crm-test-client",
      version: "1.0.0"
    });
  }

  /**
   * Connect to the CRM server
   */
  async connect(): Promise<ConnectionInfo> {
    try {
      console.log("🔌 Connecting to CRM server...");
      
      this.transport = new StdioClientTransport({
        command: "node",
        args: ["./build/crm-server.js"]
      });
      
      await this.client.connect(this.transport);
      this.connected = true;
      
      // Get server info
      const serverInfo = await this.client.getServerCapabilities();
      console.log("📋 Server capabilities:", serverInfo);
      
      // Discover available tools
      const toolsResponse = await this.client.listTools();
      
      this.connectionInfo = {
        connected: true,
        serverName: "CRM Server",
        serverVersion: "1.0.0",
        toolsDiscovered: toolsResponse.tools.length,
        tools: toolsResponse.tools
      };
      
      console.log(`✅ Connected! Discovered ${toolsResponse.tools.length} tools:`);
      toolsResponse.tools.forEach(tool => {
        console.log(`  - ${tool.name}: ${tool.description}`);
      });
      
      return this.connectionInfo;
    } catch (error) {
      console.error("❌ Connection failed:", error);
      this.connected = false;
      this.connectionInfo.connected = false;
      throw error;
    }
  }

  /**
   * Disconnect from the CRM server
   */
  async disconnect(): Promise<void> {
    if (this.connected && this.transport) {
      await this.transport.close();
      this.connected = false;
      this.connectionInfo.connected = false;
      console.log("🔌 Disconnected from CRM server");
    }
  }

  /**
   * Call a specific tool with arguments and measure performance
   */
  async callTool(name: string, args: any = {}): Promise<TestResult> {
    if (!this.connected) {
      throw new Error("Client not connected. Call connect() first.");
    }

    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    try {
      console.log(`🔧 Calling tool: ${name}`, args);
      
      const result = await this.client.callTool({
        name,
        arguments: args
      });
      
      const duration = Date.now() - startTime;
      
      const testResult: TestResult = {
        success: true,
        toolName: name,
        duration,
        result: JSON.parse(JSON.stringify(result)),
        timestamp
      };
      
      console.log(`✅ Tool ${name} completed in ${duration}ms`);
      return testResult;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      const testResult: TestResult = {
        success: false,
        toolName: name,
        duration,
        error: errorMessage,
        timestamp
      };
      
      console.error(`❌ Tool ${name} failed in ${duration}ms:`, errorMessage);
      return testResult;
    }
  }

  /**
   * Test all available tools with basic validation
   */
  async testAllTools(): Promise<TestResult[]> {
    const results: TestResult[] = [];
    
    console.log("🧪 Testing all available tools...");
    
    for (const tool of this.connectionInfo.tools) {
      try {
        // Use minimal required arguments for each tool
        const args = this.getMinimalArgs(tool.name);
        const result = await this.callTool(tool.name, args);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          toolName: tool.name,
          duration: 0,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString()
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    console.log(`📊 Tool testing complete: ${successCount}/${results.length} tools successful`);
    
    return results;
  }

  /**
   * Get minimal required arguments for testing each tool
   */
  private getMinimalArgs(toolName: string): any {
    switch (toolName) {
      case 'add_contact':
        return { name: "Test Contact" };
      
      case 'search_contacts':
        return { query: "test" };
      
      case 'list_contacts':
        return {};
      
      case 'list_contacts_by_organization':
        return { organization: "Test Org" };
      
      case 'get_contact_details':
        return { id: 1 };
      
      case 'archive_contact':
        return { id: 1 };
      
      case 'update_contact':
        return { id: 1, name: "Updated Test Contact" };
      
      case 'add_contact_entry':
        return { 
          contact_id: 1, 
          entry_type: "note", 
          content: "Test entry" 
        };
      
      case 'get_contact_history':
        return { contact_id: 1 };
      
      case 'get_recent_activities':
        return {};
      
      case 'export_contacts_csv':
        return {};
      
      case 'export_contact_history_csv':
        return { contact_id: 1 };
      
      case 'export_full_crm_csv':
        return {};
      
      default:
        return {};
    }
  }

  /**
   * Get connection status and info
   */
  getConnectionInfo(): ConnectionInfo {
    return this.connectionInfo;
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get list of available tools
   */
  getAvailableTools(): Tool[] {
    return this.connectionInfo.tools;
  }
}