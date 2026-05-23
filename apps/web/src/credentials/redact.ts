const secretPatterns = [
  /\bsk-or-v1-[A-Za-z0-9_-]+\b/g,
  /\bsk-ant-[A-Za-z0-9_-]+\b/g,
  /\bsk-proj-[A-Za-z0-9_-]+\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bvck_[A-Za-z0-9_-]{20,}\b/g,
];

export function redactSecrets(value: string): string {
  return secretPatterns.reduce(
    (text, pattern) => text.replace(pattern, "[redacted-secret]"),
    value,
  );
}
