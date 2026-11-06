import { renderConnectPage } from './arc.page.js';

describe('wallet page', () => {
  const html = renderConnectPage('test-nonce');
  const script = html.split('<script nonce="test-nonce">')[1]!.split('</script>')[0]!;

  it('ships a script the browser can parse (a syntax error leaves the page stuck on "Loading…")', () => {
    // Compiles without running it; throws SyntaxError on e.g. a raw newline inside a string.
    expect(() => new Function(script)).not.toThrow();
  });

  it('handles every link purpose and skips free-tunnel warning pages on its API calls', () => {
    for (const fn of ['runWallet', 'runFund', 'runPick'])
      expect(script).toContain(`async function ${fn}`);
    expect(script).toContain("'ngrok-skip-browser-warning': '1'");
    expect(script.match(/fetch\(/g)!.length).toBe(script.match(/headers:/g)!.length);
  });
});
