import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = new Set(process.argv.slice(2));
const applyChanges = args.has('--apply');
const includeAppointments = args.has('--include-appointments');
const smokeOnly = args.has('--smoke-only');
const dryRun = !applyChanges;

const baseUrlRaw = process.env.VITE_FHIR_BASE_URL ?? '';
const accessToken =
  process.env.FHIR_ACCESS_TOKEN ??
  process.env.SMART_ACCESS_TOKEN ??
  process.env.ACCESS_TOKEN ??
  '';

if (!baseUrlRaw) {
  throw new Error('Missing VITE_FHIR_BASE_URL in environment.');
}

if (!dryRun && !accessToken) {
  throw new Error(
    'Missing FHIR access token. Set FHIR_ACCESS_TOKEN (or SMART_ACCESS_TOKEN / ACCESS_TOKEN) before running with --apply.'
  );
}

const baseUrl = baseUrlRaw.replace(/\/$/, '');
const seedSystem = 'urn:practitionerhub:seed';
const smokeSystem = 'urn:practitionerhub:smoke';

const patients = [
  { name: 'Joe', id: '12724067' },
  { name: 'Fredrick', id: '12724070' },
  { name: 'Nancy', id: '12724066' },
  { name: 'Wilma', id: '12724065' },
  { name: 'Hailey', id: '12724068' },
  { name: 'Valerie', id: '12724071' },
];

const practitionerRef = 'Practitioner/593923';
const smokePatientId = process.env.FHIR_SMOKE_PATIENT_ID?.trim() || patients[0].id;

interface FhirResource {
  resourceType: string;
  id?: string;
}

interface Bundle<T extends FhirResource> {
  entry?: Array<{ resource?: T }>;
}

interface OperationLog {
  resourceType: string;
  identifier: string;
  patientId: string;
  action: 'created' | 'skipped' | 'dry-run';
  createdId?: string;
}

interface SmokeResult {
  passed: boolean;
  createdId?: string;
  message: string;
}

interface SeedRunResult {
  timestamp: string;
  dryRun: boolean;
  smokeOnly: boolean;
  smokePatientId: string;
  includeAppointments: boolean;
  baseUrl: string;
  operations: OperationLog[];
  warnings: string[];
  smokeTest: SmokeResult;
}

function isInsufficientScopeError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('insufficient_scope');
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/fhir+json',
    Accept: 'application/fhir+json',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

async function fhirGet<T>(relativePath: string): Promise<T> {
  const response = await fetch(`${baseUrl}/${relativePath}`, {
    method: 'GET',
    headers: authHeaders(),
  });

  if (!response.ok) {
    const message = await response.text();
    if (response.status === 403 && message.includes('insufficient_scope')) {
      throw new Error(
        [
          `GET ${relativePath} failed with insufficient_scope.`,
          'Re-authorize the app and request scopes that match this operation.',
          'For Phase 0.4 seeding, ensure Observation and Encounter scopes are granted for the token context you use.',
          'If using provider/panel seeding across multiple patients, use user-level scopes.',
        ].join(' ')
      );
    }
    throw new Error(`GET ${relativePath} failed: ${response.status} ${message}`);
  }

  return (await response.json()) as T;
}

async function fhirPost<T extends FhirResource>(relativePath: string, payload: object): Promise<T> {
  const response = await fetch(`${baseUrl}/${relativePath}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    if (response.status === 403 && message.includes('insufficient_scope')) {
      throw new Error(
        [
          `POST ${relativePath} failed with insufficient_scope.`,
          'Re-authorize the app and request write-capable scopes for this resource in the same token context.',
          'For panel-level seeding, use user-level write/search scopes; for single-patient testing, use patient-level scopes for the launched patient.',
        ].join(' ')
      );
    }
    throw new Error(`POST ${relativePath} failed: ${response.status} ${message}`);
  }

  const responseText = await response.text();
  if (!responseText.trim()) {
    const locationHeader = response.headers.get('Location') ?? response.headers.get('Content-Location');
    const inferredId = locationHeader ? locationHeader.split('/').pop()?.split('?')[0] : undefined;
    const inferredResourceType = relativePath.split('?')[0];

    return {
      resourceType: inferredResourceType,
      id: inferredId,
    } as T;
  }

  return JSON.parse(responseText) as T;
}

function encodeIdentifier(system: string, value: string): string {
  return encodeURIComponent(`${system}|${value}`);
}

async function resourceExists(
  resourceType: 'Observation' | 'Encounter' | 'Appointment',
  patientId: string,
  identifierValue: string
): Promise<boolean> {
  const identifier = encodeIdentifier(seedSystem, identifierValue);
  const bundle = await fhirGet<Bundle<FhirResource>>(
    `${resourceType}?patient=${encodeURIComponent(patientId)}&identifier=${identifier}&_count=1`
  );

  return Boolean(bundle.entry && bundle.entry.length > 0);
}

function nowIso(): string {
  return new Date().toISOString();
}

function addHours(isoDateTime: string, hours: number): string {
  const date = new Date(isoDateTime);
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

function buildObservation(
  patientId: string,
  identifierValue: string,
  loinc: string,
  display: string,
  value: number,
  unit: string
): object {
  return {
    resourceType: 'Observation',
    status: 'final',
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: loinc === '718-7' ? 'laboratory' : 'vital-signs',
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: loinc,
          display,
        },
      ],
      text: display,
    },
    subject: { reference: `Patient/${patientId}` },
    effectiveDateTime: nowIso(),
    valueQuantity: {
      value,
      unit,
      system: 'http://unitsofmeasure.org',
      code: unit,
    },
    identifier: [
      {
        system: seedSystem,
        value: identifierValue,
      },
    ],
  };
}

function buildEncounter(patientId: string, identifierValue: string): object {
  const start = nowIso();
  const end = addHours(start, 1);

  return {
    resourceType: 'Encounter',
    status: 'finished',
    class: {
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      code: 'AMB',
      display: 'ambulatory',
    },
    type: [
      {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '185349003',
            display: 'Encounter for check up',
          },
        ],
      },
    ],
    subject: { reference: `Patient/${patientId}` },
    participant: [{ individual: { reference: practitionerRef } }],
    period: {
      start,
      end,
    },
    identifier: [
      {
        system: seedSystem,
        value: identifierValue,
      },
    ],
  };
}

function buildAppointment(patientId: string, identifierValue: string): object {
  const start = addHours(nowIso(), 24);
  const end = addHours(start, 1);

  return {
    resourceType: 'Appointment',
    status: 'booked',
    description: 'Optional seeded follow-up appointment for v2 scheduling tests',
    start,
    end,
    participant: [
      { actor: { reference: `Patient/${patientId}` }, status: 'accepted' },
      { actor: { reference: practitionerRef }, status: 'accepted' },
    ],
    identifier: [
      {
        system: seedSystem,
        value: identifierValue,
      },
    ],
  };
}

async function seedPatient(patientId: string, operations: OperationLog[]): Promise<void> {
  const observationSeeds = [
    { code: '8867-4', display: 'Heart rate', value: 78, unit: '/min' },
    { code: '29463-7', display: 'Body weight', value: 72, unit: 'kg' },
    { code: '718-7', display: 'Hemoglobin [Mass/volume] in Blood', value: 13.2, unit: 'g/dL' },
  ];

  for (const seed of observationSeeds) {
    const identifierValue = `obs-${patientId}-${seed.code}`;
    const exists = dryRun ? false : await resourceExists('Observation', patientId, identifierValue);

    if (exists) {
      operations.push({
        resourceType: 'Observation',
        identifier: identifierValue,
        patientId,
        action: 'skipped',
      });
      continue;
    }

    if (dryRun) {
      operations.push({
        resourceType: 'Observation',
        identifier: identifierValue,
        patientId,
        action: 'dry-run',
      });
      continue;
    }

    const created = await fhirPost<FhirResource>(
      'Observation',
      buildObservation(patientId, identifierValue, seed.code, seed.display, seed.value, seed.unit)
    );

    operations.push({
      resourceType: 'Observation',
      identifier: identifierValue,
      patientId,
      action: 'created',
      createdId: created.id,
    });
  }

  const encounterIdentifier = `enc-${patientId}-baseline`;
  const encounterExists = dryRun ? false : await resourceExists('Encounter', patientId, encounterIdentifier);

  if (encounterExists) {
    operations.push({
      resourceType: 'Encounter',
      identifier: encounterIdentifier,
      patientId,
      action: 'skipped',
    });
  } else if (dryRun) {
    operations.push({
      resourceType: 'Encounter',
      identifier: encounterIdentifier,
      patientId,
      action: 'dry-run',
    });
  } else {
    const created = await fhirPost<FhirResource>('Encounter', buildEncounter(patientId, encounterIdentifier));
    operations.push({
      resourceType: 'Encounter',
      identifier: encounterIdentifier,
      patientId,
      action: 'created',
      createdId: created.id,
    });
  }

  if (includeAppointments) {
    const appointmentIdentifier = `appt-${patientId}-future`;
    const appointmentExists = dryRun
      ? false
      : await resourceExists('Appointment', patientId, appointmentIdentifier);

    if (appointmentExists) {
      operations.push({
        resourceType: 'Appointment',
        identifier: appointmentIdentifier,
        patientId,
        action: 'skipped',
      });
    } else if (dryRun) {
      operations.push({
        resourceType: 'Appointment',
        identifier: appointmentIdentifier,
        patientId,
        action: 'dry-run',
      });
    } else {
      const created = await fhirPost<FhirResource>(
        'Appointment',
        buildAppointment(patientId, appointmentIdentifier)
      );
      operations.push({
        resourceType: 'Appointment',
        identifier: appointmentIdentifier,
        patientId,
        action: 'created',
        createdId: created.id,
      });
    }
  }
}

async function runSmokeTest(firstPatientId: string): Promise<SmokeResult> {
  if (dryRun) {
    return {
      passed: false,
      message: 'Dry run mode: smoke test skipped. Re-run with --apply to execute write/read-back test.',
    };
  }

  try {
    await fhirGet<FhirResource>(`Patient/${encodeURIComponent(firstPatientId)}`);
  } catch (error: unknown) {
    return {
      passed: false,
      message:
        error instanceof Error
          ? `Smoke preflight failed for Patient/${firstPatientId}: ${error.message}`
          : `Smoke preflight failed for Patient/${firstPatientId}.`,
    };
  }

  const identifierValue = `smoke-obs-${Date.now()}`;
  const baseObservation = {
    resourceType: 'Observation',
    status: 'final',
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: '29463-7',
          display: 'Body weight',
        },
      ],
      text: 'Body weight',
    },
    subject: { reference: `Patient/${firstPatientId}` },
    effectiveDateTime: nowIso(),
    valueQuantity: {
      value: 70.5,
      unit: 'kg',
      system: 'http://unitsofmeasure.org',
      code: 'kg',
    },
  };

  const labObservation = {
    resourceType: 'Observation',
    status: 'final',
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: '718-7',
          display: 'Hemoglobin [Mass/volume] in Blood',
        },
      ],
      text: 'Hemoglobin [Mass/volume] in Blood',
    },
    subject: { reference: `Patient/${firstPatientId}` },
    effectiveDateTime: nowIso(),
    valueQuantity: {
      value: 13.2,
      unit: 'g/dL',
      system: 'http://unitsofmeasure.org',
      code: 'g/dL',
    },
  };

  const payloadVariants: Array<{ name: string; payload: object; hasIdentifier: boolean }> = [
    {
      name: 'minimal-body-weight',
      payload: {
        ...baseObservation,
      },
      hasIdentifier: false,
    },
    {
      name: 'laboratory-category-no-identifier',
      payload: {
        ...labObservation,
        category: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                code: 'laboratory',
              },
            ],
          },
        ],
      },
      hasIdentifier: false,
    },
    {
      name: 'laboratory-category-with-identifier',
      payload: {
        ...labObservation,
        category: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                code: 'laboratory',
              },
            ],
          },
        ],
        identifier: [
          {
            system: smokeSystem,
            value: identifierValue,
          },
        ],
      },
      hasIdentifier: true,
    },
    {
      name: 'vitals-category-with-identifier',
      payload: {
        ...baseObservation,
        category: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                code: 'vital-signs',
              },
            ],
          },
        ],
        identifier: [
          {
            system: smokeSystem,
            value: identifierValue,
          },
        ],
      },
      hasIdentifier: true,
    },
    {
      name: 'us-core-body-weight-profile',
      payload: {
        ...baseObservation,
        meta: {
          profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-body-weight'],
        },
        category: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                code: 'vital-signs',
              },
            ],
          },
        ],
      },
      hasIdentifier: false,
    },
  ];

  let created: FhirResource | null = null;
  let usedIdentifier = false;
  const errors: string[] = [];

  for (const variant of payloadVariants) {
    try {
      created = await fhirPost<FhirResource>('Observation', variant.payload);
      usedIdentifier = variant.hasIdentifier;
      console.log(`Smoke variant succeeded: ${variant.name}`);
      break;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${variant.name}: ${message}`);
    }
  }

  if (!created) {
    return {
      passed: false,
      message: `Observation create failed for all smoke variants. ${errors.join(' | ')} Likely causes: patient context mismatch for current token, or Cerner tenant-specific validation constraints. Confirm FHIR_SMOKE_PATIENT_ID matches the launched patient context.` ,
    };
  }

  if (!created.id) {
    if (usedIdentifier) {
      const identifier = encodeIdentifier(smokeSystem, identifierValue);
      const bundle = await fhirGet<Bundle<FhirResource>>(
        `Observation?patient=${encodeURIComponent(firstPatientId)}&identifier=${identifier}&_sort=-date&_count=1`
      );

      const matched = bundle.entry?.[0]?.resource;
      if (matched?.id) {
        created.id = matched.id;
      }
    }

    if (!created.id) {
      return {
        passed: false,
        message: 'Observation create returned no resource id and identifier lookup found no match.',
      };
    }
  }

  const readBack = await fhirGet<FhirResource>(`Observation/${encodeURIComponent(created.id)}`);

  if (readBack.resourceType !== 'Observation' || readBack.id !== created.id) {
    return {
      passed: false,
      createdId: created.id,
      message: 'Read-back did not return the expected Observation resource.',
    };
  }

  return {
    passed: true,
    createdId: created.id,
    message: 'Observation create/read-back smoke test passed.',
  };
}

function writeLog(result: SeedRunResult): void {
  const logDir = join(process.cwd(), 'scripts', 'logs');
  mkdirSync(logDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = join(logDir, `seed-log-${stamp}.json`);
  writeFileSync(filePath, JSON.stringify(result, null, 2), { encoding: 'utf-8' });

  console.log(`Seed log written: ${filePath}`);
}

async function main(): Promise<void> {
  const operations: OperationLog[] = [];
  const warnings: string[] = [];

  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'APPLY'}`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Smoke-only: ${smokeOnly ? 'yes' : 'no'}`);
  console.log(`Smoke patient id: ${smokePatientId}`);
  console.log(`Include appointments: ${includeAppointments ? 'yes' : 'no (optional)'}`);

  if (!smokeOnly) {
    for (const patient of patients) {
      console.log(`Seeding patient ${patient.name} (${patient.id})`);
      try {
        await seedPatient(patient.id, operations);
      } catch (error: unknown) {
        if (isInsufficientScopeError(error)) {
          const warning = `Skipping patient ${patient.id} due to insufficient_scope in current token context.`;
          warnings.push(warning);
          console.warn(warning);
          continue;
        }

        throw error;
      }
    }
  }

  const smokeTest = await runSmokeTest(smokePatientId);

  const result: SeedRunResult = {
    timestamp: new Date().toISOString(),
    dryRun,
    smokeOnly,
    smokePatientId,
    includeAppointments,
    baseUrl,
    operations,
    warnings,
    smokeTest,
  };

  writeLog(result);

  const createdCount = operations.filter((item) => item.action === 'created').length;
  const skippedCount = operations.filter((item) => item.action === 'skipped').length;
  const dryRunCount = operations.filter((item) => item.action === 'dry-run').length;

  console.log(`Created: ${createdCount}, Skipped: ${skippedCount}, Dry-run entries: ${dryRunCount}`);
  console.log(`Smoke test: ${smokeTest.passed ? 'PASSED' : 'NOT PASSED'} - ${smokeTest.message}`);

  if (!smokeTest.passed) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error('Seed script failed.');
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
  process.exitCode = 1;
});
