// services/cdsbot/src/services/recommendations-bot.js

import _ from 'npm:lodash';
import { ChatOpenAI } from 'https://esm.sh/@langchain/openai';
import { PromptTemplate } from 'https://esm.sh/@langchain/core/prompts';
import { LLMChain } from 'https://esm.sh/langchain/chains';
import { getPatientProfile, getPatientMedicalRecords } from './patients.js';
import { config } from '../config.js';

const recommendationTemplate = `
You are a Clinical Decision Support (CDS) system integrated within an Electronic Medical Record (EMR). Based on the following inputs, with particular focus on the current medical record, provide recommendations for the healthcare provider if needed.

Patient Data:
{patientData}

Current Medical Record:
{currentMedicalRecord}

Current Diagnosis:
{currentDiagnosis}

Current Medications:
{currentMedications}

Allergy Records:
{allergyRecords}

Vital Records:
{vitalRecords}

Recent Lab Results:
{labResults}

Social Determinants of Health (if available):
{socialDeterminants}

Please provide recommendations in JSON format with the following structure:
{{
  "recommendations": [
    {{
      "text": "Your recommendation here",
      "type": "medication-change|additional-test|treatment-plan|specialist-referral|preventive-care|lifestyle-modification|other",
      "urgency": "low|medium|high",
      "confidence": 0.0 to 1.0,
      "rationale": "Brief explanation of your recommendation, including relevant factors that influenced this decision"
    }}
  ]
}}

Important:
- If no recommendations are needed, return an empty array.
- Do not invent recommendations. Only provide recommendations if they are truly warranted based on the given information.
- You may provide multiple recommendations if necessary, or no recommendations if none are needed.
- Consider all provided inputs when making recommendations, with particular emphasis on the current medical record:
  - Current medical record (primary trigger for recommendations)
  - Patient data (medical history, etc.)
  - Current diagnosis (ICD-10 codes)
  - Current medications
  - Allergy records
  - Vital records
  - Lab results (flag abnormalities, suggest follow-ups)
  - Social determinants of health (if available)
- When relevant, explain how specific inputs, especially the current medical record, factored into your recommendation.
- Be cautious about making assumptions, especially regarding SDOH. Only include inferred information if there's strong evidence in the provided data.
- Ensure recommendations align with evidence-based practices.
- Flag any potential drug interactions, allergies, or dosage concerns in medication-related recommendations. Use allergy records and vital signs for this purpose.
- Suggest preventive care measures when appropriate based on the patient's profile.

Ensure your response is valid JSON and nothing else.

JSON Response:`;

const recommendationPrompt = new PromptTemplate({
  template: recommendationTemplate,
  inputVariables: [
    'patientData',
    'currentMedicalRecord',
    'currentDiagnosis',
    'currentMedications',
    'allergyRecords',
    'vitalRecords',
    'labResults',
    'socialDeterminants',
  ],
});

export async function generateRecommendations (patientId, currentRecord) {
  try {
    const model = new ChatOpenAI({
      openAIApiKey: config.openaiApiKey,
      temperature: 0.7,
      modelName: config.openaiModel,
      configuration: {
        baseURL: config.openaiBaseUrl,
      },
    });
    const recommendationChain = new LLMChain({ llm: model, prompt: recommendationPrompt });

    const formatInput = (data) => {
      if (!data) return 'N/A';
      if (Array.isArray(data) && !data.length) return 'N/A';
      return JSON.stringify(data);
    };
    const chainInput = {};
    chainInput.patientData = formatInput(_.omit(await getPatientProfile(patientId), 'id'));
    chainInput.currentMedicalRecord = formatInput(currentRecord);
    chainInput.currentDiagnosis = formatInput(await getPatientMedicalRecords(patientId, { type: 'assessment/diagnosis', limit: 1 }).then(r => r.data[0]));
    chainInput.currentMedications = formatInput(await getPatientMedicalRecords(patientId, { type: 'medication-order', limit: 5 }).then(r => r.data));
    chainInput.allergyRecords = formatInput(await getPatientMedicalRecords(patientId, { type: 'allergy', limit: 5 }).then(r => r.data));
    chainInput.vitalRecords = formatInput(await getPatientMedicalRecords(patientId, { type: 'vitals', limit: 5 }).then(r => r.data));
    chainInput.labResults = formatInput(await getPatientMedicalRecords(patientId, { type: 'lab-test-result', limit: 5 }).then(r => r.data));
    chainInput.socialDeterminants = formatInput(await getPatientMedicalRecords(patientId, { type: 'medical-note', limit: 5 }).then(r => r.data));
    const response = await recommendationChain.call(chainInput);
    const result = JSON.parse(response.text);

    const res = {};
    res.recommendations = result.recommendations.map(rec => ({
      medicalRecordId: currentRecord.id,
      text: rec.text,
      urgency: rec.urgency,
      confidence: rec.confidence,
      rationale: rec.rationale,
      timestamp: new Date().toISOString(),
      triggerEvent: [[currentRecord.type, currentRecord.subtype].filter(Boolean).join('/'), 'created'].join(' '),
    }));
    res.metadata = {
      chainInput,
    };
    return res;
  } catch (error) {
    console.error('Error generating recommendations:', error);
    throw new Error('Failed to generate recommendations');
  }
}
