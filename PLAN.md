# 📋 MCP CRM Server Implementation Plan

## 🎯 Project Overview
Building a simple STDIO MCP server in TypeScript for CRM functionality with easy CSV export capabilities.

**Approach**: Incremental development with validation phases before full CRM implementation.

## 🔗 Key References
- **Official MCP TypeScript SDK**: [https://github.com/modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk)
- **MCP Documentation**: [https://modelcontextprotocol.io](https://modelcontextprotocol.io)
- **MCP Specification**: Available in the official docs

## 🏗️ Final Project Structure
```
mcp-crm/
├── src/
│   ├── index.ts           # Main MCP server entry point
│   ├── database/
│   │   ├── db.ts          # Database connection & setup
│   │   └── migrations.ts  # Database schema setup
│   ├── models/
│   │   ├── Contact.ts     # Contact data model
│   │   └── ContactEntry.ts # Contact history entry model
│   ├── services/
│   │   ├── ContactService.ts    # Business logic for contacts
│   │   └── ExportService.ts     # CSV export functionality
│   └── tools/
│       ├── contactTools.ts      # MCP tools for contact operations
│       └── exportTools.ts       # MCP tools for export operations
├── examples/
│   ├── basic-mcp/         # Phase 1: Basic MCP example
│   └── hello-db/          # Phase 2: Hello world database
├── data/
│   └── crm.db            # SQLite database file
├── exports/              # CSV export destination
├── docs/
│   ├── PLAN.md          # This file
│   ├── PROGRESS.md      # Progress tracking
│   └── README.md        # Usage documentation
├── package.json
├── tsconfig.json
└── build/               # Compiled JavaScript output
```

## 💾 Database Design
**Technology Choice: SQLite**
- Lightweight, serverless
- Easy to backup/move
- Excellent CSV export support
- Perfect for single-user CRM

**Schema:**
```sql
-- Contacts table
CREATE TABLE contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  organization TEXT,
  job_title TEXT,
  email TEXT,
  phone TEXT,
  status TEXT DEFAULT 'active', -- 'active' or 'archived'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Contact entries/history table
CREATE TABLE contact_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL,
  entry_date DATE NOT NULL,
  entry_text TEXT NOT NULL,
  entry_type TEXT DEFAULT 'note', -- 'note', 'meeting', 'call', etc.
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contact_id) REFERENCES contacts (id)
);
```

## 🛠️ MCP Tools to Implement (Final CRM)

### Contact Management Tools:
1. **`add_contact`** - Create new contact
   - Parameters: name, organization?, job_title?, email?, phone?
   - Returns: Contact ID and confirmation

2. **`search_contacts`** - Search by name, organization, job title
   - Parameters: query (string), search_type? (name|organization|job_title|all)
   - Returns: Array of matching contacts

3. **`list_contacts`** - List all active contacts
   - Parameters: limit?, offset?, sort_by? (name|organization|created_at)
   - Returns: Paginated list of contacts

4. **`list_contacts_by_organization`** - Group by organization
   - Parameters: organization_filter?
   - Returns: Contacts grouped by organization

5. **`get_contact_details`** - Get full contact info + history
   - Parameters: contact_id
   - Returns: Complete contact info with history entries

6. **`archive_contact`** - Archive a contact
   - Parameters: contact_id
   - Returns: Confirmation

7. **`update_contact`** - Update contact information
   - Parameters: contact_id, updates (partial contact object)
   - Returns: Updated contact

### Contact History Tools:
8. **`add_contact_entry`** - Add history entry with date
   - Parameters: contact_id, entry_text, entry_date, entry_type?
   - Returns: Entry ID and confirmation

9. **`get_contact_history`** - Get all entries for a contact
   - Parameters: contact_id, limit?, date_from?, date_to?
   - Returns: Array of entries

10. **`get_recent_activities`** - Recent entries across all contacts
    - Parameters: days?, limit?
    - Returns: Recent entries across all contacts

### Export Tools:
11. **`export_contacts_csv`** - Export contacts to CSV
    - Parameters: include_archived?, filename?
    - Returns: File path and row count

12. **`export_contact_history_csv`** - Export history to CSV
    - Parameters: contact_id?, date_from?, date_to?, filename?
    - Returns: File path and row count

13. **`export_full_crm_csv`** - Export everything to CSV
    - Parameters: filename_prefix?
    - Returns: Array of generated files

## 📦 Dependencies

Based on the [official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk):

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1",
    "sqlite3": "^5.1.6",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/sqlite3": "^3.1.8",
    "typescript": "^5.0.0"
  }
}
```

## 🔧 Implementation Steps (Updated Incremental Approach)

### Phase 0: Project Setup ⏳
- [ ] Initialize npm project
- [ ] Install dependencies
- [ ] Setup TypeScript configuration
- [ ] Create basic project structure
- [ ] Setup build scripts

### Phase 1: Basic MCP Example ⏳
- [ ] Implement basic MCP server from official docs
- [ ] Add simple tools (hello world, echo, etc.)
- [ ] Test STDIO transport connectivity
- [ ] Verify MCP integration with Claude/Cursor works
- [ ] Document the basic setup process

**Goal**: Validate that MCP connectivity works end-to-end

### Phase 2: Hello World Database ⏳
- [ ] Add SQLite dependency
- [ ] Create simple database connection
- [ ] Implement basic database operations (CREATE, INSERT, SELECT)
- [ ] Add MCP tools for database interaction (add_item, list_items)
- [ ] Test database operations through MCP tools
- [ ] Verify data persistence

**Goal**: Validate that database integration works with MCP

### Phase 3: CRM Database Layer ⏳
- [ ] Design CRM database schema
- [ ] Create database migrations
- [ ] Implement Contact and ContactEntry models
- [ ] Create basic CRUD operations for CRM entities
- [ ] Test database operations

### Phase 4: Core CRM MCP Tools ⏳
- [ ] Implement contact management tools (1-7)
- [ ] Implement contact history tools (8-10)
- [ ] Add search and filtering capabilities
- [ ] Add input validation with Zod
- [ ] Test all contact operations

### Phase 5: Export Functionality ⏳
- [ ] Implement CSV export service
- [ ] Add export MCP tools (11-13)
- [ ] Test CSV generation and file handling
- [ ] Add error handling for file operations

### Phase 6: Polish & Documentation ⏳
- [ ] Add comprehensive error handling
- [ ] Add input validation for all tools
- [ ] Create usage documentation
- [ ] Add logging capabilities
- [ ] Test complete workflow
- [ ] Performance optimization

## 🎛️ Configuration for Claude/Cursor

### Phase 1 - Basic Example:
```json
{
  "mcpServers": {
    "basic-example": {
      "command": "node",
      "args": ["./examples/basic-mcp/index.js"]
    }
  }
}
```

### Phase 2 - Hello World DB:
```json
{
  "mcpServers": {
    "hello-db": {
      "command": "node",
      "args": ["./examples/hello-db/index.js"]
    }
  }
}
```

### Final - CRM Server:
```json
{
  "mcpServers": {
    "crm": {
      "command": "node",
      "args": ["./build/index.js"]
    }
  }
}
```

## 📝 Phase Examples

### Phase 1 - Basic MCP Tools
```typescript
// Simple tools to validate MCP works
server.tool("hello_world", {
  name: z.string().describe("Name to greet")
}, async ({ name }) => {
  return `Hello, ${name}!`;
});

server.tool("echo", {
  message: z.string().describe("Message to echo")
}, async ({ message }) => {
  return message;
});
```

### Phase 2 - Hello World Database Tools
```typescript
// Simple database tools to validate DB works
server.tool("add_item", {
  name: z.string().describe("Item name"),
  description: z.string().optional().describe("Item description")
}, async ({ name, description }) => {
  // Insert into simple 'items' table
  // Return confirmation
});

server.tool("list_items", {}, async () => {
  // Select all from 'items' table
  // Return array of items
});
```

## 🔍 Key Features
- **Incremental Development**: Validate each component step-by-step
- **Simple & Fast**: SQLite for zero-config database
- **Searchable**: Full-text search across names, organizations, job titles
- **Historical**: Date-tracked entries for each contact
- **Exportable**: Easy CSV export for backup/analysis
- **Archival**: Soft-delete contacts (archive vs delete)
- **Organized**: Group by organization, filter by various criteria
- **Type-Safe**: Full TypeScript implementation with Zod validation
- **MCP Compliant**: Uses official TypeScript SDK

## 🚀 Technical Implementation Details

### Phase 1 - Basic MCP Server
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "basic-mcp-example",
  version: "1.0.0"
});

// Simple validation tools
```

### Phase 2 - Database Integration
```typescript
import sqlite3 from 'sqlite3';

class SimpleDatabase {
  private db: sqlite3.Database;
  
  async init() {
    this.db = new sqlite3.Database('./examples/hello-db/test.db');
    await this.createTable();
  }
  
  async createTable() {
    // Create simple 'items' table for testing
  }
}
```

### Final - CRM Implementation
```typescript
// Full CRM implementation as originally planned
```

## 📚 Success Criteria

### Phase 1 Success:
- [ ] Basic MCP server runs and connects to Claude/Cursor
- [ ] Simple tools work correctly
- [ ] STDIO transport is stable

### Phase 2 Success:
- [ ] Database connection works
- [ ] Basic CRUD operations work through MCP tools
- [ ] Data persists correctly

### Final Success:
- [ ] All 13 CRM tools implemented and working
- [ ] Database operations are reliable and fast
- [ ] CSV export functionality works correctly
- [ ] Easy to extend with new contact fields
- [ ] Proper error handling and validation
- [ ] Documentation is complete and clear
- [ ] Compatible with Claude/Cursor MCP integration 