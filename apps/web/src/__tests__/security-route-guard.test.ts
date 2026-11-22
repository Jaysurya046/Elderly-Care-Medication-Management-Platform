import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { requireProfileAccess, UnauthorizedError, ForbiddenError } from '../lib/auth-guard';
import { prisma } from '@elder-care/db';
import { recordAuditLog } from '../lib/audit';

vi.mock('@elder-care/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    careProfile: { findUnique: vi.fn() },
    membership: { findUnique: vi.fn() },
  },
  Role: { OWNER: 'OWNER', CAREGIVER: 'CAREGIVER', FAMILY: 'FAMILY', EMERGENCY_VIEWER: 'EMERGENCY_VIEWER' },
  MembershipStatus: { ACTIVE: 'ACTIVE', REVOKED: 'REVOKED', INVITED: 'INVITED' },
}));

vi.mock('../lib/session', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('../lib/audit', () => ({
  recordAuditLog: vi.fn().mockResolvedValue(undefined),
  extractClientDetails: vi.fn().mockReturnValue({ ip: '127.0.0.1', userAgent: 'test-agent' }),
}));

function getAllRouteFiles(dir: string): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllRouteFiles(fullPath));
    } else if (file.endsWith('route.ts') || file.endsWith('route.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('Security Invariant: Route Access Guard (Goal.md Section 4 & 9)', () => {
  describe('AST Route Guard Static Verification', () => {
    it('verifies using TypeScript AST parser that EVERY exported HTTP method directly calls requireProfileAccess', () => {
      const profilesApiDir = path.resolve(__dirname, '../app/api/profiles/[id]');
      const routeFiles = getAllRouteFiles(profilesApiDir);

      expect(routeFiles.length).toBeGreaterThan(0);

      const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

      for (const filePath of routeFiles) {
        const sourceCode = fs.readFileSync(filePath, 'utf-8');
        const sourceFile = ts.createSourceFile(
          filePath,
          sourceCode,
          ts.ScriptTarget.Latest,
          true
        );

        const exportedMethods: string[] = [];
        const guardedMethods: string[] = [];

        function checkNode(node: ts.Node) {
          // Check FunctionDeclaration (e.g. export async function GET(...))
          if (ts.isFunctionDeclaration(node) && node.name && httpMethods.includes(node.name.text)) {
            const isExported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
            if (isExported) {
              const methodName = node.name.text;
              exportedMethods.push(methodName);

              let callsGuard = false;
              function walkCalls(child: ts.Node) {
                if (
                  ts.isCallExpression(child) &&
                  ts.isIdentifier(child.expression) &&
                  child.expression.text === 'requireProfileAccess'
                ) {
                  callsGuard = true;
                }
                ts.forEachChild(child, walkCalls);
              }
              walkCalls(node);

              if (callsGuard) {
                guardedMethods.push(methodName);
              }
            }
          }

          // Check VariableStatement (e.g. export const GET = ...)
          if (ts.isVariableStatement(node)) {
            const isExported = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
            if (isExported) {
              for (const decl of node.declarationList.declarations) {
                if (ts.isIdentifier(decl.name) && httpMethods.includes(decl.name.text)) {
                  const methodName = decl.name.text;
                  exportedMethods.push(methodName);

                  let callsGuard = false;
                  function walkCalls(child: ts.Node) {
                    if (
                      ts.isCallExpression(child) &&
                      ts.isIdentifier(child.expression) &&
                      child.expression.text === 'requireProfileAccess'
                    ) {
                      callsGuard = true;
                    }
                    ts.forEachChild(child, walkCalls);
                  }
                  if (decl.initializer) {
                    walkCalls(decl.initializer);
                  }

                  if (callsGuard) {
                    guardedMethods.push(methodName);
                  }
                }
              }
            }
          }

          ts.forEachChild(node, checkNode);
        }

        checkNode(sourceFile);

        const relativePath = path.relative(path.resolve(__dirname, '..'), filePath);
        expect(
          exportedMethods.length,
          `Expected route file ${relativePath} to export at least one HTTP method`
        ).toBeGreaterThan(0);

        expect(
          guardedMethods,
          `SECURITY VIOLATION in ${relativePath}: HTTP methods [${exportedMethods.filter((m) => !guardedMethods.includes(m)).join(', ')}] missing direct requireProfileAccess call!`
        ).toEqual(exportedMethods);
      }
    });
  });

  describe('Runtime Access Guard Verification', () => {
    const { getCurrentUser } = vi.hoisted(() => ({
      getCurrentUser: vi.fn(),
    }));

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('denies unauthenticated requests with 401 UnauthorizedError and records audit log', async () => {
      const { getCurrentUser } = await import('../lib/session');
      (getCurrentUser as any).mockResolvedValue(null);

      await expect(requireProfileAccess('profile-1')).rejects.toThrow(UnauthorizedError);

      expect(recordAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          profileId: 'profile-1',
          action: 'HEALTH_DATA:READ',
          metadata: expect.objectContaining({ reason: 'UNAUTHENTICATED_ACCESS_ATTEMPT' }),
        })
      );
    });

    it('denies non-member requests with 403 ForbiddenError and records audit log', async () => {
      const { getCurrentUser } = await import('../lib/session');
      (getCurrentUser as any).mockResolvedValue({ id: 'user-outsider' });
      (prisma.careProfile.findUnique as any).mockResolvedValue({ id: 'profile-1' });
      (prisma.membership.findUnique as any).mockResolvedValue(null);

      await expect(requireProfileAccess('profile-1')).rejects.toThrow(ForbiddenError);

      expect(recordAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          profileId: 'profile-1',
          actorUserId: 'user-outsider',
          action: 'HEALTH_DATA:READ',
          metadata: expect.objectContaining({ reason: 'INACTIVE_OR_REVOKED_MEMBERSHIP', status: 'NO_MEMBERSHIP' }),
        })
      );
    });

    it('denies revoked member requests with 403 ForbiddenError and records audit log', async () => {
      const { getCurrentUser } = await import('../lib/session');
      (getCurrentUser as any).mockResolvedValue({ id: 'user-revoked' });
      (prisma.careProfile.findUnique as any).mockResolvedValue({ id: 'profile-1' });
      (prisma.membership.findUnique as any).mockResolvedValue({
        id: 'mem-revoked',
        profileId: 'profile-1',
        userId: 'user-revoked',
        status: 'REVOKED',
      });

      await expect(requireProfileAccess('profile-1')).rejects.toThrow(ForbiddenError);

      expect(recordAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          profileId: 'profile-1',
          actorUserId: 'user-revoked',
          actorMembershipId: 'mem-revoked',
          action: 'HEALTH_DATA:READ',
          metadata: expect.objectContaining({ reason: 'INACTIVE_OR_REVOKED_MEMBERSHIP', status: 'REVOKED' }),
        })
      );
    });
  });
});
