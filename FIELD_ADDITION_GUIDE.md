# CRM Field Addition Guide

This document provides a simple step-by-step process for adding new fields to the CRM system.

## Quick Steps Summary

1. Update TypeScript interfaces
2. Update database schema & migration
3. Update CRUD operations  
4. Update MCP tool definitions
5. Update CSV export
6. Update tests
7. Build & deploy
8. Manual database migration (production only)

## Detailed Step-by-Step Process

### Step 1: Update Type Interface

**File:** `src/crm-server.ts` (around line 36)

```typescript
interface Contact {
  id: number;
  name: string;
  organization: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  telegram: string | null;
  x_account: string | null;
  new_field_name: string | null;  // ADD NEW FIELD HERE
  notes: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}
```

### Step 2: Update Database Schema

**File:** `src/crm-server.ts` (around line 75)

**2a. Add to CREATE TABLE statement:**
```sql
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  organization TEXT,
  job_title TEXT,
  email TEXT,
  phone TEXT,
  telegram TEXT,
  x_account TEXT,
  new_field_name TEXT,  -- ADD HERE
  notes TEXT,
  is_archived BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**2b. Add migration logic (around line 105):**
```typescript
const hasNewField = existingColumns.includes('new_field_name');

// Add new_field_name column if it doesn't exist
if (!hasNewField) {
  migrationsNeeded++;
  this.db.run(`ALTER TABLE contacts ADD COLUMN new_field_name TEXT`, (err: any) => {
    if (err) {
      console.error("⚠️ Failed to add new_field_name column:", err.message);
    } else {
      console.error("✅ Added new_field_name column to contacts table");
    }
    checkMigrationComplete();
  });
}
```

### Step 3: Update CRUD Operations

**3a. Update addContact method (around line 185):**
```typescript
async addContact(data: {
  name: string;
  organization?: string;
  job_title?: string;
  email?: string;
  phone?: string;
  telegram?: string;
  x_account?: string;
  new_field_name?: string;  // ADD HERE
  notes?: string;
}): Promise<number>
```

**Update INSERT statement:**
```sql
INSERT INTO contacts (name, organization, job_title, email, phone, telegram, x_account, new_field_name, notes)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
```

**Update values array:**
```typescript
[
  data.name,
  data.organization || null,
  data.job_title || null,
  data.email || null,
  data.phone || null,
  data.telegram || null,
  data.x_account || null,
  data.new_field_name || null,  // ADD HERE
  data.notes || null
]
```

**3b. Update updateContact method (around line 290):**
```typescript
async updateContact(id: number, data: Partial<{
  name: string;
  organization: string;
  job_title: string;
  email: string;
  phone: string;
  telegram: string;
  x_account: string;
  new_field_name: string;  // ADD HERE
  notes: string;
}>): Promise<boolean>
```

**3c. Update searchContacts method (around line 250):**
```sql
SELECT * FROM contacts 
WHERE is_archived = 0 AND (
  name LIKE ? OR 
  organization LIKE ? OR 
  job_title LIKE ? OR 
  email LIKE ? OR
  telegram LIKE ? OR
  x_account LIKE ? OR
  new_field_name LIKE ?  -- ADD HERE
)
ORDER BY name ASC
```

**Update search parameters:**
```typescript
this.db.all(searchQuery, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm], ...)
```

### Step 4: Update CSV Export

**File:** `src/crm-server.ts` (around line 400)

**Update headers:**
```typescript
const headers = ['ID', 'Name', 'Organization', 'Job Title', 'Email', 'Phone', 'Telegram', 'X Account', 'New Field Name', 'Notes', 'Archived', 'Created', 'Updated'];
```

**Update row data:**
```typescript
const row = [
  contact.id.toString(),
  `"${contact.name.replace(/"/g, '""')}"`,
  `"${(contact.organization || '').replace(/"/g, '""')}"`,
  `"${(contact.job_title || '').replace(/"/g, '""')}"`,
  `"${(contact.email || '').replace(/"/g, '""')}"`,
  `"${(contact.phone || '').replace(/"/g, '""')}"`,
  `"${(contact.telegram || '').replace(/"/g, '""')}"`,
  `"${(contact.x_account || '').replace(/"/g, '""')}"`,
  `"${(contact.new_field_name || '').replace(/"/g, '""')}"`,  // ADD HERE
  `"${(contact.notes || '').replace(/"/g, '""')}"`,
  contact.is_archived ? 'Yes' : 'No',
  contact.created_at,
  contact.updated_at
];
```

### Step 5: Update MCP Tools

**5a. Update add_contact tool (around line 500):**
```typescript
server.tool(
  "add_contact",
  {
    name: z.string().describe("Full name of the contact"),
    organization: z.string().optional().describe("Organization/company name"),
    job_title: z.string().optional().describe("Job title or position"),
    email: z.string().optional().describe("Email address"),
    phone: z.string().optional().describe("Phone number"),
    telegram: z.string().optional().describe("Telegram username or handle"),
    x_account: z.string().optional().describe("X (Twitter) username or handle"),
    new_field_name: z.string().optional().describe("Description of new field"),  // ADD HERE
    notes: z.string().optional().describe("Additional notes about the contact")
  },
  async ({ name, organization, job_title, email, phone, telegram, x_account, new_field_name, notes }) => {
    // Implementation includes new_field_name
  }
);
```

**5b. Update update_contact tool (around line 795):**
```typescript
server.tool(
  "update_contact",
  {
    id: z.number().describe("Contact ID to update"),
    name: z.string().optional().describe("Updated full name"),
    organization: z.string().optional().describe("Updated organization/company name"),
    job_title: z.string().optional().describe("Updated job title or position"),
    email: z.string().optional().describe("Updated email address"),
    phone: z.string().optional().describe("Updated phone number"),
    telegram: z.string().optional().describe("Updated Telegram username or handle"),
    x_account: z.string().optional().describe("Updated X (Twitter) username or handle"),
    new_field_name: z.string().optional().describe("Updated new field"),  // ADD HERE
    notes: z.string().optional().describe("Updated notes about the contact")
  },
  async ({ id, name, organization, job_title, email, phone, telegram, x_account, new_field_name, notes }) => {
    // Update logic includes: if (new_field_name !== undefined) updateData.new_field_name = new_field_name;
  }
);
```

**5c. Update search_contacts tool description (around line 630):**
```typescript
query: z.string().describe("Search query to match against name, organization, job title, email, telegram, x_account, or new_field_name")
```

### Step 6: Update Tests

**File:** `tests/scenarios/contact-management.test.ts`

**Add to test data:**
```typescript
const { result, duration, timestamp } = await this.callTool("add_contact", {
  name: "John Doe",
  organization: "TechCorp Inc",
  job_title: "Senior Software Engineer",
  email: "john.doe@techcorp.com",
  phone: "+1-555-0101",
  telegram: "@johndoe_tech",
  x_account: "@JohnDoe_Dev",
  new_field_name: "sample_value",  // ADD HERE
  notes: "Met at tech conference 2024"
});
```

**Add to search tests:**
```typescript
{ query: "sample_value", expectedMin: 1, description: "new_field_name search" },  // ADD HERE
```

**File:** `tests/scenarios/export-functionality.test.ts`

**Update test data and validation for CSV exports to include new field.**

### Step 7: Build & Deploy

```bash
# Build the updated code
npm run build

# Run tests to verify everything works
npx tsx tests/run-comprehensive-tests.ts
```

### Step 8: Manual Database Migration (Production Only)

**For existing production databases, run manual migration:**

```javascript
// Create migration script
import pkg from 'sqlite3';
const { Database } = pkg;

const db = new Database('data/crm.sqlite');
db.run(`ALTER TABLE contacts ADD COLUMN new_field_name TEXT`, (err) => {
  if (err && !err.message.includes('duplicate')) {
    console.error('Migration failed:', err);
  } else {
    console.log('✅ Added new_field_name column');
  }
  db.close();
});
```

### Step 9: Restart MCP Server

**Reset the MCP server connection in Cursor settings to load the new code.**

## Important Notes

- **Fresh databases** will automatically have the new fields via CREATE TABLE
- **Existing databases** need manual migration (Step 8)
- **MCP server restart** is required to use new tool parameters
- **All tests must pass** before deployment
- **CSV exports** will automatically include new fields after restart

## Example: Adding a "LinkedIn" Field

Following these steps to add a `linkedin` field:

1. Add `linkedin: string | null;` to Contact interface
2. Add `linkedin TEXT,` to CREATE TABLE and migration logic
3. Update all CRUD operations to handle `linkedin`
4. Add `linkedin` to CSV headers and row data
5. Add `linkedin` parameter to MCP tools
6. Update tests with LinkedIn data
7. Build: `npm run build`
8. Migrate: `ALTER TABLE contacts ADD COLUMN linkedin TEXT`
9. Reset MCP server connection

This process ensures the field is properly integrated throughout the entire system. 