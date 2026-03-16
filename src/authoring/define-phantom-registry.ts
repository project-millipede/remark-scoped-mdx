import type { PhantomRegistry } from '../mdx/entry-protocol';

/**
 * Creates a phantom-only registry for `defineComponents(...)` authoring.
 *
 * Purpose:
 * 1) Preserve `component.name` and `component.props` inference from a registry shape.
 * 2) Keep authoring modules free from real runtime component imports.
 * 3) Provide a minimal typed identity layer for phantom-only registries.
 *
 * @template Registry - A string-keyed phantom registry whose entries carry props
 * metadata in type space only.
 * @param registry - The phantom registry object used for transform authoring.
 * @returns The same registry object, unchanged, with its generic type preserved.
 */
export const definePhantomRegistry = <Registry extends PhantomRegistry>(
  registry: Registry
) => registry;
