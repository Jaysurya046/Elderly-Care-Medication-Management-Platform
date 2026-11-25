import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// 1. Mock DB for Audit Log endpoint
vi.mock('@elder-care/db', () => {
  const mockPrisma: any = {
    membership: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    careProfile: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

// Mock Auth
vi.mock('../services/auth-service', () => ({
  verifySessionToken: vi.fn(),
}));

import { prisma } from '@elder-care/db';
import { verifySessionToken } from '../services/auth-service';

// Import Route under test (will fail before route is created)
import { GET as getAuditLogs } from '../app/api/profiles/[id]/audit-logs/route';
import { syncOfflineQueueItems, QueuedOfflineAction } from '../lib/offline-queue';
import { calculateAdherence, calculateStreak, generateDeterministicInsights } from '@elder-care/core';
import { getTranslation, SupportedLanguage } from '../lib/i18n';

describe('Phase 8d-2: UI Modernization, Accessibility, Audit Logs & Offline Queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Real Audit Log API Endpoint (GET /api/profiles/[id]/audit-logs)', () => {
    it('rejects unauthenticated request with 401', async () => {
      vi.mocked(verifySessionToken).mockResolvedValue(null);

      const req = new NextRequest('http://localhost:3000/api/profiles/prof-1/audit-logs');
      const res = await getAuditLogs(req, { params: Promise.resolve({ id: 'prof-1' }) });

      expect(res.status).toBe(401);
    });

    it('returns sanitized audit logs for authorized OWNER/CAREGIVER', async () => {
      vi.mocked(verifySessionToken).mockResolvedValue({
        id: 'sess-1',
        userId: 'user-1',
        tokenHash: 'h',
        expiresAt: new Date(Date.now() + 3600000),
        user: { id: 'user-1', email: 'owner@example.com', name: 'Elder Owner' },
      } as any);

      vi.mocked(prisma.membership.findFirst).mockResolvedValue({
        id: 'mem-1',
        userId: 'user-1',
        profileId: 'prof-1',
        role: 'OWNER',
        status: 'ACTIVE',
        scopes: ['manage_care_circle'],
      } as any);

      const mockLogs = [
        {
          id: 'log-1',
          profileId: 'prof-1',
          actorUserId: 'user-1',
          action: 'DOSE:TAKEN',
          entityType: 'DoseEvent',
          entityId: 'dose-123',
          metadata: { doseTime: '08:00' },
          ip: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          createdAt: new Date('2026-11-23T08:05:00Z'),
        },
      ];

      vi.mocked(prisma.auditLog.findMany).mockResolvedValue(mockLogs as any);

      const req = new NextRequest('http://localhost:3000/api/profiles/prof-1/audit-logs');
      const res = await getAuditLogs(req, { params: Promise.resolve({ id: 'prof-1' }) });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data).toHaveLength(1);
      expect(data.data[0].action).toBe('DOSE:TAKEN');
      expect(data.data[0].entityId).toBe('dose-123');
    });
  });

  describe('2. Idempotent Offline Queue with Drop-on-409', () => {
    it('drops action on HTTP 409 Conflict instead of infinitely retrying', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: 'Conflict: Dose already recorded by Caregiver Jane' }),
      });

      const queue: QueuedOfflineAction[] = [
        {
          clientActionId: 'action-uuid-1',
          profileId: 'prof-1',
          doseId: 'dose-1',
          action: 'TAKE',
          timestamp: new Date().toISOString(),
        },
      ];

      const result = await syncOfflineQueueItems(queue, mockFetch as any);

      // On 409 conflict, the action MUST be dropped from remaining queue
      expect(result.droppedOnConflict).toBe(1);
      expect(result.remainingQueue).toHaveLength(0);
      expect(result.successful).toBe(0);
    });

    it('retains action on temporary network error (e.g. fetch rejected)', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error: offline'));

      const queue: QueuedOfflineAction[] = [
        {
          clientActionId: 'action-uuid-2',
          profileId: 'prof-1',
          doseId: 'dose-2',
          action: 'TAKE',
          timestamp: new Date().toISOString(),
        },
      ];

      const result = await syncOfflineQueueItems(queue, mockFetch as any);

      // Network errors must be retained for next sync attempt
      expect(result.remainingQueue).toHaveLength(1);
      expect(result.droppedOnConflict).toBe(0);
      expect(result.successful).toBe(0);
    });

    it('attaches clientActionId for server idempotency on successful sync', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });

      const queue: QueuedOfflineAction[] = [
        {
          clientActionId: 'action-uuid-3',
          profileId: 'prof-1',
          doseId: 'dose-3',
          action: 'TAKE',
          timestamp: new Date().toISOString(),
        },
      ];

      const result = await syncOfflineQueueItems(queue, mockFetch as any);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/profiles/prof-1/doses/dose-3/action'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-client-action-id': 'action-uuid-3',
          }),
        })
      );
      expect(result.successful).toBe(1);
      expect(result.remainingQueue).toHaveLength(0);
    });
  });

  describe('3. 7-Day & 30-Day Adherence, Streaks and Missed-Dose Patterns', () => {
    it('computes 7-day and 30-day adherence percentages accurately', () => {
      const now = new Date('2026-11-23T12:00:00Z');

      // 7-day doses: 12 taken, 2 missed = 12/14 = 86%
      const doses7d = [
        ...Array(12).fill(null).map((_, i) => ({
          id: `taken-${i}`,
          scheduledAt: new Date(now.getTime() - i * 12 * 3600000),
          status: 'TAKEN' as const,
        })),
        {
          id: 'missed-1',
          scheduledAt: new Date(now.getTime() - 24 * 3600000),
          status: 'MISSED' as const,
          timeOfDayBlock: 'EVENING' as const,
        },
        {
          id: 'missed-2',
          scheduledAt: new Date(now.getTime() - 48 * 3600000),
          status: 'MISSED' as const,
          timeOfDayBlock: 'EVENING' as const,
        },
      ];

      const adherence7d = calculateAdherence(doses7d, now);
      expect(adherence7d.percentage).toBe(86);
      expect(adherence7d.takenCount).toBe(12);
      expect(adherence7d.missedCount).toBe(2);

      // Missed-dose pattern insight: Evening doses missed 2 times
      const insights = generateDeterministicInsights(doses7d);
      expect(insights).toContain('Evening doses were missed 2 times in the recorded period.');
    });

    it('calculates consecutive day streak correctly', () => {
      const days = [
        {
          dateStr: '2026-11-23',
          doses: [{ id: 'd1', scheduledAt: '2026-11-23T08:00:00Z', status: 'TAKEN' as const }],
        },
        {
          dateStr: '2026-11-22',
          doses: [{ id: 'd2', scheduledAt: '2026-11-22T08:00:00Z', status: 'TAKEN' as const }],
        },
        {
          dateStr: '2026-11-21',
          doses: [{ id: 'd3', scheduledAt: '2026-11-21T08:00:00Z', status: 'MISSED' as const }],
        },
        {
          dateStr: '2026-11-20',
          doses: [{ id: 'd4', scheduledAt: '2026-11-20T08:00:00Z', status: 'TAKEN' as const }],
        },
      ];

      const streak = calculateStreak(days, '2026-11-23');
      // Nov 23 and Nov 22 taken, Nov 21 missed -> streak is 2 days
      expect(streak).toBe(2);
    });
  });

  describe('4. i18n Translations and Multi-Language Wiring', () => {
    it('returns accurate localized text across English, Spanish, and Hindi', () => {
      expect(getTranslation('en', 'senior.takeDose')).toBe('Take Medication');
      expect(getTranslation('es', 'senior.takeDose')).toBe('Tomar Medicamento');
      expect(getTranslation('hi', 'senior.takeDose')).toBe('दवा लें');

      expect(getTranslation('en', 'senior.snooze')).toBe('Snooze');
      expect(getTranslation('es', 'senior.snooze')).toBe('Posponer');
      expect(getTranslation('hi', 'senior.snooze')).toBe('बाद में याद दिलाएं');
    });

    it('falls back to English when a key is undefined in other languages', () => {
      expect(getTranslation('es' as SupportedLanguage, 'common.appName')).toBe('Elder Care Platform');
    });
  });
});
