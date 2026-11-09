/**
 * Reads one secret from the terminal without echoing it. Raw mode, no readline: the prompt is written once and nothing
 * redraws it. Paste works (a whole chunk at once), Backspace edits, Ctrl+C cancels, terminal escape sequences are
 * dropped. After Enter it prints only how many characters were read, so an empty paste is obvious.
 */
export function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') { reject(new Error('Secrets are only read from an interactive terminal.')); return; }
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let buf = '';
    let inEscape = false;
    const finish = () => { stdin.removeListener('data', onData); stdin.setRawMode(false); stdin.pause(); };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (inEscape) { if (/[A-Za-z~]/.test(ch)) inEscape = false; continue; }
        if (ch === '\u001b') { inEscape = true; continue; }
        if (ch === '\r' || ch === '\n') {
          finish();
          process.stdout.write(`\n  (${buf.trim().length} characters read)\n`);
          resolve(buf.trim());
          return;
        }
        if (ch === '\u0003') { finish(); process.stdout.write('\n'); reject(new Error('Cancelled.')); return; }
        if (ch === '\u007f' || ch === '\b') { buf = buf.slice(0, -1); continue; }
        if (ch >= ' ') buf += ch;
      }
    };
    stdin.on('data', onData);
  });
}

