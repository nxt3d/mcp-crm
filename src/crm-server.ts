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
import { toolDescriptions } from "./tool-descriptions.js";

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

interface ContactTodo {
  id: number;
  contact_id: number;
  todo_text: string;
  target_date: string | null;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
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

      // Create contact_todos table
      this.createContactTodosTable(resolve, reject);
    });
  }

  private createContactTodosTable(resolve: () => void, reject: (error: any) => void): void {
    // Create contact_todos table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS contact_todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id INTEGER NOT NULL,
        todo_text TEXT NOT NULL,
        target_date DATETIME,
        is_completed BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (contact_id) REFERENCES contacts (id)
      )
    `, (err: any) => {
      if (err) {
        reject(err);
        return;
      }

      console.error("✅ CRM database initialized with contacts, contact_entries, and contact_todos tables");
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
    interaction_date: string;
  }): Promise<number> {
    return new Promise((resolve, reject) => {
      const query = `INSERT INTO contact_entries (contact_id, entry_type, subject, content, entry_date) VALUES (?, ?, ?, ?, ?)`;
      const params = [data.contact_id, data.entry_type, data.subject, data.content || null, data.interaction_date];

      this.db.run(query, params, function(err: any) {
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
    interaction_date: string;
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
      if (contactId) {
        // First get the contact details for header information
        this.db.get(
          'SELECT * FROM contacts WHERE id = ?',
          [contactId],
          (err: any, contact: Contact) => {
            if (err) {
              reject(err);
              return;
            }

            if (!contact) {
              reject(new Error(`Contact with ID ${contactId} not found`));
              return;
            }

            // Now get the contact history
            const query = `SELECT ce.*, c.name as contact_name FROM contact_entries ce 
                          JOIN contacts c ON ce.contact_id = c.id 
                          WHERE ce.contact_id = ? ORDER BY ce.entry_date ASC`;
            
            this.db.all(query, [contactId], (err: any, rows: Array<ContactEntry & { contact_name: string }>) => {
              if (err) {
                reject(err);
                return;
              }

              // Build CSV with contact info at top
              const csvRows = [];
              
              // Contact Information Header
              csvRows.push('=== CONTACT INFORMATION ===');
              csvRows.push(`Name,"${contact.name.replace(/"/g, '""')}"`);
              csvRows.push(`Organization,"${(contact.organization || '').replace(/"/g, '""')}"`);
              csvRows.push(`Job Title,"${(contact.job_title || '').replace(/"/g, '""')}"`);
              csvRows.push(`Email,"${(contact.email || '').replace(/"/g, '""')}"`);
              csvRows.push(`Phone,"${(contact.phone || '').replace(/"/g, '""')}"`);
              csvRows.push(`Telegram,"${(contact.telegram || '').replace(/"/g, '""')}"`);
              csvRows.push(`X Account,"${(contact.x_account || '').replace(/"/g, '""')}"`);
              csvRows.push(`Notes,"${(contact.notes || '').replace(/"/g, '""')}"`);
              csvRows.push(`Created,${contact.created_at}`);
              csvRows.push(`Updated,${contact.updated_at}`);
              csvRows.push('');
              
              // Contact History Header
              csvRows.push('=== CONTACT HISTORY ===');
              const headers = ['Entry Date', 'Entry ID', 'Contact Name', 'Entry Type', 'Subject', 'Content', 'Created'];
              csvRows.push(headers.join(','));
              
              rows.forEach(entry => {
                const row = [
                  entry.entry_date,
                  entry.id.toString(),
                  `"${entry.contact_name.replace(/"/g, '""')}"`,
                  `"${entry.entry_type.replace(/"/g, '""')}"`,
                  `"${entry.subject.replace(/"/g, '""')}"`,
                  `"${(entry.content || '').replace(/"/g, '""')}"`,
                  entry.created_at
                ];
                csvRows.push(row.join(','));
              });
              
              resolve(csvRows.join('\n'));
            });
          }
        );
      } else {
        // Export all contact history without individual contact headers
        const query = `SELECT ce.*, c.name as contact_name FROM contact_entries ce 
                      JOIN contacts c ON ce.contact_id = c.id 
                      ORDER BY ce.entry_date ASC`;
        
        this.db.all(query, [], (err: any, rows: Array<ContactEntry & { contact_name: string }>) => {
          if (err) {
            reject(err);
            return;
          }

          const headers = ['Entry Date', 'Entry ID', 'Contact Name', 'Entry Type', 'Subject', 'Content', 'Created'];
          const csvRows = [headers.join(',')];
          
          rows.forEach(entry => {
            const row = [
              entry.entry_date,
              entry.id.toString(),
              `"${entry.contact_name.replace(/"/g, '""')}"`,
              `"${entry.entry_type.replace(/"/g, '""')}"`,
              `"${entry.subject.replace(/"/g, '""')}"`,
              `"${(entry.content || '').replace(/"/g, '""')}"`,
              entry.created_at
            ];
            csvRows.push(row.join(','));
          });
          
          resolve(csvRows.join('\n'));
        });
      }
    });
  }

  async exportContactsWithConcatenatedHistory(includeArchived: boolean = false): Promise<string> {
    return new Promise(async (resolve, reject) => {
      try {
        // Get all contacts
        const contacts = await this.listContacts(includeArchived);
        
        // For each contact, get their history and concatenate it
        const headers = ['ID', 'Name', 'Organization', 'Job Title', 'Email', 'Phone', 'Telegram', 'X Account', 'Notes', 'Archived', 'Created', 'Updated', 'History'];
        const csvRows = [headers.join(',')];
        
        for (const contact of contacts) {
          // Get contact history
          const history = await this.getContactHistory(contact.id);
          
          // Concatenate history entries into a single string
          const historyString = history.map(entry => {
            const entryText = `${entry.entry_date} [${entry.entry_type}] ${entry.subject}${entry.content ? ': ' + entry.content : ''}`;
            return entryText.replace(/"/g, '""'); // Escape quotes in history
          }).join(' / ');
          
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
            contact.updated_at,
            `"${historyString}"`
          ];
          csvRows.push(row.join(','));
        }
        
        resolve(csvRows.join('\n'));
      } catch (error) {
        reject(error);
      }
    });
  }

  // Todo CRUD operations
  async addTodo(data: {
    contact_id: number;
    todo_text: string;
    target_date?: string;
  }): Promise<number> {
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO contact_todos (contact_id, todo_text, target_date)
        VALUES (?, ?, ?)
      `, [
        data.contact_id,
        data.todo_text,
        data.target_date || null
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

  async updateTodo(id: number, data: Partial<{
    todo_text: string;
    target_date: string;
    is_completed: boolean;
  }>): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const updateFields: string[] = [];
      const values: any[] = [];
      
      if (data.todo_text !== undefined) {
        updateFields.push("todo_text = ?");
        values.push(data.todo_text);
      }
      
      if (data.target_date !== undefined) {
        updateFields.push("target_date = ?");
        values.push(data.target_date);
      }
      
      if (data.is_completed !== undefined) {
        updateFields.push("is_completed = ?");
        values.push(data.is_completed ? 1 : 0);
      }
      
      // Always update the updated_at timestamp
      updateFields.push("updated_at = CURRENT_TIMESTAMP");
      
      if (updateFields.length === 1) { // Only updated_at was added
        resolve(false);
        return;
      }
      
      values.push(id);
      
      this.db.run(`
        UPDATE contact_todos 
        SET ${updateFields.join(", ")} 
        WHERE id = ?
      `, values, function(err: any) {
        if (err) {
          reject(err);
        } else {
          // @ts-ignore
          resolve(this.changes > 0);
        }
      });
    });
  }

  async getTodos(filters: {
    contact_id?: number;
    include_completed?: boolean;
    target_date_before?: string;
    target_date_after?: string;
    created_before?: string;
    created_after?: string;
  } = {}): Promise<Array<ContactTodo & { contact_name: string }>> {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT ct.*, c.name as contact_name 
        FROM contact_todos ct 
        JOIN contacts c ON ct.contact_id = c.id 
        WHERE 1=1
      `;
      const params: any[] = [];
      
      if (filters.contact_id) {
        query += " AND ct.contact_id = ?";
        params.push(filters.contact_id);
      }
      
      if (!filters.include_completed) {
        query += " AND ct.is_completed = 0";
      }
      
      if (filters.target_date_before) {
        query += " AND ct.target_date <= ?";
        params.push(filters.target_date_before);
      }
      
      if (filters.target_date_after) {
        query += " AND ct.target_date >= ?";
        params.push(filters.target_date_after);
      }
      
      if (filters.created_before) {
        query += " AND ct.created_at <= ?";
        params.push(filters.created_before);
      }
      
      if (filters.created_after) {
        query += " AND ct.created_at >= ?";
        params.push(filters.created_after);
      }
      
      query += " ORDER BY ct.target_date ASC, ct.created_at ASC";
      
      this.db.all(query, params, (err: any, rows: Array<ContactTodo & { contact_name: string }>) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  async deleteTodo(id: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.db.run("DELETE FROM contact_todos WHERE id = ?", [id], function(err: any) {
        if (err) {
          reject(err);
        } else {
          // @ts-ignore
          resolve(this.changes > 0);
        }
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
    name: z.string().describe(toolDescriptions.add_contact.name),
    organization: z.string().optional().describe(toolDescriptions.add_contact.organization),
    job_title: z.string().optional().describe(toolDescriptions.add_contact.job_title),
    email: z.string().optional().describe(toolDescriptions.add_contact.email),
    phone: z.string().optional().describe(toolDescriptions.add_contact.phone),
    telegram: z.string().optional().describe(toolDescriptions.add_contact.telegram),
    x_account: z.string().optional().describe(toolDescriptions.add_contact.x_account),
    notes: z.string().optional().describe(toolDescriptions.add_contact.notes)
  },
  {
    description: toolDescriptions.add_contact.description
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
    include_archived: z.boolean().optional().describe(toolDescriptions.list_contacts.include_archived)
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
    contact_id: z.number().describe(toolDescriptions.add_contact_entry.contact_id),
    entry_type: z.enum(['call', 'email', 'meeting', 'note', 'task']).describe(toolDescriptions.add_contact_entry.entry_type),
    subject: z.string().describe(toolDescriptions.add_contact_entry.subject),
    content: z.string().optional().describe(toolDescriptions.add_contact_entry.content),
    interaction_date: z.string().describe(toolDescriptions.add_contact_entry.interaction_date)
  },
  async ({ contact_id, entry_type, subject, content, interaction_date }) => {
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
        content,
        interaction_date
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
    entry_id: z.number().describe(toolDescriptions.update_contact_entry.entry_id),
    entry_type: z.enum(['call', 'email', 'meeting', 'note', 'task']).optional().describe(toolDescriptions.update_contact_entry.entry_type),
    subject: z.string().optional().describe(toolDescriptions.update_contact_entry.subject),
    content: z.string().optional().describe(toolDescriptions.update_contact_entry.content),
    interaction_date: z.string().optional().describe(toolDescriptions.update_contact_entry.interaction_date)
  },
  async ({ entry_id, entry_type, subject, content, interaction_date }) => {
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
      if (interaction_date !== undefined) updateData.interaction_date = interaction_date;

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
      
      // Ensure exports directory exists
      const exportsDir = join(__dirname, "..", "exports");
      await mkdir(exportsDir, { recursive: true });
      
      // Save CSV file
      const filePath = join(exportsDir, filename);
      await writeFile(filePath, csvContent, 'utf-8');
      
      return {
        content: [
          {
            type: "text",
            text: `📁 CSV Export Saved:\n\nFilename: ${filename}\nPath: ${filePath}\nIncludes archived: ${include_archived ? 'Yes' : 'No'}\nSize: ${csvContent.length} characters`
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
      
      let filename: string;
      if (contact_id) {
        const contact = await database.getContactById(contact_id);
        const contactName = contact ? contact.name.replace(/[^a-zA-Z0-9]/g, '_') : `contact_${contact_id}`;
        filename = `${contactName}_history_${new Date().toISOString().slice(0, 10)}.csv`;
      } else {
        filename = `all_contact_history_${new Date().toISOString().slice(0, 10)}.csv`;
      }
      
      // Ensure exports directory exists
      const exportsDir = join(__dirname, "..", "exports");
      await mkdir(exportsDir, { recursive: true });
      
      // Save CSV file
      const filePath = join(exportsDir, filename);
      await writeFile(filePath, csvContent, 'utf-8');
      
      return {
        content: [
          {
            type: "text",
            text: `📁 Contact History CSV Export Saved:\n\nFilename: ${filename}\nPath: ${filePath}\nScope: ${contact_id ? `Contact ID ${contact_id}` : 'All contacts'}\nSize: ${csvContent.length} characters`
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
      const fullCrmCsv = await database.exportContactsWithConcatenatedHistory(true); // Include archived
      
      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `full_crm_export_${timestamp}.csv`;
      
      // Ensure exports directory exists
      const exportsDir = join(__dirname, "..", "exports");
      await mkdir(exportsDir, { recursive: true });
      
      // Save CSV file
      const filePath = join(exportsDir, filename);
      await writeFile(filePath, fullCrmCsv, 'utf-8');
      
      return {
        content: [
          {
            type: "text",
            text: `📁 Full CRM CSV Export Saved:\n\nFilename: ${filename}\nPath: ${filePath}\nIncludes: All contacts (including archived) with concatenated history\nSize: ${fullCrmCsv.length} characters`
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

// TOOL 15: Add Todo
server.tool(
  "add_todo",
  {
    contact_id: z.number().describe("Contact ID to add todo for"),
    todo_text: z.string().describe("Todo description"),
    target_date: z.string().optional().describe("Target completion date (ISO datetime string, e.g. '2025-06-15T10:00:00Z')")
  },
  async ({ contact_id, todo_text, target_date }) => {
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

      const todoId = await database.addTodo({
        contact_id,
        todo_text,
        target_date
      });

      const targetDateText = target_date ? `\nTarget Date: ${target_date}` : '';

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully added todo for "${contact.name}" (Todo ID: ${todoId})\n\nTodo: ${todo_text}${targetDateText}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to add todo: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// TOOL 16: Update Todo
server.tool(
  "update_todo",
  {
    todo_id: z.number().describe("Todo ID to update"),
    todo_text: z.string().optional().describe("Updated todo description"),
    target_date: z.string().optional().describe("Updated target completion date (ISO datetime string)"),
    is_completed: z.boolean().optional().describe("Mark todo as completed/incomplete")
  },
  async ({ todo_id, todo_text, target_date, is_completed }) => {
    try {
      const updated = await database.updateTodo(todo_id, {
        todo_text,
        target_date,
        is_completed
      });

      if (!updated) {
        return {
          content: [
            {
              type: "text",
              text: `❌ Todo with ID ${todo_id} not found or no changes made`
            }
          ]
        };
      }

      const changes = [];
      if (todo_text) changes.push(`Text: "${todo_text}"`);
      if (target_date) changes.push(`Target Date: ${target_date}`);
      if (is_completed !== undefined) changes.push(`Status: ${is_completed ? 'Completed' : 'Incomplete'}`);

      return {
        content: [
          {
            type: "text",
            text: `✅ Successfully updated todo (ID: ${todo_id})\n\nUpdated: ${changes.join(', ')}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to update todo: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }
);

// TOOL 17: Get Todos
server.tool(
  "get_todos",
  {
    contact_id: z.number().optional().describe("Filter by specific contact ID"),
    include_completed: z.boolean().optional().describe("Include completed todos (default: false)"),
    days_ahead: z.number().optional().describe("Show todos due within X days"),
    days_old: z.number().optional().describe("Show todos created more than X days ago")
  },
  async ({ contact_id, include_completed = false, days_ahead, days_old }) => {
    try {
      const filters: any = {
        contact_id,
        include_completed
      };

      // Calculate date filters
      if (days_ahead) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + days_ahead);
        filters.target_date_before = futureDate.toISOString();
      }

      if (days_old) {
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - days_old);
        filters.created_before = pastDate.toISOString();
      }

      const todos = await database.getTodos(filters);

      if (todos.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "📝 No todos found matching your criteria"
            }
          ]
        };
      }

      const todosList = todos.map(todo => {
        const status = todo.is_completed ? '✅' : '⏳';
        const targetDate = todo.target_date ? `\n  🎯 Due: ${todo.target_date}` : '';
        const createdDate = `\n  📅 Created: ${todo.created_at}`;
        const updatedDate = todo.updated_at !== todo.created_at ? `\n  🔄 Updated: ${todo.updated_at}` : '';
        
        return `${status} [${todo.contact_name}] ${todo.todo_text}${targetDate}${createdDate}${updatedDate}`;
      }).join('\n\n');

      let filterDescription = '';
      if (contact_id) filterDescription += ` for contact ID ${contact_id}`;
      if (days_ahead) filterDescription += ` due within ${days_ahead} days`;
      if (days_old) filterDescription += ` created more than ${days_old} days ago`;
      if (include_completed) filterDescription += ` (including completed)`;

      return {
        content: [
          {
            type: "text",
            text: `📝 Todos${filterDescription} (${todos.length} found):\n\n${todosList}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Failed to get todos: ${error instanceof Error ? error.message : String(error)}`
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