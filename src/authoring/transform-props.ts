import type {
  RequiredKeysOf,
  OmitIndexSignature,
  IsNever,
  EmptyObject,
  If,
  HasRequiredKeys
} from 'type-fest';

import type { PropsOfEntry } from '../mdx/entry-protocol';

import { type StringKeys } from '../mdx/type-utils';

/**
 * Entry point for the type inference chain.
 *
 * Purpose:
 * Extracts the props payload `P` embedded in the `EntryLike` type (via the
 * `PhantomProps` contract) and acts as a narrowing utility (filtering out
 * non-object types like undefined) to ensure downstream utilities receive a
 * valid object.
 *
 * Scope (Root Level Only):
 * - Operates strictly on the extracted payload `P` (the Props Container).
 * - **Guarantee:** It acts as a gatekeeper for the object structure itself.
 *   It does *not* look inside the box or iterate over keys. Consequently,
 *   specific property types (like `label: string | null`) are preserved
 *   exactly as defined in the component.
 *
 * Mechanics:
 * 1. **Retrieval**: `PropsOfEntry<...>` (alias of `PropsOfEntryOr<..., {}>`)
 *    initiates the reverse lookup chain. `PropsOfEntryOr` uses `infer P` to
 *    extract the type bound to the `PROPS_IDENTITY_ANCHOR` protocol field on
 *    `PhantomProps<P>`.
 * 2. **Narrowing**: `Extract<..., object>` filters the result to strictly match
 *    the `object` constraint.
 *    - This removes `null`, `undefined`, and primitives (see Examples).
 *    - Resolves the **Optional Argument** pattern (`(props?: Props) => ...`):
 *      1. The `?` syntax causes TypeScript to infer the type as `Props | undefined`.
 *      2. Since `undefined` is not an object, the filter discards it.
 *      3. Result: The union collapses back to the concrete `Props` object.
 *
 *    This strict filtering prevents downstream utilities (like `OmitIndexSignature`)
 *    from crashing on non-object types.
 *
 * Examples:
 *
 * 1. The "Optional Object" Case (Standard React)
 *    Source State: Derived from `const Comp = (props?: { label: string }) => ...`
 *    Input Union:  `{ label: string } | undefined`
 *    Logic:        The Object branch extends `object`? YES. `undefined`? NO.
 *    Result:       `{ label: string }`
 *    (The root `undefined` introduced by the optional argument is strictly removed,
 *    ensuring the result is always a safe object to process.)
 *
 * 2. The "Safety Net" Case (Primitives, Null, & Prototype Pollution)
 *    Source State: Derived from `const Comp = (props?: string) => ...`
 *    Input Union:  `string | undefined`
 *    Logic:        `string` (primitive)? NO. `undefined`? NO.
 *    Result:       `never`
 *
 *    The Rationale (Prototype Pollution):
 *    If we allowed primitives to pass, `keyof Props` would expose their prototype methods
 *    as valid keys. This applies to all primitives:
 *    - `string`: would expose `toString`, `charAt`, `length`, `toUpperCase`...
 *    - `number`: would expose `toFixed`, `toExponential`, `toPrecision`...
 *
 *    By strictly rejecting all non-object types, we prevent these internal methods
 *    from polluting the autocomplete suggestions in the authoring API.
 */
export type RawPropsOf<EntryLike> = Extract<PropsOfEntry<EntryLike>, object>;

/**
 * Policy: Defines which specific properties within the props object are considered valid.
 *
 * Unlike the root-level filtering (which handles `undefined` or unions), this
 * type operates on the internal keys. By applying `OmitIndexSignature`, an
 * **"Explicit Keys Only"** policy is enforced.
 *
 * Why this matters:
 * 1. If a component’s props contain an index signature like `[key: string]: unknown`,
 *    `keyof Props` effectively becomes `string`.
 * 2. Consequently, TypeScript cannot catch typos in `component.props` because
 *    *any string key* is considered valid.
 * 3. Removing the index signature restores strict key checking against only the
 *    explicitly named properties.
 *
 * Example:
 * ```ts
 * type PropsWithIndex = {
 *   [key: string]: unknown;
 *   tone: string;
 * };
 *
 * // 1. Without policy (Unsafe):
 * // Typos are NOT caught because 'tone_typo' satisfies 'string'.
 * const unsafe: PropsWithIndex = { tone_typo: "neutral", tone: "neutral" };
 *
 * // 2. With KeyPolicyInProps (Safe):
 * type Policy = KeyPolicyInProps<PropsWithIndex>;
 * // Result: { tone: string }
 *
 * // Now typos become errors in the authoring API:
 * // props: { tone_typo: "neutral" }  // ❌ Property 'tone_typo' does not exist
 * ```
 */
type KeyPolicyInProps<P> = OmitIndexSignature<P>;

/**
 * Calculates the set of keys that are valid for authoring.
 *
 * Why this exists:
 * - `component.props` is used to *emit JSX attributes* onto an MDX JSX element.
 * - Attribute names are strings, so only string keys are meaningful here.
 * - `children` is excluded because children are not authored via `props`;
 *   they are controlled structurally via `transformOptions.childrenPolicy`.
 *
 * Generic Composition:
 * 1. `KeyPolicyInProps<P>`: Applies the policy to isolate named properties.
 * 2. `StringKeys<...>`: Extracts the keys from that policy-compliant object.
 * 3. `Exclude<..., 'children'>`: Filters out the reserved React 'children' key.
 *
 * Example:
 * ```ts
 * type RawProps = { tone: string; isBold?: boolean; children?: ReactNode };
 *
 * // Result: "tone" | "isBold"
 * type AllowedKeys = TransformablePropKeys<RawProps>;
 * ```
 */
type TransformablePropKeys<P> = Exclude<
  StringKeys<KeyPolicyInProps<P>>,
  'children'
>;

/**
 * Project the authorable `component.props` shape from a component’s props type.
 *
 * -----------------------------------------------------------------------------
 * What this type represents
 * -----------------------------------------------------------------------------
 * This type is the *projection step* in the inference chain:
 * - `TransformablePropKeys<Props>` defines the authorable key set (policy is documented there).
 * - `TransformPropsFor<Props>` applies that key set to `Props` to produce the exact object
 *   shape accepted under `component.props`.
 *
 * In other words:
 * - Key filtering happens in `TransformablePropKeys`.
 * - This type only “selects those properties” while preserving their original declarations.
 *
 * The result is the object shape the author can write in `component.props`.
 *
 * -----------------------------------------------------------------------------
 * Why `Pick` is important: projection vs. reconstruction
 * -----------------------------------------------------------------------------
 * There are two ways to form “a subset of props” in TypeScript:
 *
 * 1) **Projection**:
 *    - Take a view onto an existing type, keeping its property declarations “as-is”.
 *    - This is what `Pick<Props, Keys>` expresses.
 *
 * 2) **Reconstruction**:
 *    - Build a brand-new object type by re-mapping keys and then combining pieces
 *      (commonly two mapped types + an intersection `&`).
 *    - Example pattern:
 *        `{ [K in ReqKeys]-?: P[K] } & { [K in OptKeys]?: P[K] }`
 *
 * Both approaches are *structurally* equivalent when done correctly, but they differ in practice:
 *
 * -----------------------------------------------------------------------------
 * Section A — Modifier preservation (required vs optional) “for free”
 * -----------------------------------------------------------------------------
 * `Pick` preserves property modifiers from `Props` automatically:
 * - Required props stay required.
 * - Optional props stay optional.
 *
 * With reconstruction, it is common to:
 * - compute “required keys” vs “optional keys”
 * - apply `-?` vs `?` in separate mapped types
 * - merge them back with `&`
 *
 * `Pick` avoids the need for manual strictness bookkeeping in the derived type.
 *
 * -----------------------------------------------------------------------------
 * Section B — No type re-creation (shallower compiler type graph)
 * -----------------------------------------------------------------------------
 * This is *not* about runtime memory (types are erased), it’s about the compiler/tsserver.
 *
 * Reconstruction creates multiple intermediate types, for example:
 * - required key union
 * - optional key union
 * - mapped object shapes derived from each key set
 * - an intersection type combining the partial shapes
 *
 * `Pick` produces a single, direct projection:
 * - fewer intermediate instantiations
 * - fewer synthetic “intersection” property symbols
 * - typically simpler displayed types in hovers and error messages
 *
 * -----------------------------------------------------------------------------
 * Section C — Editor ergonomics (“Jump Fix”: identity + navigation)
 * -----------------------------------------------------------------------------
 * In practice, editors can more reliably trace projected properties back to
 * their original declarations when the type is expressed as `Pick` rather than
 * a synthesized object type produced by intersections and mapped-type
 * recomposition.
 *
 * This tends to improve:
 * - Cmd/Ctrl+Click (“Go to Definition”) on authored props
 * - hover/JSDoc association coming from the original prop declarations
 *
 * Put differently:
 * `Pick` more often preserves the association between the derived property and
 * the original prop declaration than a generated anonymous type.
 *
 * -----------------------------------------------------------------------------
 * Summary
 * -----------------------------------------------------------------------------
 * The authorable props object is expressed as a *single projection*:
 *   `Pick<Props, TransformablePropKeys<Props>>`
 *
 * This provides:
 * - strict key selection (via `TransformablePropKeys`)
 * - correct required/optional preservation (via `Pick`)
 * - reduced type reconstruction overhead
 * - typically better IDE navigation and symbol linkage
 *
 * @typeParam Props - The props type of the target component.
 */
type TransformPropsFor<Props extends object> = Pick<
  Props,
  TransformablePropKeys<Props>
>;

/**
 * Intermediate helper:
 * Enforces a strictly empty `props` object for the “no authorable keys” case.
 *
 * Why `EmptyObject` (type-fest) instead of `Record<string, never>`:
 *
 * TypeScript rule (union property access):
 * - A property access `value.key` is only valid if **every** member of the union has a `key`
 *   property, **or** a member has an index signature that “covers” `key`.
 *
 * What this means for `props`:
 * - If the “empty props” representation includes a **string index signature**, it effectively
 *   claims *every* prop name exists (even if its value type is `never`), which can make unions
 *   appear to have properties that are not actually guaranteed at runtime.
 *
 * Comparison:
 * - `Record<string, never>` introduces a string index signature (`[key: string]: never`), which
 *   “covers” every string property on unions and can make unsafe access appear valid.
 * - `EmptyObject` has no string index signature, so unions behave strictly and property access
 *   requires narrowing when a property is not guaranteed to exist.
 *
 * Example (`Record<string, never>` can mask missing properties in unions):
 * ```ts
 * type EmptyPropsByRecord = Record<string, never>; // { [key: string]: never }
 * type PropsUnionWithRecordEmpty = EmptyPropsByRecord | { id: string };
 * declare const propsValueWithRecordEmpty: PropsUnionWithRecordEmpty;
 *
 * propsValueWithRecordEmpty.id; // ✅ allowed (typed as `string`)
 * // Explanation:
 * // EmptyPropsByRecord["id"] = never
 * // { id: string }["id"] = string
 * // never | string -> string
 * // At runtime, if the value is the empty branch, `.id` is actually `undefined`.
 * ```
 *
 * Example (`EmptyObject` preserves strict union behavior):
 * ```ts
 * type PropsUnionWithEmptyObject = EmptyObject | { id: string };
 * declare const propsValueWithEmptyObject: PropsUnionWithEmptyObject;
 *
 * propsValueWithEmptyObject.id; // ❌ error: not present on every union member
 *
 * if ('id' in propsValueWithEmptyObject) {
 *   propsValueWithEmptyObject.id; // ✅ ok after narrowing to the `{ id: string }` branch
 * }
 * ```
 */
type StrictEmptyProps = { props?: EmptyObject };

/**
 * Intermediate helper:
 * Determines whether the outer `props` field is required when authorable keys
 * exist.
 *
 * Why this exists:
 * - Some components have authorable props, but all of them are optional (so
 *   `props` can be omitted).
 * - Other components have at least one required authorable prop (so `props`
 *   must be present to surface missing-required-prop errors at the callsite).
 *
 * Generic Composition:
 * 1. `TransformPropsFor<P>` (the projection): `Pick<P, TransformablePropKeys<P>>`
 *    selects only the authorable props while preserving each prop’s required/optional modifier.
 * 2. `RequiredKeysOf<...>`: Produces a union of keys that are required in that projected object.
 * 3. Field requirement decision:
 *    - If that union is `never` (meaning “there are no required keys”) → `props` is optional.
 *    - Otherwise (the union contains one or more keys) → `props` is required.
 *
 * Note on the mechanic:
 * - `RequiredKeysOf<T>` does not “count” keys. It returns a *union* of required key names.
 * - The check `... extends never` is a set-emptiness test:
 *   - `never` = empty set of required keys
 *   - non-`never` = at least one required key exists
 *
 * Note:
 * This helper assumes authorable keys exist (it is used only after checking that
 * `TransformablePropKeys<P>` is non-empty).
 */
type PropsWithKeys<P extends object> =
  RequiredKeysOf<TransformPropsFor<P>> extends never
    ? { props?: TransformPropsFor<P> }
    : { props: TransformPropsFor<P> };

/**
 * Alternative equivalent formulation (not used in the current pipeline).
 * Kept as a readability/reference variant that expresses the same branch logic
 * via `HasRequiredKeys` + `If`. The pipeline currently uses `PropsWithKeys`.
 *
 * Uses boolean helpers from `type-fest` to keep the intent explicit.
 *
 * Generic Composition:
 * 1) `TransformPropsFor<P>`: project the authorable props object.
 * 2) `HasRequiredKeys<...>` (predicate): produce `true | false` depending on whether the projected
 *    object contains at least one required property.
 * 3) `If<...>` (branching combinator): select the wrapper shape based on that boolean:
 *    - `true`  -> `{ props:  ... }`
 *    - `false` -> `{ props?: ... }`
 */
export type PropsWithKeysUnused<P extends object> = If<
  HasRequiredKeys<TransformPropsFor<P>>,
  { props: TransformPropsFor<P> },
  { props?: TransformPropsFor<P> }
>;

/**
 * Select the correct `props`-field shape for a single props object type `P`.
 *
 * Mechanics (Decision Tree):
 * 1) **Has Authorable Keys:**
 *    - `TransformablePropKeys<P>` computes the union of keys allowed in `component.props`
 *      (explicit keys only, string keys only, excluding `children`).
 *    - If that key union is non-empty (i.e. not `never`), authoring `props` is meaningful, so
 *      the decision is delegated to `PropsWithKeys<P>`.
 *    - `PropsWithKeys<P>` then decides whether the *field* `props` is required by checking
 *      whether the projected authorable props object has any required keys.
 *
 *    Example:
 *    ```ts
 *    type WithKeys = { id: string; tone?: string; children?: unknown };
 *    // TransformablePropKeys<WithKeys> -> "id" | "tone"
 *    // ResolvePropsField<WithKeys> -> { props: { id: string; tone?: string } }
 *    ```
 *
 * 2) **No Authorable Keys (Strict Empty):**
 *    - If `TransformablePropKeys<P>` is `never`, there is nothing to author via `component.props`.
 *    - `StrictEmptyProps` is returned to allow only `{}` (or omission).
 *
 *    Example:
 *    ```ts
 *    type NoKeys = { children?: unknown };
 *    // TransformablePropKeys<NoKeys> -> never
 *    // ResolvePropsField<NoKeys> -> { props?: EmptyObject }
 *    ```
 *
 * Generic Composition:
 * 1. `TransformablePropKeys<P>`: compute the authorable key set.
 * 2. Branch:
 *    - `never`    -> `StrictEmptyProps`
 *    - otherwise -> `PropsWithKeys<P>`
 */
type ResolvePropsField<P extends object> =
  TransformablePropKeys<P> extends never ? StrictEmptyProps : PropsWithKeys<P>;

/**
 * Alternative equivalent formulation (not used in the current pipeline).
 * Kept as a readability/reference variant that expresses the same branch logic
 * via `HasRequiredKeys` + `If`. The pipeline currently uses `ResolvePropsField`.
 *
 * Uses boolean helpers from `type-fest` to keep the branching logic explicit.
 *
 * Generic Composition:
 * 1) `TransformablePropKeys<P>`: compute the union of keys allowed in `component.props`.
 * 2) `IsNever<...>` (predicate): check whether that key-union is empty.
 *    - `TransformablePropKeys<P>` returns a *union of string literal keys* (e.g. `"id" | "tone"`).
 *    - When there are no keys to author, that union collapses to `never`.
 *    - `IsNever<T>` converts the “empty union” signal into a boolean-like `true | false`.
 *      - `true`  -> no authorable keys (the union is `never`)
 *      - `false` -> at least one authorable key exists (the union is not `never`)
 * 3) `If<...>` (branching combinator): select the `props`-field wrapper shape:
 *    - `true`  -> `StrictEmptyProps` (no authorable keys; allow only `{}` or omission)
 *    - `false` -> `PropsWithKeys<P>` (keys exist; decide whether `props` is required)
 */
export type ResolvePropsFieldUnused<P extends object> = If<
  IsNever<TransformablePropKeys<P>>,
  StrictEmptyProps,
  PropsWithKeys<P>
>;

/**
 * Apply the `props`-field policy across a props type `P`.
 *
 * “`props`-field” level (what this operates on):
 * - This does **not** decide individual prop keys; that is handled by `TransformablePropKeys<P>`
 *   and `TransformPropsFor<P>`.
 * - This operates one level higher: it decides the *wrapper shape* used in rename targets:
 *   `component: { name: ..., props:  ... }` vs `component: { name: ..., props?: ... }`,
 *   or the strict-empty case `props?: EmptyObject`.
 *
 * Non-union vs union behavior:
 * - If `P` is a single object type (non-union), no special distribution is needed:
 *   this evaluates once as `ResolvePropsField<P>`.
 * - If `P` is a union of variants (`A | B | ...`), distribution is required so each variant
 *   is evaluated independently and the results are re-unioned:
 *   `ResolvePropsField<A> | ResolvePropsField<B> | ...`.
 *
 * Why distribution matters for unions:
 * - Different variants can require different `props`-field wrapper shapes (required vs optional, empty).
 * - This interacts with a core union rule: a value only has to satisfy **one** union member.
 *   So if the resulting union includes any branch where `props` is optional, an object with
 *   no `props` can match that branch. The “absence of `props`” effectively becomes a valid
 *   option whenever at least one variant does not require it.
 * - The policy must be evaluated per variant and then re-unioned to preserve those
 *   branch-specific constraints.
 *
 * Example:
 * ```ts
 * type VariantProps =
 *   | { id: string; tone?: string }   // has a required key -> wrapper requires `props`
 *   | { status?: "ok" };             // all optional     -> wrapper allows `props?`
 *
 * type Result = PropsField<VariantProps>;
 * // Result:
 * //   | { props:  { id: string; tone?: string } }
 * //   | { props?: { status?: "ok" } }
 * ```
 *
 * Generic Composition:
 * 1) `ResolvePropsField<P>`: apply the per-shape `props`-field policy to a single object type.
 * 2) Distribute over unions:
 *    - If `P = A | B`, the output becomes `ResolvePropsField<A> | ResolvePropsField<B>`.
 *
 * Distributive conditional (TypeScript pattern):
 * 1) Trigger:
 *    - `P` appears “naked” on the left side of `extends` (`P extends ... ? ... : ...`).
 *    - When `P` is a union, TypeScript evaluates the conditional once per union member.
 *
 * 2) Effect:
 *    - For `P = A | B`, the expression
 *      `P extends unknown ? ResolvePropsField<P> : never`
 *      becomes:
 *      `ResolvePropsField<A> | ResolvePropsField<B>`.
 *
 * 3) Why `unknown`:
 *    - `unknown` is used only to make the condition trivially true for all object types, so the
 *      conditional serves purely as a distribution mechanism.
 *    - It does not narrow, filter, or otherwise change `P`.
 */
export type PropsField<P extends object> = P extends unknown
  ? ResolvePropsField<P>
  : never;
