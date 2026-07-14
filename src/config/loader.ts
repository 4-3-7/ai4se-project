import * as fs from 'node:fs';
import * as yaml from 'js-yaml';

/**
 * Seahorse configuration types.
 * Corresponds to SPEC §3.8 and §6.1.
 */
export interface SeahorseConfig {
  model: {
    provider: string;
    model: string;
    maxTokens: number;
    temperature: number;
  };
  loop: {
    maxTurns: number;
    maxContextTokens: number;
    turnTimeout: number;
  };
  governance: {
    sandbox: {
      allowedPaths: string[];
      deniedPaths: string[];
      allowOutsideProject: boolean;
      maxFileSize: number;
    };
    commands: {
      deniedCommands: string[];
      requireApproval: string[];
    };
  };
  rules: string[];
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: SeahorseConfig = {
  model: {
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    maxTokens: 8192,
    temperature: 0.3,
  },
  loop: {
    maxTurns: 50,
    maxContextTokens: 100_000,
    turnTimeout: 300_000,
  },
  governance: {
    sandbox: {
      allowedPaths: ['./'],
      deniedPaths: ['/etc', '~/.ssh', '~/.aws'],
      allowOutsideProject: false,
      maxFileSize: 10 * 1024 * 1024,
    },
    commands: {
      deniedCommands: ['rm -rf', 'chmod 777', 'mkfs'],
      requireApproval: ['git push', 'npm publish', 'docker push'],
    },
  },
  rules: [],
};

/**
 * Load configuration from a YAML or JSON file.
 * Merges with defaults for any missing fields.
 */
export function loadConfig(filePath?: string): SeahorseConfig {
  if (!filePath || !fs.existsSync(filePath)) {
    return { ...DEFAULT_CONFIG, rules: [] };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  let parsed: Partial<SeahorseConfig>;

  if (filePath.endsWith('.json')) {
    parsed = JSON.parse(content);
  } else {
    parsed = (yaml.load(content) || {}) as Partial<SeahorseConfig>;
  }

  return deepMerge(DEFAULT_CONFIG, parsed);
}

function deepMerge(defaults: SeahorseConfig, overrides: Partial<SeahorseConfig>): SeahorseConfig {
  return {
    model: { ...defaults.model, ...overrides.model },
    loop: { ...defaults.loop, ...overrides.loop },
    governance: {
      sandbox: { ...defaults.governance.sandbox, ...overrides.governance?.sandbox },
      commands: { ...defaults.governance.commands, ...overrides.governance?.commands },
    },
    rules: overrides.rules ?? defaults.rules,
  };
}