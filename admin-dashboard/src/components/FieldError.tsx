import type { CSSProperties } from "react";

// Inline validation message shown directly under an input (see hooks/useForm.ts
// and utils/validation.ts). Renders nothing when there is no message, so it can
// sit under every field without shifting a valid form. Pair it with
// invalidInput so the input's border turns red too:
//   <input style={{ ...styles.input, ...invalidInput(!!v.error("email")) }} aria-invalid={!!v.error("email")} />
//   <FieldError message={v.error("email")} />
export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" style={styles.error}>
      {message}
    </div>
  );
}

export function invalidInput(invalid: boolean): CSSProperties {
  return invalid ? { borderColor: "var(--status-critical)" } : {};
}

const styles: Record<string, CSSProperties> = {
  error: { color: "var(--status-critical)", fontSize: 12, lineHeight: 1.4, marginTop: 4 },
};
