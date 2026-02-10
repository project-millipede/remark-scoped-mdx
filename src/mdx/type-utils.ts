/**
 * Narrow `keyof TObject` down to *only string keys*.
 *
 * Why this exists:
 *
 * 1) JavaScript reality:
 *    - Property keys are **string** or **symbol**.
 *    - Numeric property access is allowed and coerces to a string:
 *        obj[123]  // same as obj["123"]
 *
 * 2) TypeScript modeling:
 *    - For “string-indexed” objects
 *      (e.g. `Record<string, X>` / `{ [k: string]: X }`),
 *      TypeScript models `keyof TObject` as `string | number`.
 *    - This `number` is a typing convenience to reflect that numeric access is
 *      valid, not a statement that JS objects truly have “number keys”.
 *
 * 3) Practical motivation:
 *    - The extra `number` is annoying when you want to pass keys into APIs that
 *      expect plain `string` (e.g. `Set<string>.has(...)`) and when iterating
 *      keys safely.
 *
 * Note:
 * - This is a **type-level utility**, not a runtime type guard.
 *   It does not validate or coerce keys at runtime; it only affects
 *   TypeScript’s checking.
 *
 * Example:
 *   type InputRecord = Record<string, unknown>;
 *   type MixedKeys = keyof InputRecord;             // string | number
 *   type OnlyStringKeys = StringKeys<InputRecord>;  // string
 *
 * Equivalent forms:
 * - `Extract<keyof TObject, string>` (shown below)
 * - `keyof TObject & string` (intersection)
 */
export type StringKeys<TObject> = Extract<keyof TObject, string>;

/**
 * Typed `Object.keys` helper (string keys only).
 *
 * Why this exists:
 * - In JavaScript, `Object.keys(obj)` returns the object’s **own enumerable
 *   string keys** at runtime.
 * - In TypeScript, the return type is usually just `string[]`, because TS can’t
 *   generally know which specific keys exist for an arbitrary `TObject` at
 *   runtime.
 *
 * What this helper does:
 * - When you *do* know the runtime object matches its static type (common for
 *   object literals like registries/config maps), this helper narrows the
 *   result to `StringKeys<TObject>[]` so:
 *   - iterating keys stays aligned with the object type, and
 *   - `obj[key]` indexing doesn’t force you into unsafe casts everywhere.
 *
 * Note:
 * - This is a **type-level convenience**, not a runtime type guard.
 *   It does not validate keys.
 */
export function stringKeysOf<TObject extends object>(
  obj: TObject
): Array<StringKeys<TObject>> {
  return Object.keys(obj) as Array<StringKeys<TObject>>;
}

/**
 * Filters a list of IDs, keeping only those present in the allowed set.
 *
 * @template Id - The specific string literal type of the input IDs (e.g. `'Header' | 'Footer'`).
 * Capturing this generic ensures the return value remains a list of specific literals `Id[]`
 * instead of widening to a generic `string[]`.
 *
 * @param ids - The list of component IDs to check.
 *   - Type: `ReadonlyArray<Id>` to support immutable inputs.
 *
 * @param allowed - The set of valid/available keys.
 *   - Type: `ReadonlySet<string>` for efficient O(1) lookups.
 *
 * @returns A new array containing only the items from `ids` that exist in `allowed`.
 *   - **Order:** Preserves the original sequence from `ids`.
 *   - **Type:** Returns `Id[]` (preserving the input's specific union type).
 */
export function filterAllowedIds<Id extends string>(
  ids: ReadonlyArray<Id>,
  allowed: ReadonlySet<string>
): Id[] {
  return ids.filter(id => allowed.has(id));
}
