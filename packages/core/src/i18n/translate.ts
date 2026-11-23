export type Messages = { [key: string]: string | Messages };

function lookup(messages: Messages, parts: string[]): string | undefined {
  const value = parts.reduce<string | Messages | undefined>((node, part) => {
    if (node === undefined || typeof node === 'string') return undefined;
    return node[part];
  }, messages);
  return typeof value === 'string' ? value : undefined;
}

export function translate(messages: Messages, key: string, substitutions?: string[]): string {
  const value = lookup(messages, key.split('.')) ?? lookup(messages, key.split('_'));
  if (value === undefined) return key;
  if (!substitutions?.length) return value;
  return value.replace(/\$(\d+)/g, (match, index) => substitutions[Number(index) - 1] ?? match);
}
