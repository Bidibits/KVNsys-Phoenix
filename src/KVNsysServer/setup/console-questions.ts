import { createInterface } from 'node:readline';
import { NoAnswer, type Questions } from './questions.js';

/**
 * Questions asked in the server's console window. At a keyboard, a secret shows as stars. From a
 * pipe (a script or a test), each answer is one line.
 */
export function consoleQuestions(
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stdout,
): Questions & { close(): void } {
  return input.isTTY ? keyboardQuestions(input, output) : lineQuestions(input, output);
}

function lineQuestions(input: NodeJS.ReadStream, output: NodeJS.WriteStream): Questions & { close(): void } {
  // One reader for every question: lines that arrive together aren't lost between questions.
  const lines = createInterface({ input, terminal: false })[Symbol.asyncIterator]();
  const next = async (prompt: string) => {
    output.write(prompt);
    const line = await lines.next();
    if (line.done) throw new NoAnswer();
    output.write('\n');
    return line.value;
  };
  return { ask: next, askSecret: next, close: () => void lines.return?.() };
}

function keyboardQuestions(input: NodeJS.ReadStream, output: NodeJS.WriteStream): Questions & { close(): void } {
  // Key by key, so a secret can show as stars instead of the letters typed.
  const read = (prompt: string, secret: boolean) =>
    new Promise<string>((resolve) => {
      let typed = '';
      const finish = () => {
        input.off('data', onKeys);
        input.setRawMode(false);
        input.pause();
        output.write('\n');
        resolve(typed);
      };
      const onKeys = (keys: string) => {
        if (keys.startsWith('\u001b')) return; // arrow keys and the like
        for (const key of keys) {
          if (key === '\r' || key === '\n') {
            finish();
            return;
          }
          if (key === '\u0003') {
            // Ctrl+C: in this mode it arrives as a key, not as a signal.
            input.setRawMode(false);
            output.write("\nStopped before the shop was set up. It'll ask again next time.\n");
            process.exit(130);
          }
          if (key === '\b' || key === '\u007f') {
            if (typed) {
              typed = [...typed].slice(0, -1).join('');
              output.write('\b \b');
            }
          } else if (key >= ' ') {
            typed += key;
            output.write(secret ? '*' : key);
          }
        }
      };
      output.write(prompt);
      input.setEncoding('utf8');
      input.setRawMode(true);
      input.on('data', onKeys);
      input.resume();
    });
  return { ask: (prompt) => read(prompt, false), askSecret: (prompt) => read(prompt, true), close: () => {} };
}
