import type { PhantomRegistry } from '../mdx/entry-protocol';

import type { MdxTransformRule } from '../types';
import type { RegistryKeys } from './target-props-linking';
import {
  type TransformContextFor,
  createTransformContext
} from './orchestrator';

import { stringKeysOf } from '../mdx/type-utils';

// =============================================================================
// Part 3: The Integrator (defineComponents)
// =============================================================================

/**
 * Transform rules keyed by component name.
 *
 * This is the return type of `buildTransforms(...)`:
 * - You only specify entries for components that actually need transforms.
 * - Missing keys mean “no transform for this component” (hence `Partial`).
 *
 * Keys are constrained to the registry keys so a typo like
 * `"CustomBlankLine_Typo"` fails at compile time.
 */
type TransformRules<Registry extends PhantomRegistry> = Partial<
  Record<RegistryKeys<Registry>, MdxTransformRule>
>;

/**
 * Upgrade an entry’s `mdxTransform` metadata from optional → mandatory.
 *
 * Goal:
 * - Some registry entries carry compile-time MDX transform rules (`mdxTransform`).
 * - When a transform rule is attached for a given key, downstream code should be
 *   able to treat `mdxTransform` as definitely present (non-null / non-undefined),
 *   while preserving the original entry union.
 *
 * Why the intersection approach works:
 * - Intersections distribute over unions:
 *
 *     (A | B) & C  ===  (A & C) | (B & C)
 *
 * - Example: If the entry is a Union of Variants (e.g. `VariantA | VariantB`).
 *
 *     (VariantA | VariantB) & { mdxTransform: X }
 *     ===
 *       | (VariantA & { mdxTransform: X })
 *       | (VariantB & { mdxTransform: X })
 *
 *   This preserves the original union structure while making `mdxTransform`
 *   concrete for the targeted entries.
 *
 * Why the `Omit + re-add` pattern is avoided here:
 * - Plain `Omit<Union, K>` is NOT distributive. It can “blend” union members into
 *   a single object-ish shape, turning branch-specific required fields into
 *   `| undefined` (e.g. `loader` becomes `(() => Promise<...>) | undefined`),
 *   which then breaks assignability against the original union.
 */
type WithMdxTransform<Entry, Transform> = Entry & {
  mdxTransform: NonNullable<Transform>;
};

/**
 * Registry type returned by `defineComponents(registry, buildTransforms)`.
 *
 * What it does:
 * - Takes the original `registry` type.
 * - For every key that also exists in the `Transforms` map, it augments that entry
 *   with a concrete `mdxTransform` field whose type is `Transforms[K]`.
 * - Keys that are not present in `Transforms` are left unchanged.
 *
 * Example:
 * ```ts
 * type SampleRegistry = {
 *   CustomScope: PhantomProps<{}>;
 *   CustomBlankLine: PhantomProps<{}>;
 * };
 *
 * type TransformConfig = {
 *   CustomScope: MdxTransformRule;
 * };
 *
 * type Result = RegistryWithTransforms<SampleRegistry, TransformConfig>;
 *
 * // Result["CustomScope"] has: mdxTransform: TransformConfig["CustomScope"]
 * // Result["CustomBlankLine"] is unchanged
 * ```
 */
type RegistryWithTransforms<
  Registry extends PhantomRegistry,
  Transforms extends TransformRules<Registry>
> = {
  [K in keyof Registry]: K extends keyof Transforms
    ? // If the transform map includes a rule for this registry key `K`,
      // attach it as a concrete `mdxTransform` field on that entry type.
      WithMdxTransform<Registry[K], Transforms[K]>
    : // Otherwise, leave the entry type unchanged.
      Registry[K];
};

// --- Overloads ---

/**
 * Define a component registry (and optionally attach MDX transform metadata).
 *
 * Variants:
 * 1) `defineComponents(registry)`
 *    - No MDX transforms are attached.
 *    - Returns the original `registry` reference unchanged.
 *
 * 2) `defineComponents(registry, buildTransforms)`
 *    - Builds a partial transform map using strongly-typed MDX helpers scoped to `registry`.
 *    - Returns a shallow-cloned registry where targeted entries are augmented with `mdxTransform`.
 *
 * Notes:
 * - The input registry object is never mutated.
 * - Transform rules are compile-time metadata (remark stage) stored on entries as `mdxTransform`.
 */

/**
 * Variant 1: define components without attaching transforms.
 *
 * @param registry - Component registry keyed by component name.
 * @returns The same registry reference, unchanged.
 */
export function defineComponents<Registry extends PhantomRegistry>(
  registry: Registry
): Registry;

/**
 * Variant 2: define components and attach MDX transform rules.
 *
 * @param registry - Component registry keyed by component name.
 * @param buildTransforms - Builds a partial map of component name → transform rule.
 * @returns A new registry object with `mdxTransform` attached to targeted entries.
 */
export function defineComponents<
  Registry extends PhantomRegistry,
  Transforms extends TransformRules<Registry>
>(
  registry: Registry,
  buildTransforms: (mdx: TransformContextFor<Registry>) => Transforms
): RegistryWithTransforms<Registry, Transforms>;

/**
 * Implementation.
 *
 * What happens here:
 * 1) If no `buildTransforms` is provided, return `registry` unchanged.
 * 2) Otherwise:
 *    - Build a typed transform map via `buildTransforms(createTransformContext())`
 *    - Shallow-clone the registry
 *    - Merge `{ mdxTransform: rule }` onto entries referenced by the transform map
 *
 * @param registry - Component registry keyed by component name.
 * @param buildTransforms - Optional transform builder (controls whether transforms are attached).
 * @returns Either the original registry (no builder) or a cloned registry with transforms attached.
 */
export function defineComponents<
  Registry extends PhantomRegistry,
  Transforms extends TransformRules<Registry>
>(
  registry: Registry,
  buildTransforms?: (mdx: TransformContextFor<Registry>) => Transforms
) {
  // Fast path: no transform builder supplied → return original registry unchanged.
  if (!buildTransforms) return registry;

  // Strongly-typed transform builder scoped to this registry (for authoring MDX rewrite rules).
  const transformBuilder = createTransformContext<Registry>();

  // User-supplied transform map (partial: only components that need transforms).
  const transformMap = buildTransforms(transformBuilder);

  // Creates a new registry object so transform metadata can be attached without
  // changing the input reference.
  const registryWithTransforms = { ...registry };

  // Attach transforms only for keys present in the transform map.
  const transformKeys = stringKeysOf(transformMap);
  for (const componentKey of transformKeys) {
    const rule = transformMap[componentKey];

    // No rule for this key (e.g. omitted/undefined in a Partial map).
    if (!rule) continue;

    registryWithTransforms[componentKey] = {
      ...registryWithTransforms[componentKey],
      // Attach transform metadata for this component (consumed by the MDX
      // transform pipeline).
      mdxTransform: rule
    };
  }

  return registryWithTransforms;
}
