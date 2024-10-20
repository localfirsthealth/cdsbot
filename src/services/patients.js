// services/cdsbot/src/services/patients.js

import _ from 'npm:lodash';
import { config } from '../config.js';
import { createHttpError } from '../utils/errors.js';

const HAPIHUB_API_URL = config.hapihubApiUrl;
const HAPIHUB_API_KEY = config.hapihubApiKey;

async function fetchFromHapiHub (endpoint, options = {}) {
  const url = `${HAPIHUB_API_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (HAPIHUB_API_KEY) headers.Authorization = `Bearer ${HAPIHUB_API_KEY}`;
  const req = {
    method: 'GET',
    ...options,
    headers,
  };

  try {
    const response = await fetch(url, req);
    // console.log({
    //   url,
    //   req,
    //   res: response,
    // }, 'fetchFromHapiHub');
    if (!response.ok) {
      throw createHttpError(response.status, `HapiHub API error: ${response.statusText}`);
    }
    if (response.status === 204) return null;
    return await response.json();
  } catch (error) {
    console.error('Error fetching from HapiHub:', error, {
      url,
      req,
      res: error.response,
    });
    throw createHttpError(500, 'Failed to fetch data from HapiHub');
  }
}

export async function getPatientProfile (patientId) {
  if (!patientId) {
    throw createHttpError(400, 'Patient ID is required');
  }

  try {
    const profile = await fetchFromHapiHub(`/personal-details/${patientId}`);
    if (!profile?.id) {
      throw createHttpError(404, 'Patient not found');
    }
    const res = {
      id: profile.id,
    };
    if (profile.dateOfBirth) {
      const age = new Date().getFullYear() - new Date(profile.dateOfBirth).getFullYear();
      res.age = age;
    }
    if (profile.sex) res.sex = profile.sex;
    if (profile.sdoh) res.socialIndicatorsOfHealth = profile.sdoh;
    return res;
  } catch (error) {
    console.error('Error fetching patient profile:', error);
    throw createHttpError(error.status || 500, error.message || 'Failed to fetch patient profile');
  }
}

export function formatMedicalRecord (rec) {
  if (!rec?.id) return null;
  rec.type = [rec.type, rec.subtype].filter(Boolean).join('/');
  rec.createdAt = new Date(rec.createdAt).toISOString();
  rec = _.omit(rec, [
    '_nonce',
    'subtype',
    'createdBy', 'creatorRoles', 'createdByDetails',
    'account', 'facility', 'encounter',
    'patient', 'patientAccount',
    'queueItem',
    'attachments',
    'attachmentURLs',
    'originalCreationAt',
    'finalizedAt', 'finalizedBy',
    'provider', 'providerType',
    'providerFee', 'providerFeeType',
    'permissions',
    'tags', 'metadata',
    'summary', 'nextSummaryLockedUntil',
    'copy',
  ]);
  rec = _.omitBy(rec, v => v === '' || v == null);
  // must contain other details aside from id and type, and createdAt
  if (Object.keys(rec).length <= 3) return null;
  return rec;
}

export async function getPatientMedicalRecords (patientId, options = {}) {
  if (!patientId) {
    throw createHttpError(400, 'Patient ID is required');
  }

  const { type, limit = 20, page = 1 } = options;

  try {
    const searchParams = new URLSearchParams();
    searchParams.set('patient', patientId);
    searchParams.set('$forBot', true);
    if (type) {
      const [mainType, subType] = type.split('/').map(t => t.trim());
      if (mainType) searchParams.set('type', mainType);
      if (subType) searchParams.set('subtype', subType);
    }

    // paginate
    if (limit) searchParams.set('$limit', '#' + limit);
    if (page) searchParams.set('$skip', '#' + ((page - 1) * limit));

    // build endpoint
    const endpoint = `/medical-records?${searchParams.toString()}`;

    const response = await fetchFromHapiHub(endpoint);
    const data = response.data.map(formatMedicalRecord).filter(rec => rec?.id);

    return {
      data,
      total: response.total,
      page,
      limit,
      pageCount: Math.ceil(response.total / limit),
    };
  } catch (error) {
    console.error('Error fetching patient medical records:', error);
    throw createHttpError(error.status || 500, error.message || 'Failed to fetch patient medical records');
  }
}
