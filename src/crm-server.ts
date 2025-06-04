#!/usr/bin/env node

// DEBUG: Log environment variables immediately when process starts
console.error("🔍 STARTUP DEBUG - All environment variables:");
Object.keys(process.env).filter(key => key.startsWith('CRM')).forEach(key => {
  console.error(`  ${key}=${process.env[key]}`);
});
console.error(`🔍 STARTUP DEBUG - CRM_DB_PATH specifically: ${process.env.CRM_DB_PATH}`);

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import pkg from "sqlite3";
const { Database } = pkg;
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { mkdir, writeFile } from "fs/promises";

/**
 * CRM MCP Server
 * 
 * A complete CRM system with MCP integration
 * Features:
 * - Contact management (add, search, list, archive)
 * - Contact history tracking with date-tracked entries
 * - Organization-based filtering
 * - CSV export functionality
 * - Searchable by name, organization, job title
 */

// Get the directory of this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database interfaces for type safety
interface Contact {
  id: number;
  name: string;
  organization: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  telegram: string | null;
  x_account: string | null;
  notes: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

interface ContactEntry {
  id: number;
  contact_id: number;
  entry_type: string; // 'call', 'email', 'meeting', 'note', 'task'
  subject: string;
  content: string | null;
  entry_date: string;
  created_at: string;
}

// CRM database class
class CRMDatabase {
  private db: any;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
  }

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create contacts table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS contacts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          organization TEXT,
          job_title TEXT,
          email TEXT,
          phone TEXT,
          telegram TEXT,
          x_account TEXT,
          notes TEXT,
          is_archived BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err: any) => {
        if (err) {
          reject(err);
          return;
        }

        // Check if new columns exist and add them if they don't
        this.db.get("PRAGMA table_info(contacts)", (err: any, tableInfo: any) => {
          if (err) {
            reject(err);
            return;
          }

          // Get existing column names
          this.db.all("PRAGMA table_info(contacts)", (err: any, columns: any[]) => {
            if (err) {
              reject(err);
              return;
            }

            const existingColumns = columns.map(col => col.name);
            const hasTelegram = existingColumns.includes('telegram');
            const hasXAccount = existingColumns.includes('x_account');

            let migrationsNeeded = 0;
            let migrationsCompleted = 0;

            const checkMigrationComplete = () => {
              migrationsCompleted++;
              if (migrationsCompleted === migrationsNeeded) {
                // Create contact_entries table after migrations complete
                this.createContactEntriesTable(resolve, reject);
              }
            };

            // Add telegram column if it doesn't exist
            if (!hasTelegram) {
              migrationsNeeded++;
              this.db.run(`ALTER TABLE contacts ADD COLUMN telegram TEXT`, (err: any) => {
                if (err) {
                  console.error("⚠️ Failed to add telegram column:", err.message);
                } else {
                  console.error("✅ Added telegram column to contacts table");
                }
                checkMigrationComplete();
              });
            }

            // Add x_account column if it doesn't exist  
            if (!hasXAccount) {
              migrationsNeeded++;
              this.db.run(`ALTER TABLE contacts ADD COLUMN x_account TEXT`, (err: any) => {
                if (err) {
                  console.error("⚠️ Failed to add x_account column:", err.message);
                } else {
                  console.error("✅ Added x_account column to contacts table");
                }
                checkMigrationComplete();
              });
            }

            // If no migrations needed, proceed to create contact_entries table
            if (migrationsNeeded === 0) {
              this.createContactEntriesTable(resolve, reject);
            }
          });
        });
      });
    });
  }

  private createContactEntriesTable(resolve: () => void, reject: (error: any) => void): void {
    // Create contact_entries table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS contact_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id INTEGER NOT NULL,
        entry_type TEXT NOT NULL,
        subject TEXT NOT NULL,
        content TEXT,
        entry_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (contact_id) REFERENCES contacts (id)
      )
    `, (err: any) => {
      if (err) {
        reject(err);
        return;
      }

      console.error("✅ CRM database initialized with contacts and contact_entries tables");
      resolve();
    });
  }

  // Contact CRUD operations
  async addContact(data: {
    name: string;
    organization?: string;
    job_title?: string;
    email?: string;
    phone?: string;
    telegram?: string;
    x_account?: string;
    notes?: string;
  }): Promise<number> {
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO contacts (name, organization, job_title, email, phone, telegram, x_account, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        data.name,
        data.organization || null,
        data.job_title || null,
        data.email || null,
        data.phone || null,
        data.telegram || null,
        data.x_account || null,
        data.notes || null
      ], function(err: any) {
        if (err) {
          reject(err);
        } else {
          // @ts-ignore
          resolve(this.lastID);
        }
      });
    });
  }

  async getContactById(id: number): Promise<Contact | null> {
    return new Promise((resolve, reject) => {
      this.db.get("SELECT * FROM contacts WHERE id = ?", [id], (err: any, row: Contact | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      });
    });
  }

  async listContacts(includeArchived: boolean = false): Promise<Contact[]> {
    return new Promise((resolve, reject) => {
      const query = includeArchived 
        ? "SELECT * FROM contacts ORDER BY name ASC"
        : "SELECT * FROM contacts WHERE is_archived = 0 ORDER BY name ASC";
      
      this.db.all(query, (err: any, rows: Contact[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  async searchContacts(query: string): Promise<Contact[]> {
    return new Promise((resolve, reject) => {
      const searchQuery = `
        SELECT * FROM contacts 
        WHERE is_archived = 0 AND (
          name LIKE ? OR 
          organization LIKE ? OR 
          job_title LIKE ? OR 
          email LIKE ? OR
          telegram LIKE ? OR
          x_account LIKE ?
        )
        ORDER BY name ASC
      `;
      const searchTerm = `%${query}%`;
      
      this.db.all(searchQuery, [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm], (err: any, rows: Contact[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  async listContactsByOrganization(organization: string): Promise<Contact[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT * FROM contacts WHERE is_archived = 0 AND organization LIKE ? ORDER BY name ASC",
        [`%${organization}%`],
        (err: any, rows: Contact[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  }

  async updateContact(id: number, data: Partial<{
    name: string;
    organization: string;
    job_title: string;
    email: string;
    phone: string;
    telegram: string;
    x_account: string;
    notes: string;
  }>): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const fields = Object.keys(data).map(key => `${key} = ?`).join(', ');
      const values = [...Object.values(data), id];
      
      this.db.run(
        `UPDATE contacts SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        values,
        function(err: any) {
          if (err) {
            reject(err);
          } else {
            // @ts-ignore
            resolve(this.changes > 0);
          }
        }
      );
    });
  }

  async archiveContact(id: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.db.run(
        "UPDATE contacts SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [id],
        function(err: any) {
          if (err) {
            reject(err);
          } else {
            // @ts-ignore
            resolve(this.changes > 0);
          }
        }
      );
    });
  }

  async addContactEntry(data: {
    contact_id: number;
    entry_type: string;
    subject: string;
    content?: string;
  }): Promise<number> {
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO contact_entries (contact_id, entry_type, subject, content)
        VALUES (?, ?, ?, ?)
      `, [
        data.contact_id,
        data.entry_type,
        data.subject,
        data.content || null
      ], function(err: any) {
        if (err) {
          reject(err);
        } else {
          // @ts-ignore
          resolve(this.lastID);
        }
      });
    });
  }

  async getContactHistory(contactId: number, limit?: number): Promise<ContactEntry[]> {
    return new Promise((resolve, reject) => {
      const query = limit 
        ? "SELECT * FROM contact_entries WHERE contact_id = ? ORDER BY entry_date DESC LIMIT ?"
        : "SELECT * FROM contact_entries WHERE contact_id = ? ORDER BY entry_date DESC";
      
      const params = limit ? [contactId, limit] : [contactId];
      
      this.db.all(query, params, (err: any, rows: ContactEntry[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  async getRecentActivities(limit: number = 10): Promise<Array<ContactEntry & { contact_name: string }>> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT ce.*, c.name as contact_name 
        FROM contact_entries ce 
        JOIN contacts c ON ce.contact_id = c.id 
        WHERE c.is_archived = 0 
        ORDER BY ce.entry_date DESC 
        LIMIT ?
      `;
      
      this.db.all(query, [limit], (err: any, rows: Array<ContactEntry & { contact_name: string }>) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  async deleteContactEntry(entryId: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.db.run(`DELETE FROM contact_entries WHERE id = ?`, [entryId], function(err: any) {
        if (err) {
          reject(err);
        } else {
          // @ts-ignore - this.changes is available on the function context
          resolve(this.changes > 0);
        }
      });
    });
  }

  async updateContactEntry(entryId: number, data: Partial<{
    entry_type: string;
    subject: string;
    content: string;
  }>): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const fields = Object.keys(data).map(key => `${key} = ?`).join(', ');
      const values = [...Object.values(data), entryId];
      
      this.db.run(
        `UPDATE contact_entries SET ${fields} WHERE id = ?`,
        values,
        function(err: any) {
          if (err) {
            reject(err);
          } else {
            // @ts-ignore - this.changes is available on the function context
            resolve(this.changes > 0);
          }
        }
      );
    });
  }

  async exportContacts(includeArchived: boolean = false): Promise<string> {
    const contacts = await this.listContacts(includeArchived);
    
    const headers = ['ID', 'Name', 'Organization', 'Job Title', 'Email', 'Phone', 'Telegram', 'X Account', 'Notes', 'Archived', 'Created', 'Updated'];
    const csvRows = [headers.join(',')];
    
    contacts.forEach(contact => {
      const row = [
        contact.id.toString(),
        `"${contact.name.replace(/"/g, '""')}"`,
        `"${(contact.organization || '').replace(/"/g, '""')}"`,
        `"${(contact.job_title || '').replace(/"/g, '""')}"`,
        `"${(contact.email || '').replace(/"/g, '""')}"`,
        `"${(contact.phone || '').replace(/"/g, '""')}"`,
        `"${(contact.telegram || '').replace(/"/g, '""')}"`,
        `"${(contact.x_account || '').replace(/"/g, '""')}"`,
        `"${(contact.notes || '').replace(/"/g, '""')}"`,
        contact.is_archived ? 'Yes' : 'No',
        contact.created_at,
        contact.updated_at
      ];
      csvRows.push(row.join(','));
    });
    
    return csvRows.join('\n');
  }

  async exportContactHistory(contactId?: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const query = contactId 
        ? `SELECT ce.*, c.name as contact_name FROM contact_entries ce 
           JOIN contacts c ON ce.contact_id = c.id 
           WHERE ce.contact_id = ? ORDER BY ce.entry_date DESC`
        : `SELECT ce.*, c.name as contact_name FROM contact_entries ce 
           JOIN contacts c ON ce.contact_id = c.id 
           ORDER BY ce.entry_date DESC`;
      
      const params = contactId ? [contactId] : [];
      
      this.db.all(query, params, (err: any, rows: Array<ContactEntry & { contact_name: string }>) => {
        if (err) {
          reject(err);
          return;
        }

        const headers = ['Entry ID', 'Contact Name', 'Entry Type', 'Subject', 'Content', 'Entry Date', 'Created'];
        const csvRows = [headers.join(',')];
        
        rows.forEach(entry => {
          const row = [
            entry.id.toString(),
            `"${entry.contact_name.replace(/"/g, '""')}"`,
            `"${entry.entry_type.replace(/"/g, '""')}"`,
            `"${entry.subject.replace(/"/g, '""')}"`,
            `"${(entry.content || '').replace(/"/g, '""')}"`,
            entry.entry_date,
            entry.created_at
          ];
          csvRows.push(row.join(','));
        });
        
        resolve(csvRows.join('\n'));
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err: any) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

// Database path configuration - allow override for testing
console.log("🔍 Environment variables:", Object.keys(process.env).filter(key => key.startsWith('CRM')).map(key => `${key}=${process.env[key]}`));

// Check for database path in command line arguments (--db-path argument)
const dbPathArg = process.argv.find(arg => arg.startsWith('--db-path='));
const dbPathFromArg = dbPathArg ? dbPathArg.split('=')[1] : null;

const dbPath = dbPathFromArg || process.env.CRM_DB_PATH || join(__dirname, "..", "data", "crm.sqlite");
console.log(`🗄️ Database: ${dbPath}`);
const database = new CRMDatabase(dbPath);

// Create the MCP server
const server = new McpServer({
  name: "mcp-crm",
  version: "1.0.0"
});

// TOOL 1: Add Contact
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
    notes: z.string().optional().describe("Additional notes about the contact")
  },
  async ({ name, organization, job_title, email, phone, telegram, x_account, notes }) => {
    try {
      const contactId = await database.addContact({
        name,
        organization,
        job_title,
        email,
        phone,
        telegram,
        x_account,
        notes
      });
      
      const contact = await database.getContactById(contactId);
      
      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully added contact "${name}" with ID ${contactId}\n\n${JSON.stringify(contact, null, 2)}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to add contact: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// TOOL 2: List Contacts
server.tool(
  "list_contacts",
  {
    include_archived: z.boolean().optional().describe("Whether to include archived contacts (default: false)")
  },
  async ({ include_archived = false }) => {
    try {
      const contacts = await database.listContacts(include_archived);
      
      if (contacts.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "📭 No contacts found in the database."
            }
          ]
        };
      }

      const contactsList = contacts.map(contact => 
        `• ID: ${contact.id} | ${contact.name} | ${contact.organization || 'No org'} | ${contact.job_title || 'No title'}`
      ).join('\n');

      return {
        content: [
          {
            type: "text",
            text: `📋 Found ${contacts.length} contact(s):\n\n${contactsList}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to list contacts: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// TOOL 3: Get Contact Details
server.tool(
  "get_contact_details",
  {
    id: z.number().describe("Contact ID to retrieve details for")
  },
  async ({ id }) => {
    try {
      const contact = await database.getContactById(id);
      
      if (!contact) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Contact with ID ${id} not found`
            }
          ]
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `📄 Contact Details:\n\n${JSON.stringify(contact, null, 2)}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to get contact details: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// TOOL 4: Search Contacts
server.tool(
  "search_contacts",
  {
    query: z.string().describe("Search query to match against name, organization, job title, email, telegram, or x_account")
  },
  async ({ query }) => {
    try {
      const contacts = await database.searchContacts(query);
      
      if (contacts.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `🔍 No contacts found matching "${query}"`
            }
          ]
        };
      }

      const contactsList = contacts.map(contact => 
        `• ID: ${contact.id} | ${contact.name} | ${contact.organization || 'No org'} | ${contact.job_title || 'No title'}`
      ).join('\n');

      return {
        content: [
          {
            type: "text",
            text: `🔍 Found ${contacts.length} contact(s) matching "${query}":\n\n${contactsList}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to search contacts: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// TOOL 5: List Contacts by Organization
server.tool(
  "list_contacts_by_organization",
  {
    organization: z.string().describe("Organization name to filter contacts by")
  },
  async ({ organization }) => {
    try {
      const contacts = await database.listContactsByOrganization(organization);
      
      if (contacts.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `🏢 No contacts found for organization "${organization}"`
            }
          ]
        };
      }

      const contactsList = contacts.map(contact => 
        `• ID: ${contact.id} | ${contact.name} | ${contact.job_title || 'No title'} | ${contact.email || 'No email'}`
      ).join('\n');

      return {
        content: [
          {
            type: "text",
            text: `🏢 Found ${contacts.length} contact(s) at "${organization}":\n\n${contactsList}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to list contacts by organization: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// TOOL 6: Archive Contact
server.tool(
  "archive_contact",
  {
    id: z.number().describe("Contact ID to archive")
  },
  async ({ id }) => {
    try {
      const contact = await database.getContactById(id);
      if (!contact) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Contact with ID ${id} not found`
            }
          ]
        };
      }

      if (contact.is_archived) {
        return {
          content: [
            {
              type: "text",
              text: `ℹ️ Contact "${contact.name}" (ID: ${id}) is already archived`
            }
          ]
        };
      }

      const success = await database.archiveContact(id);
      
      if (success) {
        return {
          content: [
            {
              type: "text",
              text: `🗄️ Successfully archived contact "${contact.name}" (ID: ${id})`
            }
          ]
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to archive contact with ID ${id}`
            }
          ]
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to archive contact: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// TOOL 7: Update Contact
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
    notes: z.string().optional().describe("Updated notes about the contact")
  },
  async ({ id, name, organization, job_title, email, phone, telegram, x_account, notes }) => {
    try {
      const contact = await database.getContactById(id);
      if (!contact) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Contact with ID ${id} not found`
            }
          ]
        };
      }

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (organization !== undefined) updateData.organization = organization;
      if (job_title !== undefined) updateData.job_title = job_title;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (telegram !== undefined) updateData.telegram = telegram;
      if (x_account !== undefined) updateData.x_account = x_account;
      if (notes !== undefined) updateData.notes = notes;

      if (Object.keys(updateData).length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `ℹ️ No fields provided to update for contact ID ${id}`
            }
          ]
        };
      }

      const success = await database.updateContact(id, updateData);
      
      if (success) {
        const updatedContact = await database.getContactById(id);
        return {
          content: [
            {
              type: "text",
              text: `✅ Successfully updated contact "${contact.name}" (ID: ${id})\n\n${JSON.stringify(updatedContact, null, 2)}`
            }
          ]
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to update contact with ID ${id}`
            }
          ]
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to update contact: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// TOOL 8: Add Contact Entry
server.tool(
  "add_contact_entry",
  {
    contact_id: z.number().describe("Contact ID to add entry for"),
    entry_type: z.enum(['call', 'email', 'meeting', 'note', 'task']).describe("Type of interaction"),
    subject: z.string().describe("Brief subject/title of the entry"),
    content: z.string().optional().describe("Detailed content of the entry")
  },
  async ({ contact_id, entry_type, subject, content }) => {
    try {
      const contact = await database.getContactById(contact_id);
      if (!contact) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Contact with ID ${contact_id} not found`
            }
          ]
        };
      }

      const entryId = await database.addContactEntry({
        contact_id,
        entry_type,
        subject,
        content
      });
      
      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully added ${entry_type} entry for "${contact.name}" (Entry ID: ${entryId})\n\nSubject: ${subject}\nContent: ${content || 'None'}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to add contact entry: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// TOOL 9: Update Contact Entry
server.tool(
  "update_contact_entry",
  {
    entry_id: z.number().describe("Contact entry ID to update"),
    entry_type: z.enum(['call', 'email', 'meeting', 'note', 'task']).optional().describe("Updated type of interaction"),
    subject: z.string().optional().describe("Updated subject/title of the entry"),
    content: z.string().optional().describe("Updated detailed content of the entry")
  },
  async ({ entry_id, entry_type, subject, content }) => {
    try {
      // First get the entry to check if it exists and get contact info
      const history = await database.getContactHistory(1); // Get all entries
      const allHistory = await database.getRecentActivities(1000); // Get more entries to find this one
      const entry = allHistory.find(e => e.id === entry_id);
      
      if (!entry) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Contact entry with ID ${entry_id} not found`
            }
          ]
        };
      }

      const updateData: any = {};
      if (entry_type !== undefined) updateData.entry_type = entry_type;
      if (subject !== undefined) updateData.subject = subject;
      if (content !== undefined) updateData.content = content;

      if (Object.keys(updateData).length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `ℹ️ No fields provided to update for entry ID ${entry_id}`
            }
          ]
        };
      }

      const success = await database.updateContactEntry(entry_id, updateData);
      
      if (success) {
        return {
          content: [
            {
              type: "text",
              text: `✅ Successfully updated contact entry for "${entry.contact_name}" (Entry ID: ${entry_id})\n\nUpdated fields: ${Object.keys(updateData).join(', ')}`
            }
          ]
        };
      } else {
        return {
          content: [
            {
              type: "text",
              text: `❌ Failed to update contact entry with ID ${entry_id}`
            }
          ]
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to update contact entry: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// TOOL 10: Get Contact History
server.tool(
  "get_contact_history",
  {
    contact_id: z.number().describe("Contact ID to get history for"),
    limit: z.number().optional().describe("Maximum number of entries to return (default: all)")
  },
  async ({ contact_id, limit }) => {
    try {
      const contact = await database.getContactById(contact_id);
      if (!contact) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Contact with ID ${contact_id} not found`
            }
          ]
        };
      }

      const history = await database.getContactHistory(contact_id, limit);
      
      if (history.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `📝 No interaction history found for "${contact.name}"`
            }
          ]
        };
      }

      const historyList = history.map(entry => 
        `• ${entry.entry_date} | ${entry.entry_type.toUpperCase()} | ${entry.subject}${entry.content ? `\n  ${entry.content}` : ''}`
      ).join('\n\n');

      return {
        content: [
          {
            type: "text",
            text: `📝 Interaction history for "${contact.name}" (${history.length} entries):\n\n${historyList}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to get contact history: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// TOOL 11: Get Recent Activities
server.tool(
  "get_recent_activities",
  {
    limit: z.number().optional().describe("Maximum number of recent activities to return (default: 10)")
  },
  async ({ limit = 10 }) => {
    try {
      const activities = await database.getRecentActivities(limit);
      
      if (activities.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "📊 No recent activities found"
            }
          ]
        };
      }

      const activitiesList = activities.map(activity => 
        `• ${activity.entry_date} | ${activity.contact_name} | ${activity.entry_type.toUpperCase()} | ${activity.subject}`
      ).join('\n');

      return {
        content: [
          {
            type: "text",
            text: `📊 Recent activities (${activities.length} entries):\n\n${activitiesList}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to get recent activities: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// TOOL 12: Export Contacts CSV
server.tool(
  "export_contacts_csv",
  {
    include_archived: z.boolean().optional().describe("Whether to include archived contacts (default: false)")
  },
  async ({ include_archived = false }) => {
    try {
      const csvContent = await database.exportContacts(include_archived);
      const filename = `contacts_export_${new Date().toISOString().slice(0, 10)}.csv`;
      
      return {
        content: [
          {
            type: "text",
            text: `📁 CSV Export Generated:\n\nFilename: ${filename}\nIncludes archived: ${include_archived ? 'Yes' : 'No'}\n\n--- CSV Content ---\n${csvContent}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to export contacts: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// TOOL 13: Export Contact History CSV
server.tool(
  "export_contact_history_csv",
  {
    contact_id: z.number().optional().describe("Specific contact ID to export history for (omit for all contacts)")
  },
  async ({ contact_id }) => {
    try {
      if (contact_id) {
        const contact = await database.getContactById(contact_id);
        if (!contact) {
          return {
            content: [
              {
                type: "text",
                text: `❌ Contact with ID ${contact_id} not found`
              }
            ]
          };
        }
      }

      const csvContent = await database.exportContactHistory(contact_id);
      const filename = contact_id 
        ? `contact_${contact_id}_history_${new Date().toISOString().slice(0, 10)}.csv`
        : `all_contact_history_${new Date().toISOString().slice(0, 10)}.csv`;
      
      return {
        content: [
          {
            type: "text",
            text: `📁 Contact History CSV Export Generated:\n\nFilename: ${filename}\nScope: ${contact_id ? `Contact ID ${contact_id}` : 'All contacts'}\n\n--- CSV Content ---\n${csvContent}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to export contact history: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// TOOL 14: Export Full CRM CSV
server.tool(
  "export_full_crm_csv",
  {},
  async () => {
    try {
      const contactsCsv = await database.exportContacts(true); // Include archived
      const historyCsv = await database.exportContactHistory(); // All history
      
      const timestamp = new Date().toISOString().slice(0, 10);
      const fullExport = `=== CONTACTS ===\n${contactsCsv}\n\n=== CONTACT HISTORY ===\n${historyCsv}`;
      
      return {
        content: [
          {
            type: "text",
            text: `📁 Full CRM CSV Export Generated:\n\nFilename: full_crm_export_${timestamp}.csv\nIncludes: All contacts (including archived) + all interaction history\n\n--- CSV Content ---\n${fullExport}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to export full CRM data: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// Start the server with stdio transport
async function main() {
  try {
    // Ensure data directory exists
    await mkdir(dirname(dbPath), { recursive: true });
    
    // Initialize database
    await database.init();
    
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("✅ CRM MCP server started successfully on stdio transport");
    console.error(`🗄️ Database: ${dbPath}`);
    console.error("🔗 Server is ready to receive CRM requests");
  } catch (error) {
    console.error("❌ Failed to start CRM MCP server:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.error("📴 Shutting down CRM MCP server...");
  await database.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error("📴 Shutting down CRM MCP server...");
  await database.close();
  process.exit(0);
});

// Start the server
main().catch(async (error) => {
  console.error("💥 Fatal error starting CRM server:", error);
  await database.close();
  process.exit(1);
});