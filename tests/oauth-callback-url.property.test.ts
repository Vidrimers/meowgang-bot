// Feature: video-upload-bot, Property 14: OAuth callback URL формируется из переменных окружения
// Validates: Requirements 13.3

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildCallbackUrl } from '../src/services/oauth.service.js';
import type { Platform } from '../src/db/types.js';

// ─── Арбитрарии ───────────────────────────────────────────────────────────────

// IPv4-адреса: генерируем 4 октета
const ipArb = fc
  .tuple(
    fc.integer({ min: 1, max: 254 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 1, max: 254 })
  )
  .map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`);

const portArb = fc.integer({ min: 1024, max: 65535 }).map(String);
const platformArb = fc.constantFrom<Platform>('youtube', 'instagram', 'tiktok');

// ─── Тесты ────────────────────────────────────────────────────────────────────

describe('Property 14: OAuth callback URL формируется из переменных окружения', () => {
  it('buildCallbackUrl возвращает http://{ip}:{port}/auth/{platform}/callback', () => {
    fc.assert(
      fc.property(ipArb, portArb, platformArb, (ip, port, platform) => {
        const url = buildCallbackUrl(platform, ip, port);
        const expected = `http://${ip}:${port}/auth/${platform}/callback`;
        return url === expected;
      }),
      { numRuns: 100 }
    );
  });

  it('URL содержит ip, port и название платформы', () => {
    fc.assert(
      fc.property(ipArb, portArb, platformArb, (ip, port, platform) => {
        const url = buildCallbackUrl(platform, ip, port);

        expect(url).toContain(ip);
        expect(url).toContain(port);
        expect(url).toContain(platform);
        expect(url).toMatch(/^http:\/\//);
        expect(url).toMatch(/\/callback$/);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('URL для каждой платформы уникален при одинаковых ip и port', () => {
    fc.assert(
      fc.property(ipArb, portArb, (ip, port) => {
        const ytUrl = buildCallbackUrl('youtube', ip, port);
        const igUrl = buildCallbackUrl('instagram', ip, port);
        const ttUrl = buildCallbackUrl('tiktok', ip, port);

        expect(ytUrl).not.toBe(igUrl);
        expect(ytUrl).not.toBe(ttUrl);
        expect(igUrl).not.toBe(ttUrl);

        expect(ytUrl).toContain('youtube');
        expect(igUrl).toContain('instagram');
        expect(ttUrl).toContain('tiktok');

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('при изменении ip или port URL меняется', () => {
    fc.assert(
      fc.property(
        ipArb,
        ipArb,
        portArb,
        platformArb,
        (ip1, ip2, port, platform) => {
          fc.pre(ip1 !== ip2); // гарантируем разные IP

          const url1 = buildCallbackUrl(platform, ip1, port);
          const url2 = buildCallbackUrl(platform, ip2, port);

          return url1 !== url2;
        }
      ),
      { numRuns: 100 }
    );
  });
});
