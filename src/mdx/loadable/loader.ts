import type { ComponentType } from 'react';
import type { Simplify } from 'type-fest';

import type {
  DynamicVariant,
  RuntimeEntryFor,
  StaticVariant
} from './contracts';

import { type StringKeys, filterAllowedIds, stringKeysOf } from '../type-utils';

// =============================================================================
// Part 1: Structural Inference
// =============================================================================

/**
 * Extractor: Reuses `StaticVariant<Props>` contract for Props inference.
 *
 * 1. Contract reuse:
 *    Matches against the shared `StaticVariant` type rather than inline
 *    structural checks, ensuring synchronization with the runtime contract
 *    definitions.
 *
 * 2. Generic inference:
 *    Extracts `Props` via `infer` from the variant's type parameter
 *    (`StaticVariant<infer Props>`), avoiding manual field lookup.
 *
 * 3. Direct resolution:
 *    The variant binds `Props` to `component: ComponentType<Props>`, so the
 *    inference captures the exact type without object property traversal.
 */
type GetStaticComponent<Entry> =
  Entry extends StaticVariant<infer Props> ? ComponentType<Props> : never;

/**
 * Extractor: Reuses `DynamicVariant<Props>` contract for Props inference.
 *
 * 1. Contract reuse:
 *    Delegates structure recognition to the shared `DynamicVariant` type,
 *    maintaining mechanical coupling with the contract.
 *
 * 2. Generic inference:
 *    Captures `Props` directly from the variant's type parameter
 *    (`DynamicVariant<infer Props>`).
 *
 * 3. Automatic unwrapping:
 *    The contract encodes `Loaded<ComponentType<Props>>` in the loader
 *    signature, so `infer Props` resolves the component props without manual
 *    `Awaited` or `Loaded` decomposition.
 */
type GetDynamicComponent<Entry> =
  Entry extends DynamicVariant<infer Props> ? ComponentType<Props> : never;

/**
 * Resolves a registry entry to its React ComponentType.
 *
 * 1. Union distribution:
 *    Uses `Entry extends unknown` to distribute the conditional over union
 *    members, evaluating each entry variant independently.
 *    This prevents intersection of inferred types when the entry could be
 *    either static or dynamic.
 *
 * 2. Exhaustive extraction:
 *    Combines both extractors (`GetStaticComponent` | `GetDynamicComponent`) to
 *    handle both contract variants, producing a union of all possible resolved
 *    component types.
 *
 * 3. Contract-based resolution:
 *    Delegates to the contract-aware extractors rather than inline structural
 *    checks, ensuring alignment with the shared `StaticVariant` and
 *    `DynamicVariant` definitions.
 */
export type ResolvedComponentOf<Entry> = Entry extends unknown
  ? GetStaticComponent<Entry> | GetDynamicComponent<Entry>
  : never;

/**
 * Transforms a registry into a map of resolved React components.
 *
 * 1. Key iteration:
 *    Uses the mapped type syntax `[P in K]` to iterate over the key union `K`,
 *    creating a property for each registry key (similar to mapping over an
 *    array of keys).
 *
 * 2. Entry resolution:
 *    Each property `P` is assigned `ResolvedComponentOf<R[P]>`, transforming
 *    the raw registry entry into its corresponding React component type.
 *
 * 3. Subset selection:
 *    The `K extends keyof R` parameter allows selecting a specific subset of
 *    registry keys (e.g., only `'Header' | 'Footer'`), producing a partial map
 *    without requiring the full registry.
 *
 * 4. Display optimization:
 *    Wraps the result in `Simplify` to collapse complex conditional type chains
 *    into clean, readable component types in IDE tooltips.
 */
export type ResolvedMap<
  R extends Record<string, object>,
  K extends keyof R
> = Simplify<{
  [P in K]: ResolvedComponentOf<R[P]>;
}>;

// =============================================================================
// Part 2: Loader Types
// =============================================================================

/**
 * Registry Constraint (Layer 2).
 * Widest acceptable registry shape for a given Config.
 *
 * 1. Universal acceptance:
 *    Uses `RuntimeEntryFor<object, Config>` to accept any component props shape
 *    while preserving Config flags.
 * 2. Generic boundary:
 *    Constraint for loader utilities (`R extends BaseRegistry<Config>`),
 *    allowing heterogeneous registries.
 * 3. Deferred narrowing:
 *    sresolved later via
 *    `ResolvedComponentOf`.
 */
type BaseRegistry<Config extends object> = Record<
  string,
  RuntimeEntryFor<object, Config>
>;

/**
 * Resolution Strategy (Layer 2).
 * Injection point for component instantiation logic.
 *
 * 1. Generic Binding:
 *    Captures the `Props` generic from the input entry and binds it directly to
 *    the output component.
 * 2. Decoupled Loading:
 *    Separates resolution mechanism (imports, wrappers) from registry structure.
 * 3. Config Access:
 *    Captures Config type for typed access to runtime flags (`injectSelection`, etc.).
 *
 * -----------------------------------------------------------------------------
 * IMPLEMENTATION NOTE: Type Definition Choice
 * -----------------------------------------------------------------------------
 * This definition uses a direct Prop mapping (`<P>(e: Entry<P>) => Component<P>`)
 * rather than the conditional utility `ResolvedComponentOf<Entry>`.
 *
 * While `ResolvedComponentOf` is required for mapping registry objects, using it
 * here breaks assignability validation for the resolver function due to:
 *
 * 1. Deferred Conditional Types:
 *    When `Entry` is a generic type parameter, `ResolvedComponentOf<Entry>` is
 *    treated as an opaque, deferred type. TypeScript refuses to equate this
 *    opaque type with the concrete `ComponentType<P>` returned by the function.
 *
 * 2. Inference Direction:
 *    The compiler cannot perform the reverse inference required to prove that
 *    every possible expansion of `ResolvedComponentOf<E>` is satisfied by
 *    `ComponentType<P>`, even if they are structurally identical.
 *
 * 3. Strict Verification:
 *    Using the direct `<Props>` generic simplifies the contract to "Identity",
 *    allowing the implementation (`resolveEntry`) to be strictly verified
 *    without requiring type assertions (`as unknown`) to bypass the compiler.
 */
export type LoaderResolver<Config extends object> = <Props extends object>(
  entry: RuntimeEntryFor<Props, Config>
) => ComponentType<Props>;

/**
 * Prepared Registry (Runtime Set).
 *
 * A container that binds a raw registry object to its strictly typed key list.
 *
 * 1. Structural Coupling:
 *    Permanently associates the registry with its keys, ensuring downstream
 *    loaders (like `getLoadableComponentsFromSet`) operate on a valid,
 *    synchronized set.
 *
 * 2. Key Narrowing:
 *    Pre-calculates keys as `StringKeys<T>`, preventing type widening to
 *    `string[]` and strictly enforcing that only valid string identifiers
 *    are used during filtering.
 */
export type PreparedRegistry<TRegistry extends Record<string, object>> = {
  registry: TRegistry;
  keys: Array<StringKeys<TRegistry>>;
};

// =============================================================================
// Part 3: The Loader Factory
// =============================================================================

/**
 * Creates a suite of component loading utilities bound to a custom resolution strategy.
 *
 * This factory centralizes component instantiation logic through dependency injection:
 *
 * 1. Resolver injection:
 *    Accepts a function converting registry entries into React components,
 *    consolidating all loading logic (dynamic imports, static requires, wrapper
 *    application) in a single location.
 *
 * 2. Pre-configuration:
 *    Injects the resolution strategy at creation time, allowing the returned
 *    utilities to handle runtime requirements (module loading, flag checks, HOC
 *    wrapping) without consumers passing logic at every call site.
 *
 * 3. Consistent interface:
 *    All returned utilities share the bound resolver, ensuring uniform
 *    component resolution across the application regardless of whether loading
 *    is synchronous or asynchronous.
 *
 * The resolver receives entries satisfying `RuntimeEntryFor<object, Config>`,
 * providing TypeScript-aware access to custom configuration flags within the
 * resolution logic.
 *
 * Returns an object containing three bound utilities:
 * - `createComponentSet`: Prepares registries for type-safe key iteration
 * - `getLoadableComponents`: Resolves specific components by key
 * - `getLoadableComponentsFromSet`: Resolves components filtered by runtime constraints
 *
 * @template Config - Application-specific runtime configuration shape.
 * @param resolveEntry - Strategy function converting registry entries to React components.
 * @returns Loader utilities bound to the provided resolution strategy.
 */
export function createLoaderUtils<Config extends object>(
  resolveEntry: LoaderResolver<Config>
) {
  /**
   * Set Preparation:
   * Wraps a registry into a PreparedRegistry.
   *
   * Binds the registry object with its typed key list to enable type-safe operations:
   *
   * 1. Structural coupling:
   *    Permanently associates the registry with its `StringKeys<R>` at the type
   *    level, ensuring filtering/loading operations cannot use keys from a
   *    different registry instance.
   * 2. Literal preservation:
   *    Uses `stringKeysOf()` to extract keys as specific string literal types
   *    rather than widening to `string[]`, maintaining strict typing through
   *    the pipeline.
   *
   * @template R - Registry type constrained to BaseRegistry<Config>.
   * @param registry - The component registry to prepare.
   * @returns PreparedRegistry containing the registry and its extracted typed keys.
   */
  function createComponentSet<R extends BaseRegistry<Config>>(
    registry: R
  ): PreparedRegistry<R> {
    return {
      registry,
      keys: stringKeysOf(registry)
    };
  }

  /**
   * Bulk Loader:
   * Resolves specific registry keys with strict return type.
   *
   * @template R - Registry type.
   * @template K - Keys to resolve, inferred from componentIds.
   * @returns ResolvedMap<R, K> preserving specific ComponentType<Props> for each key.
   */
  function getLoadableComponents<
    R extends BaseRegistry<Config>,
    K extends StringKeys<R>
  >(components: R, componentIds: readonly K[]): ResolvedMap<R, K>;

  /**
   * Implementation:
   * Accumulates components using a concrete mutable type.
   *
   * 1. Widened accumulator:
   *    Uses `Record<string, ComponentType<object>>` to allow mutable updates
   *    without generic type gymnastics.
   * 2. Type safety:
   *    `resolveEntry()` returns `ResolvedComponentOf<Entry>` (strict component type),
   *    which is safely assignable to the widened `ComponentType<object>` for storage.
   * 3. Runtime behavior:
   *    Skips entries missing from the registry; resolves others via the
   *    provided resolver.
   *
   * @param components - Registry object.
   * @param componentIds - Runtime array of string keys (defaults to empty).
   * @returns Accumulated record of resolved components.
   */
  function getLoadableComponents(
    components: BaseRegistry<Config>,
    componentIds: readonly string[] = []
  ) {
    const resolved: Record<string, ComponentType<object>> = {};

    for (const id of componentIds) {
      const entry = components[id];
      if (!entry) continue;

      const component = resolveEntry(entry);
      resolved[id] = component;
    }

    return resolved;
  }

  /**
   * Filtered Loader:
   * Resolves components from a prepared set for specific keys.
   *
   * The `allowed` set type determines the return key set: `K` is inferred from
   * the provided set and constrained to valid registry keys.
   * This produces an exact `ResolvedMap<R, K>` where all entries are guaranteed
   * present and strictly typed.
   *
   * @template R - Registry type.
   * @template K - Subset of registry keys to resolve, inferred from `allowed`.
   * @param preparedSet - The prepared registry containing component definitions.
   * @param allowed - Set of specific registry keys to load.
   * @returns ResolvedMap containing exactly the requested components.
   */
  function getLoadableComponentsFromSet<
    R extends BaseRegistry<Config>,
    K extends StringKeys<R>
  >(
    preparedSet: PreparedRegistry<R>,

    // critical
    // allowed: ReadonlySet<K>
    allowed: ReadonlySet<string>
  ): ResolvedMap<R, K>;

  /**
   * Implementation:
   * Resolves components from the prepared set filtered by allowed keys.
   *
   * Extracts registry and keys, filters against the runtime allowed set, and
   * delegates to `getLoadableComponents` for resolution.
   *
   * @param preparedSet - Registry container with bound key list.
   * @param allowed - Runtime set of component identifiers to include.
   * @returns Resolved React components for the filtered keys.
   */
  function getLoadableComponentsFromSet(
    preparedSet: PreparedRegistry<BaseRegistry<Config>>,
    allowed: ReadonlySet<string>
  ) {
    const { registry, keys } = preparedSet;
    const included = filterAllowedIds(keys, allowed);

    return getLoadableComponents(registry, included);
  }

  return {
    createComponentSet,
    getLoadableComponents,
    getLoadableComponentsFromSet
  };
}
