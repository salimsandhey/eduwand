import { Text, TextProps } from "react-native";

// The model is told "no prose, no markdown fences" in every generation
// prompt, but nothing stops it from still wrapping a term in **bold** inside
// a field's text (headings, key terms, emphasis) - it does this often enough
// that raw "**" showing up in a flashcard/lesson plan was a real user-facing
// bug, not a one-off. Rather than chase every prompt into forbidding it (the
// model doesn't reliably comply anyway), this renders the one markdown
// construct that actually shows up - **bold** - as real bold text, and
// leaves everything else untouched.
const BOLD_RE = /\*\*([^*]+)\*\*/g;

/**
 * Drop-in replacement for `<Text>` that renders `**bold**` spans in `children`
 * as actual bold text instead of literal asterisks. `children` must be a
 * single string (not composed with other elements).
 */
export function FormattedText({ children, style, ...rest }: TextProps & { children: string | null | undefined }) {
  const text = children ?? "";
  if (!text.includes("**")) {
    return (
      <Text style={style} {...rest}>
        {text}
      </Text>
    );
  }

  const parts: (string | { bold: string })[] = [];
  let lastIndex = 0;
  BOLD_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BOLD_RE.exec(text))) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push({ bold: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));

  return (
    <Text style={style} {...rest}>
      {parts.map((part, i) =>
        typeof part === "string" ? (
          part
        ) : (
          <Text key={i} style={{ fontWeight: "800" }}>
            {part.bold}
          </Text>
        )
      )}
    </Text>
  );
}

// Same span-parsing, for the (rarer) spot that needs the plain string back
// rather than a rendered element - e.g. an icon-matching heuristic that reads
// card text as a search string and shouldn't be tripped up by stray "**".
export function stripBoldMarkers(text: string): string {
  return text.includes("**") ? text.replace(BOLD_RE, "$1") : text;
}
