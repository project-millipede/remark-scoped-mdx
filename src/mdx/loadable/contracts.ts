import type { ComponentType } from 'react';
import type { MdxTransformRule } from '../../types';
import type { DynamicOptions } from 'next/dynamic';

// =============================================================================
// Contracts: Primitives & Metadata
// =============================================================================

/**
 * Default Runtime Configuration.
 * Used as the fallback type when no application-specific configuration is provided.
 * Represents an empty object, implying no extra runtime flags are required.
 */
export type DefaultRuntimeConfig = {};

/**
 * Build-time Metadata Mixin.
 * Defines the structural slot for attaching MDX transform rules to an entry.
 * This property is consumed by build tools, not the React runtime.
 */
export type TransformMetadata = {
  mdxTransform?: MdxTransformRule;
};

/**
 * Loader Utility.
 * Normalizes the result of a dynamic import, handling both named and default exports.
 */
type Loaded<Module> = Module | { default: Module };

// =============================================================================
// Contracts: Layers 1-2
// =============================================================================

// --- Load Strategy ---

/**
 * Strategy Variant A: Static Resolution.
 * Used when the component is imported directly and bundled synchronously.
 *
 * Constraints:
 * - Requires `component`.
 * - Explicitly forbids `loader` and `dynamicOptions` (typed as `never`) to
 *   ensure strict type narrowing via discriminated unions.
 */
export type StaticVariant<Props extends object> = {
  component: ComponentType<Props>;
  loader?: never;
  dynamicOptions?: never;
};

/**
 * Strategy Variant B: Dynamic Resolution.
 * Used when the component is loaded asynchronously (e.g. via `next/dynamic` or `import()`).
 *
 * Constraints:
 * - Requires `loader`.
 * - Explicitly forbids `component` (typed as `never`) to ensure strict type
 *   narrowing via discriminated unions.
 */
export type DynamicVariant<Props extends object> = {
  loader: () => Promise<Loaded<ComponentType<Props>>>;
  dynamicOptions?: DynamicOptions;
  component?: never;
};

/**
 * Load Strategy (Layer 1).
 * The invariant "strategy" part of an entry.
 *
 * What it represents:
 * - The minimal *runtime* contract required for an entry to be loadable.
 * - Exactly one of these variants must be satisfied (XOR enforced by the fields):
 *
 *   1. StaticVariant<Props>:
 *      - has `component: ComponentType<Props>`
 *      - forbids `loader` / `dynamicOptions`
 *
 *   2. DynamicVariant<Props>:
 *      - has `loader: () => Promise<...ComponentType<Props>...>`
 *      - may have `dynamicOptions`
 *      - forbids `component`
 *
 * Separation Rationale:
 * - This type strictly determines "how the component code is obtained".
 * - Everything else (runtime behavior, inference stamps, build metadata) is layered
 *   on top without changing this core loadability requirement.
 */
type LoadStrategy<Props extends object> =
  | StaticVariant<Props>
  | DynamicVariant<Props>;

/**
 * Runtime Execution (Layer 2).
 * Combines the LoadStrategy with Application Configuration.
 *
 * What it represents:
 * - The concrete object shape available during application execution:
 *   1. Load Strategy:
 *      `component` vs `loader` (Resolution mechanics).
 *   2. Configuration:
 *      Application-specific flags (`Config`) consumed by the renderer
 *      (e.g. `injectSelection`, `requireWrapper`).
 *
 * Rationale:
 * - Optimized for runtime utilities (loaders, resolvers) that require access to
 *   configuration flags but operate independently of the type inference system
 *   or build-time metadata.
 */
export type RuntimeEntryFor<
  Props extends object,
  Config extends object = DefaultRuntimeConfig
> = LoadStrategy<Props> & Config;

/**
 * Resolver Input (Per-Entry Context).
 *
 * A public alias for the runtime entry shape, specifically exposed for authoring
 * custom `LoaderResolver` implementations.
 *
 * 1. Per-Item Resolution:
 *    Unlike the registry (which holds all entries), this type represents a
 *    **single** entry being processed. It signals that your resolver logic
 *    operates atomically on one component definition at a time.
 *
 * 2. Generic Implementation:
 *    When writing a resolver, you are writing a generic function (`<P>...`).
 *    TypeScript cannot infer generic argument types automatically, so you must
 *    explicitly annotate the `entry` argument. This alias provides the correct,
 *    public-facing type for that annotation.
 *
 * @example
 * // Consumer Implementation
 * const resolveEntry = <P extends object>(
 *   entry: LoaderResolverInput<P, MyConfig> // <--- strictly types the input
 * ): ComponentType<P> => {
 *   // ... logic
 * };
 */
export type LoaderResolverInput<
  Props extends object,
  Config extends object
> = RuntimeEntryFor<Props, Config>;
