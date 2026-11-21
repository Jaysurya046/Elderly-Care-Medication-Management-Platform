import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

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

describe('Security Invariant: Route Access Guard (Goal.md Section 9 & 4)', () => {
  it('enforces that EVERY API route under /api/profiles/[id] calls requireProfileAccess', () => {
    const profilesApiDir = path.resolve(__dirname, '../app/api/profiles/[id]');
    const routeFiles = getAllRouteFiles(profilesApiDir);

    expect(routeFiles.length).toBeGreaterThan(0);

    for (const file of routeFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const hasImport = content.includes('requireProfileAccess');
      const hasCall = content.includes('requireProfileAccess(');

      const relativePath = path.relative(path.resolve(__dirname, '..'), file);
      expect(
        hasImport && hasCall,
        `SECURITY VIOLATION: Route ${relativePath} does NOT call requireProfileAccess()!`
      ).toBe(true);
    }
  });
});
