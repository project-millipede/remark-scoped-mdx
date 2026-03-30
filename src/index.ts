export type { LoaderResolverInput } from './mdx/loadable/contracts';

export { remarkScopedMdx } from './plugin';
export {
  deriveMdxTransformRegistry,
  expandHydratedComponentNames
} from './registry-adapter';

export * from './authoring';

export { defineEntry, createDefineEntry } from './mdx/loadable/definitions';
export { createLoaderUtils } from './mdx/loadable/loader';

export type {
  LoaderResolver,
  LoaderUtils,
  PreparedRegistry,
  ResolvedMap,
  ResolvedComponentOf
} from './mdx/loadable/loader';

export type {
  PhantomProps,
  PhantomRegistry,
  PropsOfEntry,
  PropsOfEntryOr
} from './mdx/entry-protocol';
