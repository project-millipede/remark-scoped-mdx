/**
 * Compile-time phantom metadata carrier.
 *
 * This type carries props metadata on entry types at compile time.
 *
 * Why this exists:
 * 1) Identity anchor:
 *    Reserves a stable protocol field (`PROPS_IDENTITY_ANCHOR`) where the
 *    props payload is attached in type space.
 * 2) Metadata transport:
 *    Lets entry types keep `P` available across registry composition and
 *    downstream authoring utilities.
 * 3) Runtime silence:
 *    The field is optional, so runtime objects are not required to assign it.
 *
 * Why no `unique symbol`:
 * - A symbol key gives stronger nominal uniqueness, but can make exported type
 *   declarations harder to consume when symbol identities flow through public
 *   APIs across package boundaries.
 * - A literal optional field preserves the same inference contract
 *   (`EntryLike extends PhantomProps<infer P>`) with more declaration-portable
 *   output for consumers.
 *
 * Structure:
 * - `PROPS_IDENTITY_ANCHOR`: reserved protocol field name.
 * - `P extends object`: props payload carried by the entry type.
 * - `?`: optional field; no runtime injection is required.
 *
 * Expectations:
 * - Used for type inference and validation only.
 * - No runtime branding object or identity token is required.
 */
export type PhantomProps<P extends object> = {
  readonly PROPS_IDENTITY_ANCHOR?: P;
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
 * Case 1 — SUCCESS (Metadata Retrieved)
 * - Candidate carries `PROPS_IDENTITY_ANCHOR?: {...}`
 * - Result: inferred payload type
 *
 * Case 2 — FAILURE (Registration Missing / Incompatible Shape)
 * - Candidate is not structurally compatible with `PhantomProps<...>`
 * - Result: `Fallback`
 *
 * Case 3 — FAILURE (Anchor Key or Payload Mismatch)
 * - Candidate uses a different key name, or an incompatible payload type
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
