// services/cdsbot/src/services/patient-summary.js

import _ from 'npm:lodash';
import { getPatientProfile, getPatientMedicalRecords } from './patients.js';
import { ChatOpenAI } from 'https://esm.sh/@langchain/openai';
import { PromptTemplate } from 'https://esm.sh/@langchain/core/prompts';
import { LLMChain } from 'https://esm.sh/langchain/chains';
import { config } from '../config.js';

const summaryTemplate = `
You are a healthcare assistant tasked with summarizing patient information. Please provide a concise summary based on the following patient data:

Patient Profile:
{patientProfile}

Recent Medical Records:
{medicalRecords}

Please generate a brief, professional summary that includes:
1. Key patient demographics
2. Notable medical history
3. Recent diagnoses or treatments
4. Any significant trends or changes in the patient's health

Ensure the summary is in plain text without any formatting, headings, or bullet points. Do not include any names, patient IDs, or other personally identifying information beyond age and sex.

Summary:`;

const summaryPrompt = new PromptTemplate({
  template: summaryTemplate,
  inputVariables: ['patientProfile', 'medicalRecords'],
});

export async function generatePatientSummary (patientId) {
  try {
    const model = new ChatOpenAI({
      openAIApiKey: config.openaiApiKey,
      temperature: 0.7,
      modelName: config.openaiModel,
      configuration: {
        baseURL: config.openaiBaseUrl,
      },
    });
    const summaryChain = new LLMChain({ llm: model, prompt: summaryPrompt });
    const patient = await getPatientProfile(patientId);
    const records = await getPatientMedicalRecords(patientId, { limit: 50 }).then(r => r.data);

    const patientProfileString = JSON.stringify(_.omit(patient, 'id'), null, 2);
    const medicalRecordsString = JSON.stringify(records, null, 2);

    const result = await summaryChain.call({
      patientProfile: patientProfileString,
      medicalRecords: medicalRecordsString,
    });

    return {
      text: result.text.trim(),
    };
  } catch (error) {
    console.error('Error generating patient summary:', error);
    throw new Error('Failed to generate patient summary');
  }
}
