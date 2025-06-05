#!/usr/bin/env node

import { execSync } from "child_process";

console.log("🚀 CRM MCP Server - Phase B: Core Tool Testing");
console.log("=" .repeat(80));
console.log(`📅 Started at: ${new Date().toISOString()}`);
console.log("🧪 Running comprehensive test suite for all 14 CRM tools...\n");

const testSuites = [
  {
    name: "Contact Management",
    description: "Tests 7 contact CRUD operations, search, and organization filtering tools",
    command: "npx tsx scenarios/contact-management.test.ts",
    category: "B1: Core Contact Management"
  },
  {
    name: "Contact History",
    description: "Tests 3 interaction tracking, history retrieval, and recent activities tools",
    command: "npx tsx scenarios/contact-history.test.ts",
    category: "B2: Contact History Management"
  },
  {
    name: "Export Functionality",
    description: "Tests 3 CSV export features for contacts, history, and full CRM export",
    command: "npx tsx scenarios/export-functionality.test.ts",
    category: "B3: Data Export Features"
  }
];

let totalPassed = 0;
let totalSuites = testSuites.length;
let allResults: Array<{suite: string, passed: boolean, duration: number}> = [];
const startTime = Date.now();

for (const suite of testSuites) {
  console.log(`\n🔧 ${suite.category}`);
  console.log(`📋 Suite: ${suite.name}`);
  console.log(`📝 Description: ${suite.description}`);
  console.log("-" .repeat(60));

  const suiteStartTime = Date.now();
  
  try {
    execSync(suite.command, { 
      stdio: 'pipe',
      cwd: process.cwd()
    });
    
    const duration = Date.now() - suiteStartTime;
    console.log(`✅ PASSED ${suite.name} (${duration}ms)`);
    totalPassed++;
    allResults.push({suite: suite.name, passed: true, duration});
    
  } catch (error) {
    const duration = Date.now() - suiteStartTime;
    console.log(`❌ FAILED ${suite.name} (${duration}ms)`);
    console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    allResults.push({suite: suite.name, passed: false, duration});
  }
}

const totalDuration = Date.now() - startTime;

console.log("\n" + "=" .repeat(80));
console.log("📊 PHASE B: CORE TOOL TESTING - FINAL SUMMARY");
console.log("=" .repeat(80));

console.log(`\n📈 Overall Results:`);
console.log(`  🧪 Total Test Suites: ${totalSuites}`);
console.log(`  ✅ Passed: ${totalPassed}`);
console.log(`  ❌ Failed: ${totalSuites - totalPassed}`);
console.log(`  ⏱️  Total Duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`);
console.log(`  📅 Completed: ${new Date().toISOString()}`);

console.log(`\n📋 Suite Results:`);
for (const result of allResults) {
  const status = result.passed ? "✅" : "❌";
  console.log(`  ${status} ${result.suite.padEnd(25)} ${result.duration.toString().padStart(6)}ms`);
}

const averageDuration = allResults.reduce((sum, r) => sum + r.duration, 0) / allResults.length;
console.log(`\n⚡ Performance Summary:`);
console.log(`  📊 Average Suite Duration: ${averageDuration.toFixed(2)}ms`);

// Tool summary
const toolCounts = {
  "Contact Management": 7,
  "Contact History": 3, 
  "Export Functionality": 3
};

let totalToolsTested = 0;
for (const result of allResults) {
  if (result.passed) {
    totalToolsTested += toolCounts[result.suite as keyof typeof toolCounts] || 0;
  }
}

console.log(`\n🛠️ Tools Validated:`);
console.log(`  📋 Total CRM Tools: 13`);
console.log(`  ✅ Successfully Tested: ${totalToolsTested}/13`);
console.log(`  📊 Coverage: ${((totalToolsTested / 13) * 100).toFixed(1)}%`);

if (totalPassed === totalSuites) {
  console.log(`\n🎯 PHASE B STATUS: ✅ COMPLETE SUCCESS!`);
  console.log("🚀 All 14 CRM MCP tools are fully operational!");
  console.log("✅ Contact management (add, list, search, update, archive) - WORKING");
  console.log("✅ Organization filtering and contact details - WORKING");
  console.log("✅ Contact history tracking (add, retrieve, recent activities) - WORKING");
  console.log("✅ CSV export functionality (contacts, history, full CRM) - WORKING");
  console.log("\n🎉 CRM MCP Server is ready for Phase C: Advanced Testing!");
} else {
  console.log(`\n⚠️ PHASE B STATUS: PARTIAL SUCCESS`);
  console.log(`${totalPassed}/${totalSuites} test suites passed`);
  console.log("❌ Review failed test suites before proceeding to next phase");
}

console.log("\n" + "=" .repeat(80));

process.exit(totalPassed === totalSuites ? 0 : 1); 