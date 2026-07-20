interface ProfileIdentity {
  name: string | null;
  email: string;
}

const LETTER_PATTERN = /\p{L}/u;

function firstLetter(value: string) {
  for (const char of value) {
    if (LETTER_PATTERN.test(char)) return char;
  }
  return "";
}

export function getProfileInitials({ name, email }: ProfileIdentity) {
  const words = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 1) {
    return firstLetter(words[0]).toLocaleUpperCase() || "?";
  }

  if (words.length > 1) {
    const first = firstLetter(words[0]);
    const last = firstLetter(words.at(-1) ?? "");
    const initials = `${first}${last}`.toLocaleUpperCase();
    if (initials.trim()) return initials;
  }

  const emailInitial = firstLetter(email);
  return emailInitial ? emailInitial.toLocaleUpperCase() : "?";
}