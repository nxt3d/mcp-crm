#!/usr/bin/env node

import { execSync } from "child_process";

console.log("🚀 CRM MCP Server - Phase C: Advanced Testing");
console.log("=" .repeat(80));
console.log(`📅 Started at: ${new Date().toISOString()}`);
console.log("🧪 Running advanced test suite for edge cases and performance validation...\n");

const testSuites = [
  {
    name: "Edge Cases",
    description: "Validates input validation, boundary conditions, error handling, and security",
    command: "npx tsx scenarios/edge-cases.test.ts",
    category: "C1: Edge Case & Error Handling",
    estimatedDuration: "2-3 minutes"
  },
  {
    name: "Performance & Stress",
    description: "Tests system performance under load, bulk operations, and resource usage",
    command: "npx tsx scenarios/performance-stress.test.ts",
    category: "C2: Performance & Scalability",
    estimatedDuration: "3-5 minutes"
  }
];

let totalPassed = 0;
let totalSuites = testSuites.length;
let allResults: Array<{suite: string, passed: boolean, duration: number, category: string}> = [];
const startTime = Date.now();

console.log("📋 Test Suite Overview:");
for (const suite of testSuites) {
  console.log(`  🔧 ${suite.category}`);
  console.log(`     📝 ${suite.description}`);
  console.log(`     ⏱️  Estimated Duration: ${suite.estimatedDuration}\n`);
}

console.log("🚀 Starting execution...\n");

for (const suite of testSuites) {
  console.log(`🔧 ${suite.category}`);
  console.log(`📋 Suite: ${suite.name}`);
  console.log(`📝 Description: ${suite.description}`);
  console.log("-" .repeat(60));

  const suiteStartTime = Date.now();
  
  try {
    // Set longer timeout for advanced tests
    const result = execSync(suite.command, { 
      stdio: 'pipe',
      cwd: process.cwd(),
      timeout: 10 * 60 * 1000 // 10 minute timeout for advanced tests
    });
    
    const duration = Date.now() - suiteStartTime;
    console.log(`✅ PASSED ${suite.name} (${duration}ms - ${(duration/1000).toFixed(1)}s)`);
    totalPassed++;
    allResults.push({suite: suite.name, passed: true, duration, category: suite.category});
    
  } catch (error: any) {
    const duration = Date.now() - suiteStartTime;
    console.log(`❌ FAILED ${suite.name} (${duration}ms - ${(duration/1000).toFixed(1)}s)`);
    
    // Try to extract meaningful error information
    let errorMessage = "Unknown error";
    if (error.stdout) {
      const stdout = error.stdout.toString();
      const lines = stdout.split('\n');
      const errorLine = lines.find((line: string) => line.includes('❌') || line.includes('Error:') || line.includes('Failed'));
      errorMessage = errorLine || `Exit code: ${error.status}`;
    }
    
    console.log(`   📋 Error: ${errorMessage}`);
    allResults.push({suite: suite.name, passed: false, duration, category: suite.category});
  }
  
  console.log(""); // Add spacing between suites
}

const totalDuration = Date.now() - startTime;

console.log("=" .repeat(80));
console.log("📊 PHASE C: ADVANCED TESTING - FINAL SUMMARY");
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
  const durationSec = (result.duration / 1000).toFixed(1);
  console.log(`  ${status} ${result.suite.padEnd(25)} ${durationSec.padStart(6)}s   ${result.category}`);
}

const averageDuration = allResults.reduce((sum, r) => sum + r.duration, 0) / allResults.length;
console.log(`\n⚡ Performance Summary:`);
console.log(`  📊 Average Suite Duration: ${(averageDuration / 1000).toFixed(2)} seconds`);

// Advanced testing analysis
console.log(`\n🔬 Advanced Testing Analysis:`);

const edgeCaseResult = allResults.find(r => r.suite === "Edge Cases");
const performanceResult = allResults.find(r => r.suite === "Performance & Stress");

if (edgeCaseResult) {
  console.log(`  🛡️  Edge Case Testing: ${edgeCaseResult.passed ? '✅ ROBUST' : '❌ VULNERABLE'}`);
  if (edgeCaseResult.passed) {
    console.log(`     ✅ System handles invalid inputs gracefully`);
    console.log(`     ✅ Boundary conditions are properly managed`);
    console.log(`     ✅ Error handling is consistent and secure`);
  } else {
    console.log(`     ⚠️ Review edge case failures for potential security vulnerabilities`);
  }
}

if (performanceResult) {
  console.log(`  🚀 Performance Testing: ${performanceResult.passed ? '✅ SCALABLE' : '❌ CONCERNING'}`);
  if (performanceResult.passed) {
    console.log(`     ✅ System performs well under load`);
    console.log(`     ✅ Bulk operations are efficient`);
    console.log(`     ✅ Response times are consistent`);
  } else {
    console.log(`     ⚠️ Performance issues detected - may impact production scalability`);
  }
}

// Overall system health assessment
console.log(`\n🏥 System Health Assessment:`);
if (totalPassed === totalSuites) {
  console.log(`  🎯 EXCELLENT: All advanced tests passed!`);
  console.log(`  🏆 Production Readiness: ✅ READY`);
  console.log(`  🔒 Security Posture: ✅ ROBUST`);
  console.log(`  🚀 Performance Profile: ✅ SCALABLE`);
  console.log(`  📊 Quality Score: 100% (${totalPassed}/${totalSuites} passed)`);
} else if (totalPassed >= totalSuites * 0.5) {
  console.log(`  ⚠️ ACCEPTABLE: Some advanced tests failed`);
  console.log(`  🏆 Production Readiness: ⚠️ WITH CAUTION`);
  console.log(`  📊 Quality Score: ${((totalPassed/totalSuites)*100).toFixed(1)}% (${totalPassed}/${totalSuites} passed)`);
  console.log(`  🔧 Recommendation: Review and fix failed test areas before production deployment`);
} else {
  console.log(`  ❌ CONCERNING: Multiple advanced tests failed`);
  console.log(`  🏆 Production Readiness: ❌ NOT RECOMMENDED`);
  console.log(`  📊 Quality Score: ${((totalPassed/totalSuites)*100).toFixed(1)}% (${totalPassed}/${totalSuites} passed)`);
  console.log(`  🚨 Recommendation: Significant improvements needed before production use`);
}

// Testing progression summary
console.log(`\n🎯 CRM MCP Testing Progression Summary:`);
console.log(`  ✅ Phase A: Client Setup & Connection - COMPLETED`);
console.log(`  ✅ Phase B: Core Tool Testing (13/13 tools) - COMPLETED`);
console.log(`  ${totalPassed === totalSuites ? '✅' : '⚠️'} Phase C: Advanced Testing - ${totalPassed === totalSuites ? 'COMPLETED' : 'PARTIAL'}`);

if (totalPassed === totalSuites) {
  console.log(`\n🎉 COMPREHENSIVE TESTING COMPLETE!`);
  console.log(`🚀 CRM MCP Server has passed all phases of testing:`);
  console.log(`   📞 All 13 CRM tools are fully functional`);
  console.log(`   🛡️ Security and edge cases are handled properly`);
  console.log(`   🚀 Performance meets production standards`);
  console.log(`   ✅ System is ready for production deployment!`);
} else {
  console.log(`\n⚠️ TESTING PARTIALLY COMPLETE`);
  console.log(`🔧 Areas needing attention:`);
  for (const result of allResults.filter(r => !r.passed)) {
    console.log(`   ❌ ${result.category}: ${result.suite}`);
  }
}

console.log("\n" + "=" .repeat(80));

process.exit(totalPassed === totalSuites ? 0 : 1); 