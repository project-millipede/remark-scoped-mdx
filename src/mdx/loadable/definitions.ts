import type {
  DefaultRuntimeConfig,
  DynamicVariant,
  RuntimeEntryFor,
  StaticVariant,
  TransformMetadata
} from './contracts';
import type { PhantomProps } from '../entry-protocol';

// =============================================================================
// Entry Assembly Overview
// =============================================================================

/**
 * ---------------------------------------------------------------------------
 * Architecture Overview
 * ---------------------------------------------------------------------------
 *
 * Registry entries are modeled via a progressive compositional hierarchy:
 *
 * 1) Layer 1: Load Strategy (The "Loadability" Contract)
 *    - Defined by `LoadStrategy<Props>`.
 *    - Determines strictly *how* the component code is resolved (Static vs Dynamic).
 *
 * 2) Layer 2: Runtime Execution (Load Strategy + Config)
 *    - Defined by `RuntimeEntryFor<Props, Config>`.
 *    - Merges the load strategy with application-specific runtime flags (`Config`).
 *
 * 3) Layer 3: Inference Registration (Runtime + Phantom)
 *    - Defined by `RegisteredEntryFor<Props, Config>`.
 *    - Stamps the runtime object with `PhantomProps` to enable type inference.
 *
 * 4) Layer 4: The Final Definition (Registered + Metadata)
 *    - Defined by `RegistryEntry<Props, Config>`.
 *    - The public alias that injects build-time `TransformMetadata` into the stack.
 */

// =============================================================================
// Entry Types: Layers 3-4
// =============================================================================

/**
 * Inference Registration (Layer 3).
 * Augments the Runtime Entry with the Phantom Props stamp.
 *
 * What it represents:
 * - A runtime entry that has been formally "Registered" into the Phantom Protocol.
 * - Adds the **Inference Registration** layer (`PhantomProps<Props>`) to the
 *   base runtime shape.
 *
 * Registration Mechanism:
 * - The runtime object is intersected with `PhantomProps<Props>`.
 * - This adds an OPTIONAL unique-symbol "slot" (`[PROPS_IDENTITY_ANCHOR]?: Props`)
 *   carrying the `Props` type.
 * - This slot has no runtime impact, but enables the TypeScript compiler to
 *   retrieve the generic type later.
 *
 * Purpose:
 * - Drives the MDX authoring inference pipeline:
 *     `PropsOfEntry` -> `RawPropsOf` -> `PropsField`.
 * - These utilities extract `Props` directly from the Phantom slot.
 * - Without this stamp, generic prop types are erased/inaccessible, causing the
 *   authoring API to lose strict `component.props` checking (collapsing to `object`).
 */
type RegisteredEntryFor<
  Props extends object,
  Config extends object = DefaultRuntimeConfig
> = RuntimeEntryFor<Props, Config> & PhantomProps<Props>;

/**
 * The complete, unified definition of a component within the registry.
 *
 * Purpose:
 * - Serves as the single source of truth for an entry, bridging the gap between
 *   runtime execution (rendering/loading) and build-time analysis (MDX transforms).
 *
 * Composition (Layered by Type Hierarchy):
 * - It aggregates four distinct structural layers into a final shape:
 *     1. Load Strategy (via `LoadStrategy`):
 *        The foundational layer determining how the component is resolved (Static vs Dynamic).
 *     2. Runtime Behavior (via `RuntimeEntryFor`):
 *        Application-specific flags consumed by the renderer (e.g. `injectSelection`).
 *     3. Inference Registration (via `RegisteredEntryFor`):
 *        The hidden "stamp" applied by the protocol to enable type inference.
 *     4. Build-Time Metadata (TransformMetadata) [Added here]:
 *        MDX transform rules, explicitly merged into the configuration slot by this final alias.
 *
 * Note:
 * - This type acts as the "Final Form" of an entry definition.
 * - It serves as a convenience alias to avoid repeating:
 *     RegisteredEntryFor<Props, Config & TransformMetadata>
 *
 * @template Props - The React props of the component.
 * @template Config - Application-specific runtime configuration (optional).
 */
export type RegistryEntry<
  Props extends object = object,
  Config extends object = DefaultRuntimeConfig
> = RegisteredEntryFor<Props, Config & TransformMetadata>;

// =============================================================================
// Entry Factory: defineEntry (Default Config)
// =============================================================================

/**
 * Typed Helper & Identity Function ("The Checkpoint").
 *
 * Operation:
 * - Acts as a type-safe identity function that validates the entry definition
 *   without modifying the runtime object.
 *
 * Type Behavior (Critical):
 * - Validates the entry structure and strictly captures the inferred `Props`
 *   type at the point of definition.
 * - This capture is essential for enabling strict type checking of
 *   `component.props` within downstream MDX transform rules.
 *
 * Runtime Behavior (Minimal):
 * - Returns the input object exactly as provided.
 * - No wrapping, normalization, or side effects occur at this stage.
 * - The object is passed through to the runtime loader (e.g.,
 *   `getLoadableComponents`) for resolution and wrapping.
 *
 * Compile-time Guarantees:
 *
 * 1) Props Inference (Primary Goal)
 * - Captures the component’s React props into `RegistryEntry<Props>` immediately.
 * - The transform typing stack utilizes this captured type to validate
 *   `component.props` per registry key.
 * - Without this capture, the prop type implies `object` or `any`, causing
 *   the loss of key/value checking in the plugin configuration.
 *
 * 2) Variant Correctness (XOR)
 * - Enforces exactly one variant is satisfied:
 *   - `defineEntry({ component: ... })` → `StaticVariant<Props>`
 *   - `defineEntry({ loader: ... })`    → `DynamicVariant<Props>`
 * - Misconfigurations fail fast at the call site.
 *
 * Type Mechanics (The Prop Journey):
 * Example: `const Button = (p: { label: string }) => ...`
 * Call: `const ButtonEntry = defineEntry({ component: Button });`
 *
 * 1. Capture (Inference):
 *    The compiler analyzes `entry.component` and resolves the generic `Props`
 *    to `{ label: string }`.
 *
 * 2. Transport (Stamping):
 *    The function explicitly returns the object cast as `RegistryEntry<{ label: string }>`.
 *    This adds the invisible Phantom Prop slot to the resulting type definition:
 *    `{ ..., [PROPS_IDENTITY_ANCHOR]?: { label: string } }`.
 *    This type information is now permanently associated with `ButtonEntry`.
 *
 * 3. Access (Downstream):
 *    When defining transforms (e.g., in `defineComponents`), type utilities like
 *    `RawPropsOf` read this stamped slot from the registry.
 *    Consequently, writing `props: { label: true }` becomes a compile-time error
 *    because the registry entry strictly enforces that `label` must be a string.
 *
 * Configuration Context:
 * - This standard export uses `DefaultRuntimeConfig` (empty).
 * - For application-specific configuration (e.g., custom flags like `injectSelection`),
 *   use the factory `createDefineEntry` instead.
 *
 * @param entry - A registry entry configured as either a static or dynamic variant.
 * @returns The registry entry stamped with PhantomProps<Props> to enable downstream type inference.
 */
export function defineEntry<Props extends object>(
  entry: StaticVariant<Props> & DefaultRuntimeConfig & TransformMetadata
): RegistryEntry<Props, DefaultRuntimeConfig>;

export function defineEntry<Props extends object>(
  entry: DynamicVariant<Props> & DefaultRuntimeConfig & TransformMetadata
): RegistryEntry<Props, DefaultRuntimeConfig>;

/**
 * Implementation (Generic Identity).
 *
 * Mechanism:
 * - Uses a generic `<T>` to preserve the exact literal shape of the input
 *   (preventing widening to base interfaces).
 * - Returns the input `entry` directly.
 *
 * Type Compatibility:
 * - The input object strictly satisfies the `RegistryEntry` return type
 *   because the `PhantomProps` slot is declared as optional (`?`).
 * - This allows TypeScript to accept the plain runtime object as a valid
 *   `RegistryEntry` (conceptually), even though the phantom slot does not
 *   physically exist on the object in memory.
 *
 * Composition Trace (How the type is formed):
 *   1. `StaticVariant`: Provides `{ component: ... }`
 *   2. `PhantomProps`:  Provides `{ [PROPS_IDENTITY_ANCHOR]?: Props }`
 *   3. Intersection (`&`): Merges them into the final `RegistryEntry`.
 *      Since part 2 is optional, part 1 alone satisfies the intersection.
 *
 * Example:
 *   Input (Runtime): `{ component: MyComp }`
 *   Required Type:   `{ component: MyComp; [PROPS_IDENTITY_ANCHOR]?: Props }`
 *   Result:          Valid assignment. The missing optional property is allowed.
 */
export function defineEntry<T extends object>(entry: T): T {
  return entry;
}

// =============================================================================
// Entry Factory: createDefineEntry (Custom Config)
// =============================================================================

/**
 * Creates a specialized `defineEntry` helper bound to a specific runtime configuration.
 *
 * Use this to enforce application-specific flags like `injectSelection`, `requireWrapper`, etc.
 *
 * @template AppConfig - The application-specific configuration shape.
 * @returns A specialized `defineEntry` function.
 */
export function createDefineEntry<AppConfig extends object>() {
  /**
   * Overload 1: Static Strategy
   * Infers `Props` from the `component` field.
   */
  function defineEntry<Props extends object>(
    entry: StaticVariant<Props> & AppConfig & TransformMetadata
  ): RegistryEntry<Props, AppConfig>;

  /**
   * Overload 2: Dynamic Strategy
   * Infers `Props` from the `loader` Promise result.
   */
  function defineEntry<Props extends object>(
    entry: DynamicVariant<Props> & AppConfig & TransformMetadata
  ): RegistryEntry<Props, AppConfig>;

  /**
   * Implementation: Generic Identity.
   *
   * Preserves the exact input shape. Since PhantomProps are optional, the
   * input `T` is structurally compatible with the return type of the overloads.
   */
  function defineEntry<T extends object>(entry: T): T {
    return entry;
  }

  return defineEntry;
}
