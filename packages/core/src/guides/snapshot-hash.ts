export function hashPayload(value: unknown): string {
  const json = JSON.stringify(value) ?? '';
  let hash = 5381;
  for (let i = 0; i < json.length; i++) {
    hash = ((hash << 5) + hash + json.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}
