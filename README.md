# remark-scoped-mdx

> Build-time scoped component overrides for MDX

A **compile-time** Remark plugin for context-aware MDX rewrites. It moves
component override decisions from global runtime mappings to scoped AST
transforms, so standard tags (`p`, `br`) and custom components can be rewritten
based on nesting context.

## Table of Contents

1. [Features](#features)
2. [Why Scoped Rewrites](#why-scoped-rewrites)
3. [Getting Started](#getting-started)
4. [Reference](#reference)
5. [Advanced](#advanced)

## Features

- **🧭 True Scoped Overrides:** Rewrites run only inside configured scope
  components, not globally across all MDX.
- **🧱 Nested Scope Isolation:** Rules stay inside their nearest configured
  scope, so parent behavior does not bleed into nested scopes.
- **🏷️ Tag + Component Rewrites:** Rewrite standard tags (`p`, `br`) and custom
  JSX components through `renameFlow`.
- **🛡️ Typed Authoring API:** `transform -> flow -> to` enforces valid registry
  keys and target wiring at authoring time.
- **🔒 Prop Inference from Source Components:** `component.props` is inferred from
  the original component declarations via `defineEntry`.
- **⚙️ Compiler-Ready Registry Bridge:** `deriveMdxTransformRegistry` converts
  typed component definitions into plugin-ready config.
- **🧩 Runtime Behavior Context (Optional, Advanced):** Use `createDefineEntry` and
  `createLoaderUtils` to attach and consume app-specific runtime flags (for
  example `injectSelection` / `requireWrapper`) in a typed resolver pipeline.

## Why Scoped Rewrites?

Default MDX component mapping is usually global. If you remap `p` or `br`, the
change applies everywhere. This plugin provides a compile-time escape hatch for
context-specific behavior.

### When You Need Scoped Overrides

| Aspect              | Global Mapping (Default)                | Scoped Rewrites (This Plugin)                            |
| ------------------- | --------------------------------------- | -------------------------------------------------------- |
| **Override scope**  | One mapping affects all occurrences     | Rules run only inside configured scope components        |
| **Type safety**     | Manual matching between names and props | Registry-constrained names + inferred `component.props`  |
| **Execution stage** | Runtime provider mapping                | Compile-time remark transform metadata                   |
| **Node focus**      | Renderer output level                   | MDX JSX flow nodes (`mdxJsxFlowElement`)                 |

## Getting Started

### Installation

```bash
npm install remark-scoped-mdx unified react
# or
pnpm add remark-scoped-mdx unified react
```

If you use `next/dynamic` in the runtime resolver examples, also install `next`.

### Examples

#### Real-World: Props inference (Essential)

`AlertParagraph` is declared once, and its prop type is reused automatically in
transform authoring.

```tsx
import type { FC, ReactNode } from 'react';

export type AlertParagraphProps = {
  children?: ReactNode;
  variant: 'red' | 'blue' | undefined;
};

export const AlertParagraph: FC<AlertParagraphProps> = ({ children, variant }) => {
  return (
    <p data-alert-paragraph-variant={variant}>{children}</p>
  );
};
```

```ts
import { defineComponents, defineEntry } from 'remark-scoped-mdx';

import { AlertParagraph } from './AlertParagraph';
import { ArticleScope } from './ArticleScope';

export const scopeRegistry = defineComponents(
  {
    ArticleScope: defineEntry({
      component: ArticleScope
    }),
    AlertParagraph: defineEntry({
      component: AlertParagraph
    })
  },
  ctx => ({
    ArticleScope: ctx.transform(rule =>
      rule.flow(target => ({
        p: target.to({
          component: {
            name: 'AlertParagraph',
            props: { variant: 'red' } // 🟢 PASS
          },
          transformOptions: { childrenPolicy: 'preserve' }
        })
      }))
    )
  })
);
```

```ts
// In the same transform config:
props: { variant: 'green' } // 🔴 ERROR
```

```txt
Type '"green"' is not assignable to type '"red" | "blue" | undefined'.ts(2322)
AlertParagraph.tsx(8, 3): The expected type comes from property 'variant'
which is declared here on type 'TransformPropsFor<AlertParagraphProps>'
```

Declaration principle:
- Declare component props in one place (the component itself).
- `defineEntry` captures that type.
- `target.to({ component: { name, props } })` is checked against that captured type.

### How to Use

> **Important:** This plugin requires **three configuration steps**: define your component rules, register the plugin with your MDX compiler, then build the runtime component map for rendering. Steps 1-2 handle compile-time rewrites; Step 3 enables scoped component rendering at runtime.

#### Step 1: Define Rules

Define your typed component registry first, then derive the transform registry.

```ts
import {
  defineComponents,
  defineEntry,
  deriveMdxTransformRegistry
} from 'remark-scoped-mdx';

export const scopeRegistry = defineComponents(
  {
    ArticleScope: defineEntry({ component: ArticleScope }),
    AlertParagraph: defineEntry({ component: AlertParagraph })
  },
  ctx => ({
    ArticleScope: ctx.transform(rule =>
      rule.flow(target => ({
        p: target.to({
          component: { name: 'AlertParagraph' }
        })
      }))
    )
  })
);

export const scopeTransformRegistry =
  deriveMdxTransformRegistry(scopeRegistry);
```

Minimal registration preview (full options are shown in Step 2):

```ts
import { remarkScopedMdx } from 'remark-scoped-mdx';

const mdxOptions = {
  remarkPlugins: [[remarkScopedMdx, scopeTransformRegistry]]
};
```

#### Step 2: Register Plugin

Pass your rule registry to `remarkScopedMdx` in your MDX compilation
configuration.

##### Option A: Using `@mdx-js/mdx` directly

```ts
import { compile, type CompileOptions } from '@mdx-js/mdx';
import { remarkScopedMdx } from 'remark-scoped-mdx';
import { scopeTransformRegistry } from './scopeRegistry';

const mdxOptions: CompileOptions = {
  remarkPlugins: [[remarkScopedMdx, scopeTransformRegistry]],
  providerImportSource: '@mdx-js/react'
};

const compiled = await compile(mdxSource, mdxOptions);
```

##### Option B: Using Next.js with `@next/mdx`

```ts
// next.config.mjs
import createMDX from '@next/mdx';
import { remarkScopedMdx } from 'remark-scoped-mdx';
import { scopeTransformRegistry } from './src/mdx/scopeRegistry.js';

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx']
};

const withMDX = createMDX({
  options: {
    remarkPlugins: [[remarkScopedMdx, scopeTransformRegistry]]
  }
});

export default withMDX(nextConfig);
```

#### Step 3: Build the Runtime Component Map (Simple)

##### Step 3a: Create the resolver and component set

```ts
import dynamic from 'next/dynamic';
import {
  createLoaderUtils,
  type LoaderResolverInput
} from 'remark-scoped-mdx';

const resolveEntry = <Props extends object>(
  entry: LoaderResolverInput<Props, {}>
) => {
  if ('loader' in entry && entry.loader) {
    return dynamic(entry.loader, { ...(entry.dynamicOptions ?? {}) });
  }
  return entry.component;
};

const { createComponentSet, getLoadableComponentsFromSet } =
  createLoaderUtils(resolveEntry);

const scopedComponentSet = createComponentSet(scopeRegistry);
```

##### Step 3b: Resolve hydrated components and create a renderable MDX content component

```tsx
import type { FC } from 'react';
import { MDXProvider } from '@mdx-js/react';
import type { MDXContentProps } from 'mdx/types';
import { expandHydratedComponentNames } from 'remark-scoped-mdx';

// Assumes Step 3a already exists in this module:
// - getLoadableComponentsFromSet
// - scopedComponentSet
// - scopeRegistry

export const createScopedMdxContent = (
  Component: FC<MDXContentProps>,
  hydratedComponents: Array<string>
) => {
  const hydratedSet = new Set(hydratedComponents);

  const expanded = expandHydratedComponentNames(
    hydratedSet,
    scopeRegistry
  );

  const scopedLoadableComponents = getLoadableComponentsFromSet(
    scopedComponentSet,
    expanded
  );

  return (props: MDXContentProps) => (
    <MDXProvider components={scopedLoadableComponents} disableParentContext>
      <Component {...props} />
    </MDXProvider>
  );
};
```

```tsx
// Page-level usage example
const ScopedContent = createScopedMdxContent(Content, hydratedComponents);
return <ScopedContent />;
```

## Reference

### Public API

```ts
import {
  remarkScopedMdx,
  deriveMdxTransformRegistry,
  expandHydratedComponentNames,
  defineComponents,
  defineEntry,
  createDefineEntry,
  createLoaderUtils
} from 'remark-scoped-mdx';
import type { LoaderResolverInput } from 'remark-scoped-mdx';
```

| Export | Kind | Purpose | Typical step |
| ------ | ---- | ------- | ------------ |
| `remarkScopedMdx` | remark plugin | Applies scoped `renameFlow` rewrites during MDX compile. | Step 2 |
| `defineComponents` | authoring helper | Defines the typed scope registry and transform rules. | Step 1 |
| `defineEntry` | authoring helper | Registers static/dynamic entries with inferred component props (default runtime config). | Step 1 |
| `createDefineEntry` | authoring helper factory | Creates a project-specific `defineEntry` with typed runtime flags (advanced). | Advanced Step 1 |
| `deriveMdxTransformRegistry` | registry adapter | Converts typed component definitions into plugin-ready transform config. | Step 1 |
| `createLoaderUtils` | runtime loader factory | Binds a resolver and returns runtime helpers (`createComponentSet`, `getLoadableComponents`, `getLoadableComponentsFromSet`). | Step 3a |
| `expandHydratedComponentNames` | runtime registry adapter | Adds transform-introduced component names to hydrated names before runtime map resolution. | Step 3b |
| `LoaderResolverInput` | type export | Types the resolver input entry (`component` or `loader` plus runtime config flags). | Step 3a / Advanced Step 3a |

### Authoring Utilities (Why This Helps)

- `defineEntry`: register one component/loader and capture its source props for
  downstream inference.
- `defineComponents`: define one registry plus scoped transform rules in one
  place.
- `ctx.transform(...)`: author one rule per scope component.
- `rule.flow(...)`: map source flow tags (`p`, `br`, etc.) to target rewrites.
- `target.to(...)`: set `{ component: { name, props } }` with name/props linkage
  checked at compile time.

In this example, `AlertParagraph` must be declared in the registry first.
Selecting `name: 'AlertParagraph'` in `to(...)` then activates prop inference
from `AlertParagraphProps`.

### Transform Option Reference

`childrenPolicy` is part of `renameFlow` target `transformOptions` and controls
how children are handled on the renamed MDX JSX **flow** element.

| `childrenPolicy` value | Plugin behavior | Typical use |
| ---------------------- | --------------- | ----------- |
| `'preserve'` or omitted | Keeps existing children when renaming. | Container replacements like `p -> AlertParagraph`. |
| `'clear'` | Clears children (`element.children = []`) after rename. | Marker/void-style replacements like `br -> MessageBlankLine`. |

Examples:

```mdx
// preserve (default)
<p>Hello</p>
// -> <AlertParagraph>Hello</AlertParagraph>

// clear
<br />
// -> <MessageBlankLine />
```

Notes:
- This option applies only to scoped `renameFlow` rewrites.
- It affects MDX JSX **flow** nodes only (`MdxJsxFlowElement`).
- It does not affect inline JSX text nodes or markdown `paragraph` nodes.

## Advanced

### Traversal and Limitations

#### Transformation Model (Two-Phase Traversal)

1. Outer traversal discovers scope roots:
   MDX JSX **flow** elements whose `name` exists in the registry and declares
   `mdxTransform.renameFlow`.
2. Inner traversal runs within each discovered scope subtree:
   matching MDX JSX flow elements are renamed and target props are emitted.

#### Scope Boundaries

Nested configured scopes are boundaries. Parent-scope rewrites do not cross into
nested scope subtrees.

#### Flow vs Inline JSX

- ✅ Supported: MDX JSX **flow** elements (`MdxJsxFlowElement`)
  - Standalone flow JSX:
    ```mdx
    <br />
    ```
  - Flow JSX in flow content:
    ```mdx
    <div>
      <br />
      Some text
    </div>
    ```
- ❌ Not supported: MDX JSX **text/inline** elements (`MdxJsxTextElement`)
  - Inline JSX in text:
    ```mdx
    Hello <br /> world
    ```
  - Inline JSX in paragraph phrasing content:
    ```mdx
    <p>Hello<br />world</p>
    ```

#### Paragraph Caveat (`<p>` JSX vs Markdown paragraph)

- ✅ Rewritten: explicit JSX `<p>` flow elements
  - Example (inside a scope):
    ```mdx
    <ArticleScope>
      <p>Hello</p>
    </ArticleScope>
    ```
  - The `<p>` above is an MDX JSX flow node and can be renamed by `renameFlow`.
- ❌ Not rewritten: Markdown paragraph nodes (`type: "paragraph"`)
  - Example:
    ```mdx
    <ArticleScope>
      Hello world
    </ArticleScope>
    ```
  - This becomes a markdown paragraph node, not an `MdxJsxFlowElement`.

### Dedicated Example: Behavior Context (Optional, Advanced)

This is a separate advanced pattern focused on runtime behavior control. It is
not required for the basic scoped rewrite flow above.

#### Advanced Step 1: Define Runtime Flags and Behavior-Aware Scope Registry

```tsx
import type { FC, ReactNode } from 'react';
import {
  createDefineEntry,
  defineComponents
} from 'remark-scoped-mdx';

type BehaviorScopeProps = {
  children?: ReactNode;
};

type BehaviorParagraphProps = {
  children?: ReactNode;
  tone: 'info' | 'warning';
};

const BehaviorScope: FC<BehaviorScopeProps> = ({ children }) => children;

const BehaviorParagraph: FC<BehaviorParagraphProps> = ({ children, tone }) => (
  <p data-behavior-tone={tone}>{children}</p>
);

export type RuntimeConfig = {
  requireWrapper?: boolean;
  injectSelection?: boolean;
};

export const defineEntry = createDefineEntry<RuntimeConfig>();

export const behaviorScopedComponents = defineComponents(
  {
    BehaviorScope: defineEntry({
      component: BehaviorScope,
      injectSelection: true
    }),
    BehaviorParagraph: defineEntry({
      component: BehaviorParagraph
    })
  },
  ctx => ({
    BehaviorScope: ctx.transform(rule =>
      rule.flow(target => ({
        p: target.to({
          component: {
            name: 'BehaviorParagraph',
            props: { tone: 'info' }
          },
          transformOptions: { childrenPolicy: 'preserve' }
        })
      }))
    )
  })
);
```

#### Advanced Step 2: Derive and Register the Transform Registry

```ts
import {
  deriveMdxTransformRegistry,
  remarkScopedMdx
} from 'remark-scoped-mdx';

export const behaviorScopedTransformRegistry =
  deriveMdxTransformRegistry(behaviorScopedComponents);

const mdxOptions = {
  remarkPlugins: [[remarkScopedMdx, behaviorScopedTransformRegistry]]
};
```

#### Advanced Step 3a: Create the Runtime Resolver and Component Set

```tsx
import type { ComponentType } from 'react';
import dynamic from 'next/dynamic';
import {
  createLoaderUtils,
  type LoaderResolverInput
} from 'remark-scoped-mdx';

function getBaseComponent<Props extends object>(
  entry: LoaderResolverInput<Props, RuntimeConfig>
) {
  if ('loader' in entry && entry.loader) {
    const { loader, dynamicOptions } = entry;
    return dynamic(loader, { ...(dynamicOptions ?? {}) });
  }
  return entry.component;
}

function withSelection<Props extends object>(
  BaseComponent: ComponentType<Props>,
  requireWrapper: boolean
) {
  return (props: Props) => (
    <SelectionBranch
      Base={BaseComponent}
      baseProps={props}
      requireWrapper={requireWrapper}
    />
  );
}

function withRequiredWrapper<Props extends object>(
  BaseComponent: ComponentType<Props>
) {
  return (props: Props) => {
    const Wrapper = pickWrapper(true);
    return (
      <Wrapper>
        <BaseComponent {...props} />
      </Wrapper>
    );
  };
}

const resolveEntry = <Props extends object>(
  entry: LoaderResolverInput<Props, RuntimeConfig>
) => {
  const BaseComponent = getBaseComponent(entry);

  if (entry.injectSelection) {
    return withSelection(BaseComponent, !!entry.requireWrapper);
  }

  if (entry.requireWrapper) {
    return withRequiredWrapper(BaseComponent);
  }

  return BaseComponent;
};

export const {
  createComponentSet,
  getLoadableComponents,
  getLoadableComponentsFromSet
} = createLoaderUtils(resolveEntry);

export const behaviorScopedComponentSet =
  createComponentSet(behaviorScopedComponents);
```

#### Advanced Step 3b: Resolve Hydrated Components and Return Renderable Content

```tsx
import type { FC } from 'react';
import { MDXProvider } from '@mdx-js/react';
import type { MDXContentProps } from 'mdx/types';
import { expandHydratedComponentNames } from 'remark-scoped-mdx';

// Assumes Advanced Step 3a already exists in this module:
// - getLoadableComponentsFromSet
// - behaviorScopedComponentSet
// - behaviorScopedComponents

export const createBehaviorScopedMdxContent = (
  Component: FC<MDXContentProps>,
  hydratedComponents: Array<string>
) => {
  const hydratedSet = new Set(hydratedComponents);

  const expandedBehaviorSet = expandHydratedComponentNames(
    hydratedSet,
    behaviorScopedComponents
  );

  const behaviorLoadableComponents = getLoadableComponentsFromSet(
    behaviorScopedComponentSet,
    expandedBehaviorSet
  );

  return (props: MDXContentProps) => (
    <MDXProvider components={behaviorLoadableComponents} disableParentContext>
      <Component {...props} />
    </MDXProvider>
  );
};
```

```tsx
// Page-level usage example
const ScopedContent = createBehaviorScopedMdxContent(Content, hydratedComponents);
return <ScopedContent />;
```

> Note
> `SelectionBranch`, `pickWrapper`, `BehaviorScope`, and `BehaviorParagraph`
> are placeholders in this advanced example. Replace them with the matching
> wrappers/components from your own project.
