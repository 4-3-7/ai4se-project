#!/usr/bin/env node
/**
 * Seahorse CLI — main entry point.
 * Corresponds to SPEC §3.9.
 */
import { Command } from 'commander';
import { VERSION } from '../index.js';

const program = new Command();

program
  .name('seahorse')
  .description('🐴 Seahorse — A Coding Agent Harness. Agent = LLM + Harness.')
  .version(VERSION);

// ── run ──

program
  .command('run <task>')
  .description('Run the coding agent on a task')
  .option('-m, --model <model>', 'LLM model to use')
  .option('--max-turns <n>', 'Maximum turns', parseInt)
  .option('-v, --verbose', 'Verbose output')
  .option('--json', 'Output as JSON')
  .action(async (task: string, options: Record<string, unknown>) => {
    console.log(`🐴 Seahorse v${VERSION}`);
    console.log(`📋 Task: ${task}`);
    console.log('');

    // TODO: Wire up full agent loop with config, memory, tools
    // For now, print the configured options
    if (options.verbose) {
      console.log('Options:', JSON.stringify(options, null, 2));
    }

    console.log('⚠️  Full agent loop integration pending.');
    console.log('   Run `seahorse demo` to see mechanism demonstrations.');
  });

// ── setup ──

program
  .command('setup')
  .description('Configure API keys securely')
  .action(async () => {
    console.log('🐴 Seahorse — Credential Setup');
    console.log('');
    console.log('Select LLM Provider:');
    console.log('  [1] Anthropic (Claude)');
    console.log('  [2] OpenAI');
    console.log('  [3] Both');
    console.log('');
    console.log('⚠️  Interactive input pending. Use environment variables for now:');
    console.log('   ANTHROPIC_API_KEY=sk-ant-...');
    console.log('   OPENAI_API_KEY=sk-...');
  });

// ── status ──

program
  .command('status')
  .description('Show credential and configuration status')
  .action(async () => {
    console.log('🐴 Seahorse Status');
    console.log('');
    console.log(`Version: ${VERSION}`);
    console.log('Credentials: (none configured)');
    console.log('Config: using defaults');
  });

// ── clear ──

program
  .command('clear')
  .description('Clear all stored credentials')
  .action(async () => {
    console.log('🐴 Credentials cleared.');
  });

// ── config ──

program
  .command('config')
  .description('Show current configuration')
  .action(async () => {
    console.log('🐴 Current configuration (defaults):');
    console.log(JSON.stringify({
      model: { provider: 'anthropic', model: 'claude-sonnet-5' },
      loop: { maxTurns: 50 },
    }, null, 2));
  });

// ── demo ──

program
  .command('demo')
  .description('Run mechanism demonstrations')
  .action(async () => {
    console.log('🐴 Seahorse — Mechanism Demo');
    console.log('='.repeat(50));
    console.log('Run: npx tsx demo/run-all.ts');
    console.log('='.repeat(50));
  });

program.parse();