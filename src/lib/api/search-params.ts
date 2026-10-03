import { z } from "zod";

/** A value a query parameter can carry once decoded. */
export type SearchParamValue = string | number | boolean | null;

/** Typed request parameters, as API callers build them. `undefined` means "absent". */
export type SearchParamsInput = Record<
  string,
  SearchParamValue | readonly SearchParamValue[] | undefined
>;

/**
 * Encode typed parameters as a query string: `null` travels as `"null"`, arrays
 * as repeated keys, and `undefined` is left out. `searchParamsToObject` is the
 * inverse for any schema that accepts the parameters.
 */
export function toSearchParams(params: SearchParamsInput): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    const values: readonly SearchParamValue[] = Array.isArray(value) ? value : [value];
    for (const item of values) search.append(key, String(item));
  }
  return search;
}

/**
 * Decode a query string into the plain object `schema` validates, converting
 * each value by the type its field declares. A string field keeps "2024" as
 * text, a number field reads it as 2024, and an array field collects repeated
 * keys — including a single one. Keys the schema can't describe fall back to
 * reading anything that looks like a number, boolean or null as one.
 */
export function searchParamsToObject(
  searchParams: URLSearchParams,
  schema: z.ZodType
): Record<string, unknown> {
  const shape = schema instanceof z.ZodObject ? (schema.shape as Record<string, z.ZodType>) : {};
  const raw: Record<string, unknown> = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    const field = shape[key];
    const kind = field === undefined ? null : fieldKind(field);
    if (kind?.base === "array") {
      raw[key] = values.map((value) => decode(value, kind.element));
    } else if (values.length > 1) {
      raw[key] = values.map((value) => decode(value, kind));
    } else {
      raw[key] = decode(values[0]!, kind);
    }
  }
  return raw;
}

type Base = "string" | "number" | "boolean" | "other";

interface FieldKind {
  base: Base | "array";
  nullable: boolean;
  /** For arrays, how each element decodes. */
  element: FieldKind | null;
}

/** What a field accepts, seen through optional/nullable/default wrappers. */
function fieldKind(schema: z.ZodType): FieldKind {
  let nullable = false;
  let current: z.ZodType = schema;
  for (;;) {
    if (current instanceof z.ZodOptional || current instanceof z.ZodDefault) {
      current = current.unwrap() as z.ZodType;
    } else if (current instanceof z.ZodNullable) {
      nullable = true;
      current = current.unwrap() as z.ZodType;
    } else {
      break;
    }
  }

  if (current instanceof z.ZodArray) {
    return { base: "array", nullable, element: fieldKind(current.element as z.ZodType) };
  }
  if (current instanceof z.ZodString || current instanceof z.ZodEnum) {
    return { base: "string", nullable, element: null };
  }
  if (current instanceof z.ZodNumber) return { base: "number", nullable, element: null };
  if (current instanceof z.ZodBoolean) return { base: "boolean", nullable, element: null };
  return { base: "other", nullable, element: null };
}

function decode(value: string, kind: FieldKind | null): unknown {
  if (kind === null || kind.base === "other" || kind.base === "array") return guess(value);
  if (value === "null" && kind.nullable) return null;
  switch (kind.base) {
    case "string":
      return value;
    case "number": {
      const num = Number(value);
      // Left as text when it isn't a number, so validation reports the field.
      return value.trim() !== "" && !Number.isNaN(num) ? num : value;
    }
    case "boolean":
      return value === "true" ? true : value === "false" ? false : value;
  }
}

/** Read a value whose field type is unknown by what it looks like. */
function guess(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  const num = Number(value);
  if (!Number.isNaN(num) && value.trim() !== "") return num;
  return value;
}
