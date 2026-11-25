import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, Role, MedicationCriticality, DoseStatus } from '@elder-care/db';
import { recordDoseAction } from '../services/medication-service';

describe('Real Database Concurrency: Parallel Dose Actions', () => {
  let isDbAvailable = false;
  let testProfileId: string;
  let caregiver1Id: string;
  let caregiver2Id: string;
  let testMedicationId: string;
  let testDoseEventId: string;

  beforeAll(async () => {
    try {
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error('PostgreSQL connection timed out after 2500ms')), 2500)),
      ]);
      isDbAvailable = true;
    } catch (err) {
      const isDbRequired = process.env.REQUIRE_DB?.trim() === '1' || process.env.CI?.trim() === 'true';
      if (isDbRequired) {
        throw new Error(`Real database required (REQUIRE_DB=1 or CI=true) but connection failed: ${(err as Error).message}`);
      }
      console.warn('Real Postgres database not reachable, skipping live DB concurrency test');
      return;
    }

    // Clean up test data if any
    const u1 = await prisma.user.create({
      data: {
        name: 'Nurse Joy 1',
        email: `nurse1-${Date.now()}@test.com`,
        passwordHash: 'hash123',
      },
    });
    caregiver1Id = u1.id;

    const u2 = await prisma.user.create({
      data: {
        name: 'Nurse Joy 2',
        email: `nurse2-${Date.now()}@test.com`,
        passwordHash: 'hash123',
      },
    });
    caregiver2Id = u2.id;

    const profile = await prisma.careProfile.create({
      data: {
        displayName: 'Concurrency Test Elder',
        dateOfBirth: new Date('1950-01-01'),
        bloodType: 'O+',
        emergencyCode: 'CONC1234',
        ownerId: caregiver1Id,
        timezone: 'Asia/Kolkata',
      },
    });
    testProfileId = profile.id;

    await prisma.membership.createMany({
      data: [
        {
          profileId: testProfileId,
          userId: caregiver1Id,
          role: Role.CAREGIVER,
          scopes: { view_medications: true, manage_medications: true },
          status: 'ACTIVE',
        },
        {
          profileId: testProfileId,
          userId: caregiver2Id,
          role: Role.CAREGIVER,
          scopes: { view_medications: true, manage_medications: true },
          status: 'ACTIVE',
        },
      ],
    });

    const med = await prisma.medication.create({
      data: {
        profileId: testProfileId,
        name: 'Metformin',
        strength: '500mg',
        form: 'Tablet',
        stockCount: 5,
        refillThreshold: 2,
        criticality: MedicationCriticality.STANDARD,
        startDate: new Date(),
      },
    });
    testMedicationId = med.id;

    const schedule = await prisma.schedule.create({
      data: {
        medicationId: testMedicationId,
        rrule: 'FREQ=DAILY;INTERVAL=1',
        timesOfDay: ['08:00'],
        startsOn: new Date(),
        graceMinutes: 60,
        snoozeMinutes: 15,
      },
    });

    const dose = await prisma.doseEvent.create({
      data: {
        profileId: testProfileId,
        scheduleId: schedule.id,
        scheduledAt: new Date(),
        status: DoseStatus.PENDING,
        stockDecremented: false,
      },
    });
    testDoseEventId = dose.id;
  });

  afterAll(async () => {
    if (!isDbAvailable) return;
    try {
      if (testDoseEventId) {
        await prisma.doseEventAction.deleteMany({ where: { doseEventId: testDoseEventId } });
        await prisma.doseEvent.deleteMany({ where: { id: testDoseEventId } });
      }
      if (testMedicationId) {
        await prisma.schedule.deleteMany({ where: { medicationId: testMedicationId } });
        await prisma.medication.deleteMany({ where: { id: testMedicationId } });
      }
      if (testProfileId) {
        await prisma.auditLog.deleteMany({ where: { profileId: testProfileId } });
        await prisma.membership.deleteMany({ where: { profileId: testProfileId } });
        await prisma.careProfile.deleteMany({ where: { id: testProfileId } });
      }
      if (caregiver1Id || caregiver2Id) {
        await prisma.user.deleteMany({ where: { id: { in: [caregiver1Id, caregiver2Id].filter(Boolean) } } });
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  it('runs two parallel recordDoseAction calls on the same dose and asserts exactly one succeeds and stock drops by exactly one', async () => {
    if (!isDbAvailable) {
      const isDbRequired = process.env.REQUIRE_DB?.trim() === '1' || process.env.CI?.trim() === 'true';
      if (isDbRequired) {
        throw new Error('Real database required but unavailable');
      }
      console.warn('Skipping test because real database is not available');
      return;
    }

    // Run two parallel recordDoseAction calls
    const [res1, res2] = await Promise.allSettled([
      recordDoseAction(testDoseEventId, { action: 'TAKE' }, caregiver1Id),
      recordDoseAction(testDoseEventId, { action: 'TAKE' }, caregiver2Id),
    ]);

    const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled');
    const rejected = [res1, res2].filter((r) => r.status === 'rejected');

    // Exactly one succeeds
    expect(fulfilled).toHaveLength(1);
    // Exactly one fails with Conflict / "Already recorded by"
    expect(rejected).toHaveLength(1);
    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectionReason.message).toMatch(/Already recorded by/i);

    // Stock drops by exactly one (5 -> 4)
    const freshMed = await prisma.medication.findUnique({
      where: { id: testMedicationId },
    });
    console.log(`[Concurrency Race Test Result] Initial stock: 5, Final stock value: ${freshMed?.stockCount}`);
    expect(freshMed?.stockCount).toBe(4);
  });
});
