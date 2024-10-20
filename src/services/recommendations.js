// services/cdsbot/src/services/recommendations.js

import { client as websocketClient } from '../utils/websocket-client.js';
import { generateRecommendations } from './recommendations-bot.js';
import { sendChatMessage } from './chat.js';
import { formatMedicalRecord } from './patients.js';
import { websocket } from '../utils/websocket.js';

const MEDICAL_RECORDS_REACTABLE_TYPES = [
  'chief-complaint',
  'hpi',
  'physical-exam',
  'vitals',
  'assessment/diagnosis',
  'medication-order',
  'allergy',
  'lab-test-result',
  'dental-history',
  'dental-note',
];

class RecommendationsService {
  constructor () {
    this.patientHandlers = new Map();
    this.patientTimers = new Map();
  }

  generateRecommendationsForPatient (patientId, opts = {}) {
    if (this.patientHandlers.has(patientId)) {
      console.log(`Already monitoring patient ${patientId}`);
      return;
    }

    const handler = async (event) => {
      if (event.data.patient !== patientId) return;
      const record = formatMedicalRecord(event.data);
      console.debug(`Received new ${record.type} medical record for patient ${patientId}`);
      if (!record?.id || !MEDICAL_RECORDS_REACTABLE_TYPES.includes(record.type)) return;
      console.log(`Generating recommendations for patient ${patientId} for ${record.type} record`);
      try {
        // Send bot status
        websocket.broadcast({
          type: 'chat/bot',
          event: 'generating-recommendations',
          data: { roomId: patientId, record: record.id },
        }, (connectionId, metadata) => metadata.roomId === patientId);

        const res = await generateRecommendations(patientId, record);
        const recommendations = res.recommendations;
        console.log(`Generated ${recommendations.length} recommendations for patient ${patientId}:`, res);

        // Send bot status
        websocket.broadcast({
          type: 'chat/bot',
          event: 'idle',
          data: {
            roomId: patientId,
            activity: 'generating-recommendations',
            recommendations: recommendations.length,
            record: record.id,
          },
        }, (connectionId, metadata) => metadata.roomId === patientId);

        if (!recommendations.length) return;
        const recommstring = recommendations.map((rec) => rec.text).join('\n');
        await sendChatMessage(patientId, {
          sender: 'bot',
          type: 'recommendations',
          text: `I have generated the following recommendations for you:\n${recommstring}`,
          noreply: true,
          recommendations,
          metadata: { ...res.metadata },
        });
      } catch (error) {
        console.error(`Error generating recommendations for patient ${patientId}:`, error);

        // Send bot status
        websocket.broadcast({
          type: 'chat/bot',
          event: 'idle',
          data: {
            roomId: patientId,
            activity: 'generating-recommendations',
            error: error.message || 'Failed to generate recommendations',
            record: record.id,
          },
        }, (connectionId, metadata) => metadata.roomId === patientId);

        await sendChatMessage(patientId, {
          sender: 'bot',
          type: 'message',
          text: 'Sorry, I encountered an error while generating recommendations for you. Please try again later.',
          noreply: true,
        });
      }
    };

    const unregister = websocketClient.registerHandler('medical-records created', handler);
    this.patientHandlers.set(patientId, unregister);

    console.log(`Started monitoring patient ${patientId} for new medical records`);

    if (opts.timeout) {
      this.setMonitoringTimeout(patientId, opts);
    }
  }

  setMonitoringTimeout (patientId, opts) {
    const timer = setTimeout(async () => {
      if (typeof opts.shouldContinue === 'function') {
        const shouldContinue = await opts.shouldContinue(patientId);
        if (shouldContinue) {
          console.log(`Continuing to monitor patient ${patientId}`);
          this.setMonitoringTimeout(patientId, opts); // Set a new timeout
        } else {
          this.stopGeneratingRecommendationsForPatient(patientId);
        }
      } else {
        this.stopGeneratingRecommendationsForPatient(patientId);
      }
    }, opts.timeout);

    this.patientTimers.set(patientId, timer);
  }

  stopGeneratingRecommendationsForPatient (patientId) {
    const unregister = this.patientHandlers.get(patientId);
    if (unregister) {
      unregister();
      this.patientHandlers.delete(patientId);
      console.log(`Stopped monitoring patient ${patientId} for new medical records`);
    }

    const timer = this.patientTimers.get(patientId);
    if (timer) {
      clearTimeout(timer);
      this.patientTimers.delete(patientId);
    }
  }
}

export default new RecommendationsService();
