// services/cdsbot/src/config.js

import { parse } from 'https://deno.land/std@0.181.0/flags/mod.ts';
import { config as dotenvConfig } from 'https://deno.land/x/dotenv@v3.2.0/mod.ts';
import { parse as yamlParse } from 'https://deno.land/std@0.181.0/encoding/yaml.ts';

function loadConfigFile (path) {
  try {
    // Check if the file exists before attempting to read it
    const fileInfo = Deno.statSync(path);
    if (fileInfo.isFile) {
      const fileContent = Deno.readTextFileSync(path);
      return yamlParse(fileContent);
    } else {
      console.warn(`Config file ${path} is not a regular file.`);
      return {};
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      console.warn(`Config file ${path} not found. Using default values.`);
    } else {
      console.error(`Error loading config file: ${error}`);
    }
    return {};
  }
}

function getConfig () {
  // Load .env file
  dotenvConfig({ export: true });

  // Parse command line arguments
  const args = parse(Deno.args, {
    string: ['config', 'port', 'databaseUrl', 'hapihubApiUrl', 'hapihubApiKey', 'openaiBaseUrl', 'openaiApiKey', 'openaiModel'],
    default: { config: 'config.yaml' },
  });

  // Load config file if it exists
  const fileConfig = args.config ? loadConfigFile(args.config) : {};

  // Merge configurations with priority: CLI args > Environment variables > Config file > Default values
  return {
    port: parseInt(args.port || Deno.env.get('PORT') || fileConfig.port || '8000'),
    databaseUrl: args.databaseUrl || Deno.env.get('DATABASE_URL') || fileConfig.databaseUrl || 'sqlite::memory:',
    hapihubApiUrl: args.hapihubApiUrl || Deno.env.get('HAPIHUB_API_URL') || fileConfig.hapihubApiUrl || 'http://localhost:7500',
    hapihubApiKey: args.hapihubApiKey || Deno.env.get('HAPIHUB_API_KEY') || fileConfig.hapihubApiKey,
    openaiBaseUrl: args.openaiBaseUrl || Deno.env.get('OPENAI_BASE_URL') || fileConfig.openaiBaseUrl || 'http://localhost:11434/v1',
    openaiApiKey: args.openaiApiKey || Deno.env.get('OPENAI_API_KEY') || fileConfig.openaiApiKey || 'ollama_secret',
    openaiModel: args.openaiModel || Deno.env.get('OPENAI_MODEL') || fileConfig.openaiModel || 'llama3.1',
  };
}

export const config = getConfig();
