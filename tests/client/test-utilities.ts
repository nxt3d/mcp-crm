import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface TestConfig {
  serverPath: string;
  testDatabase: string;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  timeout: number;
}

export interface TestData {
  contacts: ContactTestData[];
  entries: EntryTestData[];
}

export interface ContactTestData {
  name: string;
  organization?: string;
  job_title?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

export interface EntryTestData {
  contact_id: number;
  entry_type: 'call' | 'email' | 'meeting' | 'note' | 'task';
  content: string;
  outcome?: string;
}

export interface TestReport {
  timestamp: string;
  duration: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: TestResult[];
  performance: PerformanceMetrics;
}

export interface TestResult {
  testName: string;
  success: boolean;
  duration: number;
  error?: string;
  data?: any;
  timestamp: string;
}

export interface PerformanceMetrics {
  averageResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
  totalRequests: number;
}

export class TestReporter {
  private results: TestResult[] = [];
  private startTime: number = 0;

  startReport(): void {
    this.startTime = Date.now();
    this.results = [];
    console.log("📊 Starting test report...");
  }

  addResult(result: TestResult): void {
    this.results.push(result);
    const status = result.success ? "✅" : "❌";
    console.log(`${status} ${result.testName} (${result.duration}ms)`);
  }

  generateReport(): TestReport {
    const duration = Date.now() - this.startTime;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = this.results.filter(r => !r.success).length;
    
    const responseTimes = this.results.map(r => r.duration);
    const performance: PerformanceMetrics = {
      averageResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length || 0,
      maxResponseTime: Math.max(...responseTimes) || 0,
      minResponseTime: Math.min(...responseTimes) || 0,
      totalRequests: this.results.length
    };

    const report: TestReport = {
      timestamp: new Date().toISOString(),
      duration,
      totalTests: this.results.length,
      passedTests,
      failedTests,
      results: this.results,
      performance
    };

    console.log(`\n📈 Test Report Summary:`);
    console.log(`  Total Duration: ${duration}ms`);
    console.log(`  Tests Passed: ${passedTests}/${this.results.length}`);
    console.log(`  Tests Failed: ${failedTests}`);
    console.log(`  Avg Response Time: ${performance.averageResponseTime.toFixed(2)}ms`);
    console.log(`  Max Response Time: ${performance.maxResponseTime}ms`);
    console.log(`  Min Response Time: ${performance.minResponseTime}ms`);

    return report;
  }

  saveReport(report: TestReport, filename: string): void {
    import('fs').then(fs => {
      import('path').then(path => {
        const reportsDir = path.join(__dirname, '../results/test-reports');
        if (!fs.existsSync(reportsDir)) {
          fs.mkdirSync(reportsDir, { recursive: true });
        }
        
        const reportPath = path.join(reportsDir, filename);
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log(`💾 Report saved to: ${reportPath}`);
      });
    });
  }
}

export class TestDataGenerator {
  static generateTestContacts(count: number): ContactTestData[] {
    const contacts: ContactTestData[] = [];
    const organizations = ["TechCorp Inc", "StartupXYZ", "BigCorp Ltd", "InnovateCo", "DevHouse"];
    const jobTitles = ["CEO", "CTO", "Software Engineer", "Product Manager", "Sales Director"];
    
    for (let i = 1; i <= count; i++) {
      contacts.push({
        name: `Test Contact ${i}`,
        organization: organizations[i % organizations.length],
        job_title: jobTitles[i % jobTitles.length],
        email: `test${i}@example.com`,
        phone: `+1-555-${String(i).padStart(4, '0')}`,
        notes: `Test notes for contact ${i}`
      });
    }
    
    return contacts;
  }

  static generateTestEntries(contactId: number, count: number): EntryTestData[] {
    const entries: EntryTestData[] = [];
    const types: Array<'call' | 'email' | 'meeting' | 'note' | 'task'> = 
      ['call', 'email', 'meeting', 'note', 'task'];
    
    for (let i = 1; i <= count; i++) {
      entries.push({
        contact_id: contactId,
        entry_type: types[i % types.length],
        content: `Test ${types[i % types.length]} entry ${i}`,
        outcome: i % 2 === 0 ? "completed" : "pending"
      });
    }
    
    return entries;
  }
}

export class TestValidator {
  static validateContact(contact: any): boolean {
    return (
      contact &&
      typeof contact.id === 'number' &&
      typeof contact.name === 'string' &&
      contact.name.length > 0
    );
  }

  static validateContactList(contacts: any[]): boolean {
    return Array.isArray(contacts) && contacts.every(contact => 
      this.validateContact(contact)
    );
  }

  static validateEntry(entry: any): boolean {
    return (
      entry &&
      typeof entry.id === 'number' &&
      typeof entry.contact_id === 'number' &&
      typeof entry.entry_type === 'string' &&
      typeof entry.content === 'string'
    );
  }

  static validateCSVContent(csvContent: string): boolean {
    const lines = csvContent.split('\n').filter(line => line.trim());
    return lines.length > 1; // At least header + one data row
  }

  static validateResponseTime(duration: number, maxMs: number): boolean {
    return duration <= maxMs;
  }
}

export class TestDatabaseManager {
  private testDbPath: string;
  private isTemporary: boolean;

  constructor(testName?: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dbName = testName ? `test-${testName}-${timestamp}.sqlite` : `test-${timestamp}.sqlite`;
    this.testDbPath = path.join(__dirname, '..', 'data', dbName);
    this.isTemporary = true;
  }

  /**
   * Creates the test database directory and returns the database path
   */
  async setupTestDatabase(): Promise<string> {
    const dbDir = path.dirname(this.testDbPath);
    
    // Ensure the test data directory exists
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Clean up any existing test database file
    if (fs.existsSync(this.testDbPath)) {
      fs.unlinkSync(this.testDbPath);
    }

    console.log(`🗄️ Test database prepared: ${this.testDbPath}`);
    return this.testDbPath;
  }

  /**
   * Cleans up the test database after tests complete
   */
  async cleanupTestDatabase(): Promise<void> {
    if (this.isTemporary && fs.existsSync(this.testDbPath)) {
      try {
        fs.unlinkSync(this.testDbPath);
        console.log(`🗑️ Test database cleaned up: ${this.testDbPath}`);
      } catch (error) {
        console.warn(`⚠️ Failed to cleanup test database: ${error}`);
      }
    }
  }

  /**
   * Get the current test database path
   */
  getTestDatabasePath(): string {
    return this.testDbPath;
  }

  /**
   * Set whether this database should be automatically cleaned up
   */
  setTemporary(temporary: boolean): void {
    this.isTemporary = temporary;
  }

  /**
   * Creates a fresh test database with a specific name (useful for preserving test data)
   */
  static createNamedTestDatabase(name: string): TestDatabaseManager {
    const manager = new TestDatabaseManager(name);
    manager.setTemporary(false); // Named databases are not automatically cleaned up
    return manager;
  }
}

export const DEFAULT_TEST_CONFIG: TestConfig = {
  serverPath: "../build/crm-server.js",
  testDatabase: "data/test-crm.sqlite",
  logLevel: "info",
  timeout: 5000
}; 