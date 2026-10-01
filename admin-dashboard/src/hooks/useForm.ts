import { useCallback, useMemo, useState } from "react";
import { validateAll } from "../utils/validation";
import type { FormErrors, FormRules } from "../utils/validation";

// Validation for one form. Errors show for a field once the user has left it
// (blur) or tried to submit - never while they are still typing their first
// attempt - and a server-side validation_error's per-field messages
// (ApiError.fields) show under the same inputs.
//
// useFormErrors validates values you already hold in your own state:
//   const v = useFormErrors({ email, phone }, { email: rules.email(), phone: rules.phone() });
//   <TextInput onBlur={() => v.blur("email")} ... />
//   <FieldError message={v.error("email")} />
//   if (!v.submit()) return;             // marks every field, false when anything is invalid
//   try { ... } catch (err) { if (!v.applyServerError(err)) setFormError(...) }
// useForm additionally owns the values (values / set) for screens that don't
// already have their own state.
export function useFormErrors<T extends { [K in keyof T]: string }>(values: T, formRules: FormRules<T>) {
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<FormErrors<T>>({});

  const errors = useMemo(() => validateAll(values, formRules), [values, formRules]);

  const blur = useCallback((key: keyof T) => setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true })), []);

  /** The message to show under a field: server error, else the rule error once touched. */
  const error = useCallback(
    (key: keyof T): string | undefined => serverErrors[key] ?? (touched[key] ? errors[key] : undefined),
    [errors, touched, serverErrors]
  );

  /** Call from onChangeText so a server error for that field clears as soon as the user edits it. */
  const clearServerError = useCallback((key: keyof T) => setServerErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev)), []);

  /** Marks every field as touched; returns true only when the whole form is valid. */
  const submit = useCallback((): boolean => {
    setTouched(Object.fromEntries((Object.keys(formRules) as (keyof T)[]).map((k) => [k, true])) as Partial<Record<keyof T, boolean>>);
    return Object.keys(errors).length === 0;
  }, [errors, formRules]);

  /**
   * Puts a backend validation_error's `fields` under the matching inputs. Returns
   * true if it had any. `map` renames backend field names to this form's keys
   * (e.g. { guardianContact: "phone" }); unmapped names are used as they are.
   */
  const applyServerError = useCallback((err: unknown, map: Record<string, keyof T> = {}): boolean => {
    const fields = (err as { fields?: Record<string, string> } | null)?.fields;
    if (!fields || Object.keys(fields).length === 0) return false;
    const next: FormErrors<T> = {};
    for (const [name, message] of Object.entries(fields)) next[(map[name] ?? name) as keyof T] = message;
    setServerErrors(next);
    return true;
  }, []);

  /** Forget touched state and server errors (e.g. when the form is reopened). */
  const clear = useCallback(() => {
    setTouched({});
    setServerErrors({});
  }, []);

  return { error, errors, blur, clearServerError, submit, applyServerError, clear, isValid: Object.keys(errors).length === 0 };
}

export function useForm<T extends { [K in keyof T]: string }>(initial: T, formRules: FormRules<T>) {
  const [values, setValues] = useState<T>(initial);
  const state = useFormErrors(values, formRules);
  const { clearServerError, clear } = state;

  const set = useCallback(
    <K extends keyof T>(key: K, value: T[K]) => {
      setValues((prev) => ({ ...prev, [key]: value }));
      clearServerError(key);
    },
    [clearServerError]
  );

  const reset = useCallback(
    (next?: T) => {
      setValues(next ?? initial);
      clear();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clear]
  );

  return { ...state, values, set, reset };
}
