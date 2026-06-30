// Tiny terminal styling helpers. No dependencies — respects NO_COLOR.
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

const wrap = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));

export const bold = wrap("1");
export const dim = wrap("2");
export const red = wrap("31");
export const green = wrap("32");
export const yellow = wrap("33");
export const blue = wrap("34");
export const cyan = wrap("36");

export function heading(text) {
  console.log("\n" + bold(cyan(text)));
  console.log(dim("─".repeat(text.length)));
}

export const ok = (m) => console.log(`${green("✓")} ${m}`);
export const warn = (m) => console.log(`${yellow("!")} ${m}`);
export const fail = (m) => console.log(`${red("✗")} ${m}`);
export const info = (m) => console.log(`${blue("•")} ${m}`);
