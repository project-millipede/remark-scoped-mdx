import type { ValueOf } from 'type-fest';

import type { PhantomRegistry } from '../mdx/entry-protocol';
import type { StringKeys } from '../mdx/type-utils';
import type { MdxRenameTarget } from '../types';
import { PropsField, RawPropsOf } from './transform-props';

/**
 * Registry key type (string-only).
 *
 * Why this exists:
 * - `StringKeys<T>` narrows `keyof T` down to *only string keys* (see
 *   `StringKeys` docs).
 * - Using string-only keys keeps registry indexing and key iteration type-safe.
 */
export type RegistryKeys<Registry> = StringKeys<Registry>;

/**
 * Build a registry-scoped rename target for a single component name.
 *
 * High-level:
 * - Start from the canonical transformer config shape (`MdxRenameTarget`).
 * - Replace its `component` field with a registry-aware version for one specific registry key (`Name`),
 *   so authoring sites get literal `component.name` + correctly inferred `component.props`.
 *
 * Key behaviors:
 *
 * 1) Strict `component.props` keys (no index-signature escape hatch):
 * - `TransformablePropKeys` logic removes index signatures before `Pick`ing.
 * - This prevents `keyof props` from degrading to `string`, so typos in authored prop keys are caught.
 *
 * 2) Registry-aware `component` (name + props are linked):
 * - `component.name` comes directly from the type parameter `Name` (a registry key literal).
 * - `component.props` is inferred from `Registry[Name]` and shaped by `PropsField<...>` so required
 *   props stay required and optional props stay optional.
 *
 * Implementation (“omit + re-add”):
 * - Step 1: omit the canonical `component` field.
 * - Step 2: intersect (`&`) the remainder with a stricter registry-aware `component` field.
 */
type RenameTargetsByName<
  Registry extends PhantomRegistry,
  Name extends RegistryKeys<Registry>
> =
  // Step 1: remove the canonical `component` field.
  Omit<MdxRenameTarget, 'component'> &
    // Step 2: attach the registry-aware `component` field.
    {
      component: { name: Name } & PropsField<RawPropsOf<Registry[Name]>>;
    };

/**
 * Produce a union of “rename target” types for a union of registry component names,
 * while preserving the per-name pairing of:
 *   - `component.name` (a specific literal), and
 *   - `component.props` (the props type inferred for that specific name).
 *
 * Goal (why this exists):
 * - In `rule.flow(target => ({ br: target.to(...) }))`, each `target.to(...)`
 *   result must be one of the registry-valid rename targets.
 * - When `Name` is a union of component names, it is important that the type becomes
 *   a UNION OF OBJECTS (one per name), rather than a single object with union-typed
 *   fields, so that `name` and `props` remain linked.
 *
 * Mechanism (“map → values”):
 * - Input: a union of names, e.g. `Name = "CustomBlankLine" | "CustomParagraph"`.
 * - Step 1 (map): build a mapping from each name to its specific target type using a
 *   mapped type indexed by the union (`[N in Name]`).
 * - Step 2 (values): collapse that mapping to a union of its values.
 *   - `ValueOf<...>` is used in **Step 2** (it performs the “union of values” collapse).
 *
 * Note on the chosen “union splitting” technique:
 * - This type uses the mapped-type indexing variant (`[N in Name] ...`) rather than
 *   the distributive-conditional pattern (`Name extends unknown ? ... : never`).
 * - Both approaches split a union into per-member cases; the mapped-type form is used
 *   here because it keeps the “map → values” transformation explicit.
 *
 * Sophisticated example (conceptual):
 *
 *   // Registry using PhantomProps (pure protocol, no app dependencies)
 *   type SampleRegistry = {
 *     CustomBlankLine: PhantomProps<{ height: number }>;
 *     CustomParagraph: PhantomProps<{ tone: string; isBold?: boolean }>;
 *   };
 *
 *   type TargetNames = "CustomBlankLine" | "CustomParagraph";
 *
 *   // Input:
 *   //   Name = TargetNames
 *
 *   // Step 1 (mapped object):
 *   type MappingObject = {
 *     CustomBlankLine: RenameTargetsByName<SampleRegistry, "CustomBlankLine">;
 *     CustomParagraph: RenameTargetsByName<SampleRegistry, "CustomParagraph">;
 *   };
 *
 *   // Step 2 (union of values) — this is where ValueOf is applied:
 *   type TargetUnion = ValueOf<MappingObject>;
 *
 *   // Output (union of correctly linked targets):
 *   //   | { component: { name: "CustomBlankLine";  props: { height: number } } ... }
 *   //   | { component: { name: "CustomParagraph";  props: { tone: string; isBold?: boolean } } ... }
 *
 *   // Practical effect: choosing a name selects the matching props type.
 *   // - name: "CustomBlankLine"  => props must include { height: number }
 *   // - name: "CustomParagraph"  => props must include { tone: string } and may include isBold
 */
type DistributeRenameTargetsByName<
  Registry extends PhantomRegistry,
  Name extends RegistryKeys<Registry>
> =
  // Step 1 (“map”): build a per-name mapping.
  ValueOf<{
    // Step 2 (“values”): collapse the mapping to a union of its values.
    [N in Name]: RenameTargetsByName<Registry, N>;
  }>;

/**
 * Public alias: rename target for a *specific* registry component name (or a union of names).
 *
 * What it represents:
 * - A strongly-typed version of `MdxRenameTarget` where `component` is registry-aware.
 * - The `Name` type parameter drives the literal `component.name` and the inferred `component.props`.
 *
 * Union behavior (why `Name` exists at all):
 * - If `Name` is a single literal (e.g. `"CustomBlankLine"`), this is the one precise target type:
 *
 *     type TargetType = RegistryRenameTarget<SampleRegistry, "CustomBlankLine">;
 *     // -> {
 *     //      component: { name: "CustomBlankLine"; props: { height: number } };
 *     //      transformOptions?: ...
 *     //    }
 *
 * - If `Name` is a union (e.g. `"CustomBlankLine" | "CustomParagraph"`), this becomes a union of
 *   per-name target objects (not a single object with union-typed fields), so `name` and `props`
 *   stay correlated:
 *
 *     type TargetUnion = RegistryRenameTarget<SampleRegistry, "CustomBlankLine" | "CustomParagraph">;
 *     // -> | { component: { name: "CustomBlankLine";  props: { height: number } } ... }
 *     //    | { component: { name: "CustomParagraph";  props: { tone: string; isBold?: boolean } } ... }
 *
 * Practical authoring-site effect:
 * - `name: "CustomBlankLine"` forces `props` to match CustomBlankLine props.
 * - `name: "CustomParagraph"` forces `props` to match CustomParagraph props.
 */
export type RegistryRenameTarget<
  Registry extends PhantomRegistry,
  Name extends RegistryKeys<Registry>
> = DistributeRenameTargetsByName<Registry, Name>;

/**
 * Convenience alias: rename target for *any* registry component.
 *
 * What it represents:
 * - The “all targets” union for a registry: it is exactly the specialization
 *   `RegistryRenameTarget<Registry, RegistryKeys<Registry>>`.
 *
 * Example:
 *
 *   type AllTargets = AllLinkedRenameTargets<SampleRegistry>;
 *   // -> | { component: { name: "CustomBlankLine";  props: { height: number } } ... }
 *   //    | { component: { name: "CustomParagraph";  props: { tone: string; isBold?: boolean } } ... }
 *   //    | { component: { name: "CustomScope"; ... } ... }
 *   //    | ...
 *
 * Typical usage:
 * - As the target type inside `renameFlow` maps, where each entry (`br`, `p`, …) can target
 *   any registry component, but props must match the chosen `component.name`.
 */
export type AllLinkedRenameTargets<Registry extends PhantomRegistry> =
  RegistryRenameTarget<Registry, RegistryKeys<Registry>>;
