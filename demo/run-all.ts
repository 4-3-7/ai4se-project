/**
 * Seahorse Mechanism Demo — Run All
 *
 * Runs all three demo scenarios:
 * 1. Guardrail blocking a dangerous action
 * 2. Feedback loop driving correction
 * 3. Deep governance system
 */

async function main() {
  console.log('🐴 Seahorse — Mechanism Demonstration Suite');
  console.log('='.repeat(60));
  console.log('');

  // Run demos sequentially
  await import('./guardrail-demo.js');
  console.log('');
  await import('./feedback-demo.js');
  console.log('');
  await import('./governance-demo.js');
  console.log('');

  console.log('='.repeat(60));
  console.log('🏁 All demonstrations complete.');
  console.log('');
  console.log('Summary:');
  console.log('  ① Governance guardrail: ✅ Blocks dangerous actions');
  console.log('  ② Feedback loop:       ✅ Drives self-correction');
  console.log('  ③ Deep governance:     ✅ Multi-level safety system');
  console.log('='.repeat(60));
}

main().catch(console.error);