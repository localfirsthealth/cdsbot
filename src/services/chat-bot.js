// services/cdsbot/src/services/chat-bot.js

import _ from 'npm:lodash';
import { ChatOpenAI } from 'https://esm.sh/@langchain/openai';
import { PromptTemplate } from 'https://esm.sh/@langchain/core/prompts';
import { LLMChain } from 'https://esm.sh/langchain/chains';
import { getPatientProfile, getPatientMedicalRecords } from './patients.js';
import { generatePatientSummary } from './patient-summary.js';
import { config } from '../config.js';
import ChatMessage from '../models/ChatMessage.js';

// Create a prompt template for intent classification
const intentClassificationTemplate = `
You are an intent classifier for a healthcare chatbot. Given a user message, determine if it matches any of the following intents:

1. Generate Patient Summary. This should be used only when the user asks for explict patient overall summary. e.g. "Can you provide a summary of the patient?"
2. General Query

User message: {userMessage}

Respond with only the intent number (1 or 2) and nothing else. If unsure, respond with 2.

Intent:`;

const intentClassificationPrompt = new PromptTemplate({
  template: intentClassificationTemplate,
  inputVariables: ['userMessage'],
});

// Create a prompt template for general queries
const generalQueryTemplate = `
You are a healthcare assistant chatbot. Please respond to the following message from a healthcare provider.
Patient context:
{patientContext}

Recent medical records:
{recentMedicalRecords}

Chat history:
{chatHistory}

User message: {userMessage}

Please provide a concise and helpful response, considering the patient's recent medical records when relevant:
`;

const generalQueryPrompt = new PromptTemplate({
  template: generalQueryTemplate,
  inputVariables: ['patientContext', 'recentMedicalRecords', 'chatHistory', 'userMessage'],
});

// Function to classify intent
async function classifyIntent (intentClassificationChain, message) {
  const response = await intentClassificationChain.call({ userMessage: message });
  return parseInt(response.text.trim());
}

export async function generateBotReply (message) {
  try {
    // Initialize the OpenAI model with the configuration
    const model = new ChatOpenAI({
      openAIApiKey: config.openaiApiKey,
      temperature: 0.7,
      modelName: config.openaiModel,
      configuration: {
        baseURL: config.openaiBaseUrl,
      },
    });

    // Create an LLMChain for intent classification
    const intentClassificationChain = new LLMChain({ llm: model, prompt: intentClassificationPrompt });

    // Create an LLMChain for general queries
    const generalQueryChain = new LLMChain({ llm: model, prompt: generalQueryPrompt });

    if (!message.roomId) {
      throw new Error('Message must have a roomId');
    }
    if (!message.text) {
      throw new Error('Message must have text');
    }
    const patientId = message.roomId;
    const patientProfile = await getPatientProfile(patientId);

    // Fetch recent medical records
    const recentRecords = await getPatientMedicalRecords(patientId, { limit: 50 }).then(r => r.data);
    const formattedRecentRecords = recentRecords.map(record => JSON.stringify(record)).join('\n');

    // Classify the intent of the message
    const intent = await classifyIntent(intentClassificationChain, message.text);

    const reply = {
      text: 'Hello, how can I help you today?',
      replyTo: message.id,
      type: 'message',
      sender: 'bot',
      metadata: {
        artifact: {
          patientProfile,
          recentMedicalRecords: recentRecords,
          intent,
        },
      },
    };

    if (intent === 1) {
      // Generate patient summary
      const summary = await generatePatientSummary(patientId);
      reply.text = summary.text;
      reply.type = 'summary';
    } else {
      // Retrieve chat history
      const roomHistory = await ChatMessage.find(
        { roomId: message.roomId },
        { sort: { timestamp: 1 }, limit: 19 },
      );

      // Prepare chat history for prompt, including the current message
      const formattedHistory = [...roomHistory]
        .map(msg => `${msg.sender}: ${msg.text}`)
        .join('\n');

      const botReply = await generalQueryChain.call({
        patientContext: JSON.stringify(_.omit(patientProfile, 'id')),
        recentMedicalRecords: formattedRecentRecords,
        chatHistory: formattedHistory,
        userMessage: message.text,
      });

      reply.text = botReply.text;

      // Add chat history to the artifact
      reply.metadata.artifact.chatHistory = roomHistory;
    }

    // Add the user message and bot response to the artifact
    reply.metadata.artifact.userMessage = message.text;
    reply.metadata.artifact.botResponse = reply.text;

    return reply;
  } catch (error) {
    console.error('Error generating bot reply:', error);
    throw new Error('Failed to generate bot reply');
  }
}
