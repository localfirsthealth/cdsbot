# CDSBot

CDSBot is an AI chatbot that specializes in helping providers with their clinical workflows.
It is designed to be a conversational interface that can be integrated into any EHR system.

## Development

Create config.yaml file

```yaml
# config.yaml

## App
port: 8080
databaseUrl: sqlite:./cdsbot.db

## Hapihub
hapihubApiUrl: https://api.hapihub.com
hapihubApiKey: <service-account-level-api-key>

## Openai
# openaiBaseUrl: https://api.openai.com/v1
# openaiApiKey: <your-openai-api-key-here>
# openaiModel: gpt-3.5-turbo

## Ollama
openaiBaseUrl: http://localhost:11434/v1
openaiApiKey: ollama
openaiModel: llama3.1
```

Run the following commands to start the server:

```bash
pnpm run start --config <path-to-config.yaml>
```
