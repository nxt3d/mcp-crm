#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'sqlite3';
const { Database } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface DatabaseStats {
  contacts: number;
  entries: number;
  size: string;
}

class DatabaseManager {
  private dbPath: string;
  private archiveDir: string;

  constructor() {
    this.dbPath = path.join(__dirname, '..', '..', 'data', 'crm.sqlite');
    this.archiveDir = path.join(__dirname, '..', '..', 'data', 'archives');
  }

  /**
   * Get statistics about the current database
   */
  async getDatabaseStats(): Promise<DatabaseStats | null> {
    if (!fs.existsSync(this.dbPath)) {
      return null;
    }

    return new Promise((resolve, reject) => {
      const db = new Database(this.dbPath);
      
      Promise.all([
        new Promise<number>((res, rej) => {
          db.get("SELECT COUNT(*) as count FROM contacts", (err, row: any) => {
            if (err) rej(err);
            else res(row.count);
          });
        }),
        new Promise<number>((res, rej) => {
          db.get("SELECT COUNT(*) as count FROM contact_entries", (err, row: any) => {
            if (err) rej(err);
            else res(row.count);
          });
        })
      ]).then(([contacts, entries]) => {
        const stats = fs.statSync(this.dbPath);
        const size = `${(stats.size / 1024).toFixed(2)} KB`;
        
        db.close();
        resolve({ contacts, entries, size });
      }).catch(reject);
    });
  }

  /**
   * Archive the current database with a timestamp
   */
  async archiveDatabase(reason?: string): Promise<string | null> {
    if (!fs.existsSync(this.dbPath)) {
      console.log("📭 No existing database to archive");
      return null;
    }

    // Ensure archive directory exists
    if (!fs.existsSync(this.archiveDir)) {
      fs.mkdirSync(this.archiveDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reasonSuffix = reason ? `-${reason}` : '';
    const archiveName = `crm-backup-${timestamp}${reasonSuffix}.sqlite`;
    const archivePath = path.join(this.archiveDir, archiveName);

    try {
      // Get stats before archiving
      const stats = await this.getDatabaseStats();
      
      // Copy the database file
      fs.copyFileSync(this.dbPath, archivePath);
      
      console.log("📦 Database archived successfully!");
      console.log(`   Archive: ${archiveName}`);
      if (stats) {
        console.log(`   Data: ${stats.contacts} contacts, ${stats.entries} entries (${stats.size})`);
      }
      console.log(`   Location: ${archivePath}`);
      
      return archivePath;
    } catch (error) {
      console.error("❌ Failed to archive database:", error);
      throw error;
    }
  }

  /**
   * Create a fresh database with empty tables
   */
  async createFreshDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const db = new Database(this.dbPath);
      
      // Create contacts table
      db.run(`
        CREATE TABLE IF NOT EXISTS contacts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          organization TEXT,
          job_title TEXT,
          email TEXT,
          phone TEXT,
          notes TEXT,
          is_archived BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Create contact_entries table
        db.run(`
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
        `, (err) => {
          if (err) {
            reject(err);
            return;
          }

          db.close();
          console.log("✅ Fresh database created with empty tables");
          resolve();
        });
      });
    });
  }

  /**
   * Reset the database: archive current and create fresh
   */
  async resetDatabase(reason?: string): Promise<void> {
    console.log("🔄 Resetting CRM Database");
    console.log("=" .repeat(50));

    try {
      // Archive existing database if it exists
      const archivePath = await this.archiveDatabase(reason);
      
      // Remove current database
      if (fs.existsSync(this.dbPath)) {
        fs.unlinkSync(this.dbPath);
        console.log("🗑️ Current database removed");
      }

      // Create fresh database
      await this.createFreshDatabase();
      
      console.log("\n🎉 Database reset complete!");
      console.log("   Your CRM now has a fresh, empty database");
      if (archivePath) {
        console.log("   Previous data is safely archived and can be restored if needed");
      }

    } catch (error) {
      console.error("💥 Database reset failed:", error);
      throw error;
    }
  }

  /**
   * List all archived databases
   */
  async listArchives(): Promise<void> {
    if (!fs.existsSync(this.archiveDir)) {
      console.log("📭 No archives found");
      return;
    }

    const archives = fs.readdirSync(this.archiveDir)
      .filter(file => file.endsWith('.sqlite'))
      .sort()
      .reverse(); // Most recent first

    if (archives.length === 0) {
      console.log("📭 No database archives found");
      return;
    }

    console.log("📦 Database Archives");
    console.log("=" .repeat(50));

    for (const archive of archives) {
      const archivePath = path.join(this.archiveDir, archive);
      const stats = fs.statSync(archivePath);
      const size = `${(stats.size / 1024).toFixed(2)} KB`;
      const date = stats.mtime.toLocaleString();
      
      console.log(`📁 ${archive}`);
      console.log(`   Created: ${date}`);
      console.log(`   Size: ${size}`);
      console.log(`   Path: ${archivePath}`);
      console.log("");
    }
  }

  /**
   * Restore from an archive
   */
  async restoreFromArchive(archiveName: string): Promise<void> {
    const archivePath = path.join(this.archiveDir, archiveName);
    
    if (!fs.existsSync(archivePath)) {
      throw new Error(`Archive not found: ${archiveName}`);
    }

    console.log("🔄 Restoring from archive");
    console.log("=" .repeat(50));

    try {
      // Archive current database first
      await this.archiveDatabase('before-restore');
      
      // Restore from archive
      fs.copyFileSync(archivePath, this.dbPath);
      
      // Get stats of restored database
      const stats = await this.getDatabaseStats();
      
      console.log("✅ Database restored successfully!");
      console.log(`   Restored from: ${archiveName}`);
      if (stats) {
        console.log(`   Data: ${stats.contacts} contacts, ${stats.entries} entries (${stats.size})`);
      }

    } catch (error) {
      console.error("💥 Database restore failed:", error);
      throw error;
    }
  }

  /**
   * List contact entries with optional contact ID filter
   */
  async listContactEntries(contactId?: number, limit?: number): Promise<void> {
    if (!fs.existsSync(this.dbPath)) {
      console.log("📭 No database found");
      return;
    }

    return new Promise((resolve, reject) => {
      const db = new Database(this.dbPath);
      
      let query = contactId 
        ? `SELECT ce.*, c.name as contact_name FROM contact_entries ce 
           JOIN contacts c ON ce.contact_id = c.id 
           WHERE ce.contact_id = ? ORDER BY ce.entry_date DESC`
        : `SELECT ce.*, c.name as contact_name FROM contact_entries ce 
           JOIN contacts c ON ce.contact_id = c.id 
           ORDER BY ce.entry_date DESC`;
      
      let params: any[] = contactId ? [contactId] : [];
      
      if (limit) {
        query += ` LIMIT ?`;
        params.push(limit);
      }
      
      db.all(query, params, (err: any, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }

        if (rows.length === 0) {
          console.log("📭 No contact entries found");
          db.close();
          resolve();
          return;
        }

        console.log("📝 Contact Entries");
        if (limit) {
          console.log(`   Showing ${rows.length} most recent entries (limited to ${limit})`);
        } else {
          console.log(`   Showing all ${rows.length} entries`);
        }
        console.log("=" .repeat(80));

        rows.forEach((entry, index) => {
          console.log(`Entry #${entry.id} (${entry.contact_name})`);
          console.log(`  Type: ${entry.entry_type.toUpperCase()}`);
          console.log(`  Subject: ${entry.subject}`);
          console.log(`  Date: ${entry.entry_date}`);
          if (entry.content) {
            console.log(`  Content: ${entry.content.substring(0, 100)}${entry.content.length > 100 ? '...' : ''}`);
          }
          if (index < rows.length - 1) console.log("");
        });

        db.close();
        resolve();
      });
    });
  }

  /**
   * Delete a contact entry by ID
   */
  async deleteContactEntry(entryId: number): Promise<void> {
    if (!fs.existsSync(this.dbPath)) {
      throw new Error("No database found");
    }

    return new Promise((resolve, reject) => {
      const db = new Database(this.dbPath);
      
      // First get the entry details for confirmation
      db.get("SELECT ce.*, c.name as contact_name FROM contact_entries ce JOIN contacts c ON ce.contact_id = c.id WHERE ce.id = ?", [entryId], (err: any, row: any) => {
        if (err) {
          reject(err);
          return;
        }

        if (!row) {
          console.log(`❌ Contact entry with ID ${entryId} not found`);
          db.close();
          resolve();
          return;
        }

        console.log("🗑️ Deleting Contact Entry");
        console.log("=" .repeat(50));
        console.log(`Entry ID: ${row.id}`);
        console.log(`Contact: ${row.contact_name}`);
        console.log(`Type: ${row.entry_type.toUpperCase()}`);
        console.log(`Subject: ${row.subject}`);
        console.log(`Date: ${row.entry_date}`);

        // Delete the entry
        db.run("DELETE FROM contact_entries WHERE id = ?", [entryId], function(err: any) {
          if (err) {
            reject(err);
            return;
          }

          // @ts-ignore - this.changes is available on the function context
          if (this.changes > 0) {
            console.log("✅ Contact entry deleted successfully!");
          } else {
            console.log("❌ No entry was deleted (entry may not exist)");
          }

          db.close();
          resolve();
        });
      });
    });
  }

  /**
   * Show detailed view of a contact entry
   */
  async viewContactEntry(entryId: number): Promise<void> {
    if (!fs.existsSync(this.dbPath)) {
      console.log("📭 No database found");
      return;
    }

    return new Promise((resolve, reject) => {
      const db = new Database(this.dbPath);
      
      db.get("SELECT ce.*, c.name as contact_name FROM contact_entries ce JOIN contacts c ON ce.contact_id = c.id WHERE ce.id = ?", [entryId], (err: any, row: any) => {
        if (err) {
          reject(err);
          return;
        }

        if (!row) {
          console.log(`❌ Contact entry with ID ${entryId} not found`);
          db.close();
          resolve();
          return;
        }

        console.log("📄 Contact Entry Details");
        console.log("=" .repeat(50));
        console.log(`Entry ID: ${row.id}`);
        console.log(`Contact: ${row.contact_name} (ID: ${row.contact_id})`);
        console.log(`Type: ${row.entry_type.toUpperCase()}`);
        console.log(`Subject: ${row.subject}`);
        console.log(`Entry Date: ${row.entry_date}`);
        console.log(`Created: ${row.created_at}`);
        console.log("");
        console.log("Content:");
        console.log(row.content || "(No content)");

        db.close();
        resolve();
      });
    });
  }

  /**
   * Update a contact entry by ID
   */
  async updateContactEntry(entryId: number, updates: { entry_type?: string; subject?: string; content?: string }): Promise<void> {
    if (!fs.existsSync(this.dbPath)) {
      throw new Error("No database found");
    }

    return new Promise((resolve, reject) => {
      const db = new Database(this.dbPath);
      
      // First get the entry details for confirmation
      db.get("SELECT ce.*, c.name as contact_name FROM contact_entries ce JOIN contacts c ON ce.contact_id = c.id WHERE ce.id = ?", [entryId], (err: any, row: any) => {
        if (err) {
          reject(err);
          return;
        }

        if (!row) {
          console.log(`❌ Contact entry with ID ${entryId} not found`);
          db.close();
          resolve();
          return;
        }

        console.log("✏️ Updating Contact Entry");
        console.log("=" .repeat(50));
        console.log(`Entry ID: ${row.id}`);
        console.log(`Contact: ${row.contact_name}`);
        console.log("");
        console.log("Current values:");
        console.log(`  Type: ${row.entry_type.toUpperCase()}`);
        console.log(`  Subject: ${row.subject}`);
        console.log(`  Content: ${row.content ? row.content.substring(0, 100) + (row.content.length > 100 ? '...' : '') : '(No content)'}`);
        console.log("");

        // Build update query
        const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
        const values = [...Object.values(updates), entryId];

        if (Object.keys(updates).length === 0) {
          console.log("❌ No updates provided");
          db.close();
          resolve();
          return;
        }

        // Update the entry
        db.run(`UPDATE contact_entries SET ${fields} WHERE id = ?`, values, function(err: any) {
          if (err) {
            reject(err);
            return;
          }

          // @ts-ignore - this.changes is available on the function context
          if (this.changes > 0) {
            console.log("✅ Contact entry updated successfully!");
            console.log("Updated fields:", Object.keys(updates).join(', '));
          } else {
            console.log("❌ No entry was updated (entry may not exist)");
          }

          db.close();
          resolve();
        });
      });
    });
  }
}

// CLI Interface
async function main() {
  const manager = new DatabaseManager();
  const command = process.argv[2];
  const arg = process.argv[3];

  try {
    switch (command) {
      case 'reset':
        await manager.resetDatabase(arg);
        break;
        
      case 'archive':
        await manager.archiveDatabase(arg);
        break;
        
      case 'list':
        await manager.listArchives();
        break;
        
      case 'restore':
        if (!arg) {
          console.error("❌ Please specify an archive name to restore");
          console.log("Use 'npm run db:list' to see available archives");
          process.exit(1);
        }
        await manager.restoreFromArchive(arg);
        break;
        
      case 'stats':
        const stats = await manager.getDatabaseStats();
        if (stats) {
          console.log("📊 Current Database Statistics");
          console.log("=" .repeat(50));
          console.log(`Contacts: ${stats.contacts}`);
          console.log(`Entries: ${stats.entries}`);
          console.log(`Size: ${stats.size}`);
        } else {
          console.log("📭 No database found");
        }
        break;

      case 'list-entries':
        const contactId = process.argv[3] ? parseInt(process.argv[3]) : undefined;
        const limit = process.argv[4] ? parseInt(process.argv[4]) : undefined;
        
        if (process.argv[3] && isNaN(contactId!)) {
          console.error("❌ Contact ID must be a number");
          process.exit(1);
        }
        
        if (process.argv[4] && isNaN(limit!)) {
          console.error("❌ Limit must be a number");
          process.exit(1);
        }
        
        await manager.listContactEntries(contactId, limit);
        break;

      case 'view-entry':
        if (!arg) {
          console.error("❌ Please specify an entry ID to view");
          console.log("Use 'npm run db:list-entries' to see available entries");
          process.exit(1);
        }
        const viewEntryId = parseInt(arg);
        if (isNaN(viewEntryId)) {
          console.error("❌ Entry ID must be a number");
          process.exit(1);
        }
        await manager.viewContactEntry(viewEntryId);
        break;

      case 'delete-entry':
        if (!arg) {
          console.error("❌ Please specify an entry ID to delete");
          console.log("Use 'npm run db:list-entries' to see available entries");
          process.exit(1);
        }
        const deleteEntryId = parseInt(arg);
        if (isNaN(deleteEntryId)) {
          console.error("❌ Entry ID must be a number");
          process.exit(1);
        }
        await manager.deleteContactEntry(deleteEntryId);
        break;

      case 'update-entry':
        if (!arg) {
          console.error("❌ Please specify an entry ID to update");
          console.log("Use 'npm run db:list-entries' to see available entries");
          console.log("Usage: npm run db:update-entry <entry_id> <field> <value>");
          console.log("Fields: entry_type, subject, content");
          process.exit(1);
        }
        
        const updateEntryId = parseInt(arg);
        if (isNaN(updateEntryId)) {
          console.error("❌ Entry ID must be a number");
          process.exit(1);
        }

        const field = process.argv[4];
        const value = process.argv.slice(5).join(' '); // Join remaining args for content
        
        if (!field || !value) {
          console.error("❌ Please specify field and value to update");
          console.log("Usage: npm run db:update-entry <entry_id> <field> <value>");
          console.log("Fields: entry_type, subject, content");
          process.exit(1);
        }

        if (!['entry_type', 'subject', 'content'].includes(field)) {
          console.error("❌ Invalid field. Must be one of: entry_type, subject, content");
          process.exit(1);
        }

        const updates: any = {};
        updates[field] = value;
        await manager.updateContactEntry(updateEntryId, updates);
        break;
        
      default:
        console.log("🗄️ CRM Database Manager");
        console.log("=" .repeat(50));
        console.log("Available commands:");
        console.log("");
        console.log("Database Management:");
        console.log("  reset [reason]    - Archive current DB and create fresh empty DB");
        console.log("  archive [reason]  - Archive current DB (keep current DB)");
        console.log("  list             - List all archived databases");
        console.log("  restore <name>   - Restore from an archived database");
        console.log("  stats            - Show current database statistics");
        console.log("");
        console.log("Contact Entry Management:");
        console.log("  list-entries [contact_id] [limit] - List contact entries (optionally filtered by contact, with optional limit)");
        console.log("  view-entry <entry_id>             - View detailed contact entry");
        console.log("  delete-entry <entry_id>           - Delete a contact entry");
        console.log("  update-entry <entry_id> <field> <value> - Update a contact entry");
        console.log("");
        console.log("Examples:");
        console.log("  npm run db:reset");
        console.log("  npm run db:reset cleanup");
        console.log("  npm run db:archive before-testing");
        console.log("  npm run db:list");
        console.log("  npm run db:restore crm-backup-2025-06-04T19-15-35.sqlite");
        console.log("  npm run db:stats");
        console.log("  npm run db:list-entries");
        console.log("  npm run db:list-entries 1");
        console.log("  npm run db:list-entries \"\" 10     # List 10 most recent entries (all contacts)");
        console.log("  npm run db:list-entries 1 5       # List 5 most recent entries for contact 1");
        console.log("  npm run db:view-entry 1");
        console.log("  npm run db:delete-entry 1");
        console.log("  npm run db:update-entry 1 entry_type note");
        break;
    }
  } catch (error) {
    console.error("💥 Command failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
} 