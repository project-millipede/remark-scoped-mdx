/**
 * Compile-time-only identity anchor for phantom registry metadata.
 *
 * This is a TypeScript type-system construct, not a runtime symbol value:
 * - `declare` means no JavaScript is emitted.
 * - `unique symbol` provides a collision-proof key identity in type space.
 *
 * Why this exists:
 * 1. Type identity: defines the stable slot key used by `PhantomProps<P>`.
 * 2. Zero runtime cost: no emitted value, no runtime allocation, no runtime checks.
 * 3. Strict separation: enables inference metadata without runtime branding
 *    patterns like `Symbol()` or `Symbol.for(...)`.
 *
 * Expectation:
 * - Used only for compile-time typing and extraction.
 * - Runtime objects remain plain and do not need to carry this property.
 */
declare const PROPS_IDENTITY_ANCHOR: unique symbol;

/**
 * Compile-time phantom metadata carrier.
 *
 * This type attaches props metadata to an entry in type space only.
 * It does not require a runtime property to exist on actual objects.
 *
 * Structure:
 * - `[PROPS_IDENTITY_ANCHOR]`: unique compile-time slot key.
 * - `P extends object`: metadata payload (typically React props).
 * - `?`: optional slot; no assignment is required.
 *
 * Expectations:
 * - Used for type inference and validation only.
 * - No runtime branding, allocation, or object mutation is required.
 */
export type PhantomProps<P extends object> = {
  readonly [PROPS_IDENTITY_ANCHOR]?: P;
};

/**
 * Extract phantom props metadata from an entry type, with configurable fallback.
 *
 * Contract:
 * - Input: `EntryLike` candidate + `Fallback`
 * - If `EntryLike` matches `PhantomProps<...>`, returns inferred payload `P`
 * - Otherwise returns `Fallback`
 *
 * Step-by-step:
 * 1) Match phase:
 *    `EntryLike extends PhantomProps<...>`
 *    - Checks whether `EntryLike` carries the phantom metadata slot.
 *
 * 2) Inference phase:
 *    `infer P`
 *    - If matched, captures the payload type stored in that slot.
 *
 * 3) Resolution phase:
 *    `? P : Fallback`
 *    - Match success -> return inferred payload `P`
 *    - Match failure -> return `Fallback`
 *
 * Case 1 — SUCCESS (Ghost Retrieval)
 * - Candidate carries `[PROPS_IDENTITY_ANCHOR]?: {...}`
 * - Result: inferred payload type
 *
 * Case 2 — FAILURE (Registration Missing / Incompatible Shape)
 * - Candidate is not structurally compatible with `PhantomProps<...>`
 * - Result: `Fallback`
 *
 * Case 3 — FAILURE (Identity Mismatch / Forgery)
 * - Candidate uses a string key named like the anchor, not the `unique symbol` key
 * - This is a structural incompatibility with `PhantomProps<...>`
 * - Result: `Fallback`
 *
 * Example outcomes:
 * - `PropsOfEntryOr<PhantomProps<{tone: string}>, never>` -> `{tone: string}`
 * - `PropsOfEntryOr<unknown, never>` -> `never`
 *
 * Note:
 * - This is the low-level primitive.
 * - `PropsOfEntry` is the convenience alias using `{}` as fallback.
 */
export type PropsOfEntryOr<EntryLike, Fallback> =
  EntryLike extends PhantomProps<infer P> ? P : Fallback;

/**
 * Convenience alias for the forgiving extraction policy.
 *
 * `PropsOfEntry<EntryLike>` is equivalent to:
 * `PropsOfEntryOr<EntryLike, {}>`.
 *
 * Behavior:
 * - If phantom metadata is present, returns the inferred props payload.
 * - If metadata is missing/incompatible, returns `{}`.
 *
 * Why `{}` fallback:
 * - Keeps type pipelines composable when metadata is absent.
 * - Avoids `never` collapse in intersections and utility chains.
 *
 * Related:
 * - Strict fallback policy: `PropsOfEntryOr<EntryLike, never>`.
 *
 * Examples:
 * - `PropsOfEntry<PhantomProps<{ tone: string }>>` -> `{ tone: string }`
 * - `PropsOfEntry<unknown>` -> `{}`
 */
export type PropsOfEntry<EntryLike> = PropsOfEntryOr<EntryLike, {}>;

/**
 * Compile-time registry boundary for phantom props metadata.
 *
 * Purpose:
 * - Defines a string-keyed dictionary whose values follow the phantom props contract.
 * - The registry carries props information in type space only
 *   (no runtime metadata field is required).
 *
 * What it holds:
 * - Keys: registry entry identifiers (typically JSX component names).
 * - Values: `PhantomProps<...>` payload carriers used for props inference.
 *
 * Example:
 * ```ts
 * type Registry = {
 *   AlertScope: PhantomProps<{}>;
 *   AlertParagraph: PhantomProps<{ variant: 'red' | 'blue' }>;
 * };
 * ```
 */
export type PhantomRegistry = Record<string, PhantomProps<object>>;
