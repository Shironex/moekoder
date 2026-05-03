import { describe, it, expect } from 'vitest';
import { decideWindowOpen, isAllowedNavigation } from './window';

/* ------------------------------------------------------------ */
/*  Window-open handler decisions: every code path returns an    */
/*  `action: 'deny'` outcome — the only thing that varies is     */
/*  whether we shell out to the OS for an http(s) URL.           */
/* ------------------------------------------------------------ */

describe('decideWindowOpen', () => {
  it('denies the popup but forwards http URLs to shell.openExternal', () => {
    const decision = decideWindowOpen('http://example.com/path');
    expect(decision.action).toBe('deny');
    expect(decision.externalUrl).toBe('http://example.com/path');
  });

  it('denies the popup but forwards https URLs to shell.openExternal', () => {
    const decision = decideWindowOpen('https://github.com/Shironex/moekoder');
    expect(decision.action).toBe('deny');
    expect(decision.externalUrl).toBe('https://github.com/Shironex/moekoder');
  });

  it('denies and refuses to forward javascript: URLs', () => {
    const decision = decideWindowOpen('javascript:alert(1)');
    expect(decision.action).toBe('deny');
    expect(decision.externalUrl).toBeNull();
  });

  it('denies and refuses to forward file:// URLs', () => {
    const decision = decideWindowOpen('file:///etc/passwd');
    expect(decision.action).toBe('deny');
    expect(decision.externalUrl).toBeNull();
  });

  it('denies and refuses to forward data: URLs', () => {
    const decision = decideWindowOpen('data:text/html,<script>1</script>');
    expect(decision.action).toBe('deny');
    expect(decision.externalUrl).toBeNull();
  });

  it('denies unparseable strings without throwing', () => {
    const decision = decideWindowOpen('not a url');
    expect(decision.action).toBe('deny');
    expect(decision.externalUrl).toBeNull();
  });
});

/* ------------------------------------------------------------ */
/*  In-window navigation guard: only the dev URL (in dev) or     */
/*  the file:// bundle (in prod) is allowed.                     */
/* ------------------------------------------------------------ */

describe('isAllowedNavigation', () => {
  const devUrl = 'http://localhost:15180';

  it('allows the Vite dev URL in dev mode', () => {
    expect(isAllowedNavigation('http://localhost:15180/', true, devUrl)).toBe(true);
    expect(isAllowedNavigation('http://localhost:15180/onboarding', true, devUrl)).toBe(true);
  });

  it('blocks foreign origins in dev mode', () => {
    expect(isAllowedNavigation('https://attacker.example/', true, devUrl)).toBe(false);
    expect(isAllowedNavigation('http://localhost:9999/', true, devUrl)).toBe(false);
  });

  it('allows file:// URLs in prod mode', () => {
    expect(isAllowedNavigation('file:///C:/path/index.html', false, devUrl)).toBe(true);
    expect(isAllowedNavigation('file:///Applications/Moekoder.app/index.html', false, devUrl)).toBe(
      true
    );
  });

  it('blocks anything other than file:// in prod mode', () => {
    expect(isAllowedNavigation('https://attacker.example/', false, devUrl)).toBe(false);
    expect(isAllowedNavigation('http://localhost:15180/', false, devUrl)).toBe(false);
    expect(isAllowedNavigation('javascript:alert(1)', false, devUrl)).toBe(false);
  });
});
