#!/usr/bin/env node

import { TestDatabaseManager } from "./client/test-utilities.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testDatabaseIsolation() {
  console.log("🧪 Testing Database Isolation");
  console.log("=" .repeat(50));

  const dbManager = new TestDatabaseManager("isolation-test");
  let client: Client | null = null;
  let transport: StdioClientTransport | null = null;

  try {
    // Setup test database
    const testDbPath = await dbManager.setupTestDatabase();
    console.log(`📁 Test database created: ${testDbPath}`);

    // Connect to CRM server with test database
    const serverPath = path.join(__dirname, "..", "..", "build", "crm-server.js");
    
    client = new Client({
      name: "isolation-test-client",
      version: "1.0.0"
    });

    transport = new StdioClientTransport({
      command: "node",
      args: [serverPath, `--db-path=${testDbPath}`]
    });

    console.log(`🔍 Command line arguments:`, ["node", serverPath, `--db-path=${testDbPath}`]);

    await client.connect(transport);
    console.log("✅ Connected to CRM server with test database");

    // Add a test contact
    const result = await client.callTool({
      name: "add_contact",
      arguments: {
        name: "Test Isolation Contact",
        organization: "Isolation Test Corp",
        email: "test@isolation.com"
      }
    });

    console.log("📝 Added test contact to isolated database");
    console.log(`   Response: ${(result.content as any)[0].text.substring(0, 100)}...`);

    // List contacts to verify it's in the test database
    const listResult = await client.callTool({
      name: "list_contacts",
      arguments: {}
    });

    const contactCount = ((listResult.content as any)[0].text.match(/•/g) || []).length;
    console.log(`📋 Found ${contactCount} contact(s) in test database`);

    if (contactCount === 1) {
      console.log("✅ Database isolation working correctly!");
    } else {
      console.log("❌ Database isolation may not be working - unexpected contact count");
    }

  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    // Cleanup
    if (transport) {
      await transport.close();
      console.log("🔌 Disconnected from CRM server");
    }

    await dbManager.cleanupTestDatabase();
    console.log("🗑️ Test database cleaned up");
  }

  console.log("\n🎉 Database isolation test completed!");
}

// Run the test
testDatabaseIsolation().catch(console.error); 