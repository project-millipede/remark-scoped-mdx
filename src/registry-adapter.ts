import { MdxTransformRule, ScopedMdxTransformRegistry } from './types';

/**
 * Defines the structural interface required to read MDX transform rules from a registry.
 *
 * 1. Bridge Role:
 *    Connects the rich application registry to the MDX transformation pipeline
 *    by defining the minimal input contract.
 * 2. Usage Context: Serves as the source type for:
 *    - `deriveMdxTransformRegistry`:
 *      Generates configuration for the scoped Remark plugin.
 *    - `expandHydratedComponentNames`:
 *      Identifies components introduced by transform rules to ensure runtime
 *      availability.
 * 3. Compatibility:
 *    Uses structural typing to accept complex registry objects while
 *    selectively accessing only the `mdxTransform` metadata.
 */
export type TransformAwareRegistry = Record<
  string,
  { mdxTransform?: MdxTransformRule }
>;

/**
 * Derives a scoped MDX transform registry from a component registry.
 *
 * Context:
 * - The scoped remark plugin is configured with a minimal registry:
 *   `scopeComponentName → transform rule`.
 *
 * Terminology:
 * - "Scope component name" / "scope selector":
 *   The JSX tag name that defines the boundary in the MDX AST where rewrites
 *   are allowed. Rewrites (e.g. renaming `<br />`) are applied only within the
 *   subtree rooted at that scope node.
 *
 * Inclusion rule:
 * - Only component definitions that explicitly declare `mdxTransform` are included.
 * - Definitions without `mdxTransform` are ignored.
 *
 * Where the rules come from:
 * - The stored `mdxTransform` rule is typically produced by a typed builder API
 *   (`transform → flow → to`) that enforces:
 *   - target component names are valid registry keys, and
 *   - authored props match the target component’s prop type.
 *
 * Integration points:
 * - Build-time:
 *   The derived registry is passed to the scoped remark plugin as configuration.
 * - Runtime:
 *   The same stored rules can be consulted to expand the set of components that
 *   must be available to the renderer (see `expandHydratedComponentNames`).
 *
 * @param componentDefinitions - Component registry keyed by component name.
 * @returns A scoped transform registry keyed by scope component name.
 */
export function deriveMdxTransformRegistry(
  componentDefinitions: TransformAwareRegistry
): ScopedMdxTransformRegistry {
  const registry: ScopedMdxTransformRegistry = {};

  const componentEntries = Object.entries(componentDefinitions);

  // Iterate over component definitions keyed by component name.
  for (const [componentName, componentDefinition] of componentEntries) {
    const rule = componentDefinition.mdxTransform;
    if (rule) {
      registry[componentName] = rule;
    }
  }

  return registry;
}

/**
 * Adds component identifiers referenced by a `renameFlow` rule to an
 * accumulator.
 *
 * Purpose:
 * - Scoped remark transforms can introduce JSX identifiers that do not exist in the
 *   original MDX source (because tags are rewritten during the remark stage).
 * - This helper extracts the **target component names** from a `renameFlow` map and
 *   adds them to `expanded`, ensuring the runtime component map includes them.
 *
 * Behavior:
 * - No-op when `renameFlow` is `undefined`.
 *
 * @param expanded - Accumulator of component identifiers required at runtime.
 * @param renameFlow - Optional mapping of source flow tag name → rename target.
 */
function addRenameFlowTargets(
  expanded: Set<string>,
  renameFlow: MdxTransformRule['renameFlow']
): void {
  if (!renameFlow) return;

  const renameTargets = Object.values(renameFlow);

  for (const target of renameTargets) {
    expanded.add(target.component.name);
  }
}

/**
 * Expands a set of hydrated component identifiers to include JSX identifiers
 * introduced by scoped MDX transforms.
 *
 * Why this exists:
 * - A set of “hydrated” component names is commonly computed from the original
 *   MDX source (before remark transforms run) and used to build a runtime
 *   component map.
 * - Scoped transforms (`renameFlow`) can rewrite JSX tags and thereby introduce
 *   component identifiers that were not present in the original set.
 * - If the runtime component map is built only from the originally discovered
 *   names, the renderer may encounter an introduced identifier that is missing
 *   from the map.
 *
 * Example (generic):
 * - Original MDX:
 *
 *     <Scope>
 *       <br />
 *       <p>Text</p>
 *     </Scope>
 *
 * - A scoped rule may rewrite flow tags within `<Scope>`:
 *   - `br` → `CustomBlankLine`
 *   - `p`  → `CustomParagraph`
 *
 * - After the transform, the effective JSX is:
 *
 *     <Scope>
 *       <CustomBlankLine />
 *       <CustomParagraph>Text</CustomParagraph>
 *     </Scope>
 *
 * - Original discovery (pre-transform) sees: `Scope`, `br`, `p`
 * - Runtime rendering also requires: `CustomBlankLine`, `CustomParagraph`
 *
 * This helper adds any **target component names** referenced by `renameFlow` to
 * the returned set.
 *
 * Where the rules come from:
 * - The stored `mdxTransform` rule is typically produced by a typed builder API
 *   (`transform → flow → to`) that enforces:
 *   - target component names are valid registry keys, and
 *   - authored props match the target component’s prop type.
 *
 * @param componentNames - The component identifiers selected for hydration (typically derived
 *                         from the original MDX, prior to scoped rewrites).
 * @param componentDefinitions - Full loadable component registry keyed by component name.
 * @returns A new set containing the original names plus any names introduced by transforms.
 */
export function expandHydratedComponentNames(
  componentNames: ReadonlySet<string>,
  componentDefinitions: TransformAwareRegistry
): Set<string> {
  // Create a new set so the input set is never mutated.
  const expanded = new Set(componentNames);

  for (const componentName of componentNames) {
    const componentDefinition = componentDefinitions[componentName];

    /**
     * Early-continue guard:
     * - `componentNames` can include identifiers that are not present in the
     *   registry (e.g. unregistered/intrinsic JSX tags, or names from upstream
     *   discovery that you intentionally do not provide as components).
     * - Only registry entries that declare `mdxTransform` can introduce
     *   additional identifiers via `renameFlow`, so entries without a rule do
     *   not participate in expansion.
     *
     * Skipping early avoids touching `mdxTransform` / `renameFlow` when the
     * registry entry is missing or when it declares no transform rule, and
     * keeps the “no rule → no expansion” behavior explicit.
     */
    if (!componentDefinition) continue;

    const rule = componentDefinition.mdxTransform;
    if (!rule) continue;

    addRenameFlowTargets(expanded, rule.renameFlow);
  }

  return expanded;
}
