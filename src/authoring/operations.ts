import type { PhantomRegistry } from '../mdx/entry-protocol';

import type { MdxTransformRule } from '../types';
import type {
  AllLinkedRenameTargets,
  RegistryKeys,
  RegistryRenameTarget
} from './target-props-linking';

/**
 * The "Ground Truth" Operations.
 *
 * Core Characteristics:
 * 1. Pure functions (no side effects):
 *    They are decoupled from the hierarchical configuration context.
 * 2. Compile-time validation + minimal runtime shaping:
 *   - Some operations are runtime no-ops (they only serve as typed checkpoints).
 *   - Others adapt authored data into the exact rule shape the transformer consumes.
 *
 * What this provides:
 * - `to(...)`: Typed checkpoint for a single rename target
 *              (`{ component: { name, props }, transformOptions }`).
 * - `flow(...)`: Wraps an authored rename map as `{ renameFlow: ... }`
 *                while keeping object-literal types precise.
 * - `transform(...)`: Typed checkpoint for the final `MdxTransformRule`.
 *
 * Error handling (intentional editor feedback):
 * - Component name typos are caught:
 *   `name: "CustomBlankLine_Typo"` errors because `name` must be a registry key.
 * - Missing required props are caught:
 *   Calling `to(...)` without required `component.props` errors if the target
 *   component requires props like `height: number`.
 * - Invalid prop values are caught with leaf errors:
 *   `props: { height: "5px" }` underlines `"5px"` if `height` is typed as `number`.
 *
 * @template Registry - The component registry to validate against.
 * @returns The standard set of operations typed for the given registry.
 */
export function getMdxOperations<Registry extends PhantomRegistry>() {
  // Alias 1: For the 'to' operation
  type ComponentName = RegistryKeys<Registry>;

  // Alias 2: Authored `renameFlow` map (source tag name → rename target).
  type RenameTargetsByTag = Record<string, AllLinkedRenameTargets<Registry>>;

  /**
   * Operation: Typed checkpoint.
   * Compile-time: infers `Name` from `component.name` and enforces matching
   *               `component.props` via `RegistryRenameTarget<Registry, Name>`.
   * Runtime: no-op (returns input unchanged).
   */
  function to<Name extends ComponentName>(
    target: RegistryRenameTarget<Registry, Name>
  ) {
    return target;
  }

  /**
   * Operation: Rule adapter.
   * Compile-time: type-checks the authored `renameFlow` map (keys + linked `name/props`)
   *               while keeping object-literal types precise.
   * Runtime: returns `{ renameFlow: renameTargetsByTag }` (the shape the transformer consumes).
   */
  function flow(renameTargetsByTag: RenameTargetsByTag): MdxTransformRule {
    return { renameFlow: renameTargetsByTag };
  }

  /**
   * Operation: Finalize a rule (typed checkpoint).
   * Compile-time: preserves the expected `MdxTransformRule` shape at the callsite
   *               (inference checkpoint).
   * Runtime: no-op (returns input unchanged).
   */
  function transform(rule: MdxTransformRule) {
    return rule;
  }

  return { to, flow, transform };
}
