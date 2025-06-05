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

## Field Addition Types

This guide covers two types of field additions:
- **Contact Fields**: Adding fields to the contacts table (e.g., LinkedIn, website)
- **Contact Entry Fields**: Adding fields to the contact_entries table (e.g., interaction_date, duration)

---

## PART A: Adding Fields to Contacts Table

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

---

## PART B: Adding Fields to Contact Entries Table

For fields related to individual interactions/activities (like interaction_date, duration, location), follow these steps:

### Step 1: Update ContactEntry Interface

The ContactEntry interface may not need changes if the field maps to an existing database column (like `entry_date`). 

**File:** `src/crm-server.ts` (around line 51)

```typescript
interface ContactEntry {
  id: number;
  contact_id: number;
  entry_type: string; // 'call', 'email', 'meeting', 'note', 'task'
  subject: string;
  content: string | null;
  entry_date: string;  // This maps to interaction_date parameter
  created_at: string;
}
```

### Step 2: Update addContactEntry Method

**File:** `src/crm-server.ts` (around line 333)

Add the new field to the method signature and handle it in the SQL:

```typescript
async addContactEntry(data: {
  contact_id: number;
  entry_type: string;
  subject: string;
  content?: string;
  interaction_date?: string;  // NEW FIELD
}): Promise<number> {
  return new Promise((resolve, reject) => {
    const query = data.interaction_date 
      ? `INSERT INTO contact_entries (contact_id, entry_type, subject, content, entry_date) VALUES (?, ?, ?, ?, ?)`
      : `INSERT INTO contact_entries (contact_id, entry_type, subject, content) VALUES (?, ?, ?, ?)`;
    
    const params = data.interaction_date
      ? [data.contact_id, data.entry_type, data.subject, data.content || null, data.interaction_date]
      : [data.contact_id, data.entry_type, data.subject, data.content || null];

    this.db.run(query, params, function(err: any) {
      if (err) {
        reject(err);
      } else {
        resolve(this.lastID);
      }
    });
  });
}
```

### Step 3: Update updateContactEntry Method

**File:** `src/crm-server.ts` (around line 411)

```typescript
async updateContactEntry(entryId: number, data: Partial<{
  entry_type: string;
  subject: string;
  content: string;
  interaction_date: string;  // NEW FIELD
}>): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const fields = Object.keys(data).map(key => {
      // Map interaction_date to entry_date for database column
      const dbKey = key === 'interaction_date' ? 'entry_date' : key;
      return `${dbKey} = ?`;
    }).join(', ');
    const values = [...Object.values(data), entryId];
    
    this.db.run(
      `UPDATE contact_entries SET ${fields} WHERE id = ?`,
      values,
      function(err: any) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes > 0);
        }
      }
    );
  });
}
```

### Step 4: Update MCP Tools

**4a. Update add_contact_entry tool:**

```typescript
server.tool(
  "add_contact_entry",
  {
    contact_id: z.number().describe("Contact ID to add entry for"),
    entry_type: z.enum(['call', 'email', 'meeting', 'note', 'task']).describe("Type of interaction"),
    subject: z.string().describe("Brief subject/title of the entry"),
    content: z.string().optional().describe("Detailed content of the entry"),
    interaction_date: z.string().optional().describe("When the interaction occurred (ISO datetime string, e.g. '2025-05-27T10:30:00Z'). Defaults to current time if not provided.")
  },
  async ({ contact_id, entry_type, subject, content, interaction_date }) => {
    // Implementation includes interaction_date
  }
);
```

**4b. Update update_contact_entry tool:**

```typescript
server.tool(
  "update_contact_entry",
  {
    entry_id: z.number().describe("Contact entry ID to update"),
    entry_type: z.enum(['call', 'email', 'meeting', 'note', 'task']).optional().describe("Updated type of interaction"),
    subject: z.string().optional().describe("Updated subject/title of the entry"),
    content: z.string().optional().describe("Updated detailed content of the entry"),
    interaction_date: z.string().optional().describe("Updated interaction date (ISO datetime string, e.g. '2025-05-27T10:30:00Z')")
  },
  async ({ entry_id, entry_type, subject, content, interaction_date }) => {
    const updateData: any = {};
    if (entry_type !== undefined) updateData.entry_type = entry_type;
    if (subject !== undefined) updateData.subject = subject;
    if (content !== undefined) updateData.content = content;
    if (interaction_date !== undefined) updateData.interaction_date = interaction_date;
    
    const success = await database.updateContactEntry(entry_id, updateData);
    // ... rest of implementation
  }
);
```

### Step 5: No Database Migration Needed

For existing contact entries tables, no migration is needed since we're reusing the existing `entry_date` column. The new `interaction_date` parameter is optional and maps to the existing database structure.

### Step 6: Update Tests

**File:** `tests/scenarios/contact-history.test.ts`

Add tests with historical dates:

```typescript
const { result } = await this.callTool("add_contact_entry", {
  contact_id: contactId,
  entry_type: "meeting",
  subject: "EthPrague Meeting",
  content: "Initial discussion about name services",
  interaction_date: "2025-05-27T14:30:00Z"  // Historical date
});
```

### Step 7: Build & Test

```bash
npm run build
npx tsx tests/run-comprehensive-tests.ts
```

### Example: Adding a Duration Field

Following these steps to add a `duration` field to contact entries:

1. No interface changes needed if using existing columns
2. Add `duration?: number` to addContactEntry and updateContactEntry parameters
3. Update SQL to handle the duration column: `ALTER TABLE contact_entries ADD COLUMN duration INTEGER`
4. Add `duration` parameter to MCP tools
5. Update tests with duration data
6. Build and test

---

## Important Notes for Contact Entry Fields

- **Existing columns** can be reused via parameter mapping (like interaction_date → entry_date)
- **New columns** require database migration: `ALTER TABLE contact_entries ADD COLUMN field_name TYPE`
- **Optional parameters** maintain backward compatibility
- **ISO datetime strings** are recommended for date fields
- **All tests must pass** before deployment 