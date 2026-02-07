# remark-scoped-mdx

> Build-time scoped component overrides for MDX

A **compile-time** Remark plugin for context-aware MDX rewrites. It moves
component override decisions from global runtime mappings to scoped AST
transforms, so standard tags (`p`, `br`) and custom components can be rewritten
based on nesting context.

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

## Installation

```bash
npm install remark-scoped-mdx unified react next
# or
pnpm add remark-scoped-mdx unified react next
```

## Examples

### Real-World: Props inference (Essential)

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

export const nestedDocComponents = defineComponents(
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

## How to Use

> **Important:** This plugin requires **three configuration steps**: define your component rules, register the plugin with your MDX compiler, then build the runtime component map for rendering.

### Step 1: Define Rules

Define your typed component registry first, then derive the transform registry.

```ts
import {
  defineComponents,
  defineEntry,
  deriveMdxTransformRegistry
} from 'remark-scoped-mdx';

export const nestedDocComponents = defineComponents(
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

export const mdxTransformRegistry =
  deriveMdxTransformRegistry(nestedDocComponents);
```

Minimal registration preview (full options are shown in Step 2):

```ts
import { remarkScopedMdx } from 'remark-scoped-mdx';

const mdxOptions = {
  remarkPlugins: [[remarkScopedMdx, mdxTransformRegistry]]
};
```

### Step 2: Register Plugin

Pass your rule registry to `remarkScopedMdx` in your MDX compilation
configuration.

#### Option A: Using `@mdx-js/mdx` directly

```ts
import { compile, type CompileOptions } from '@mdx-js/mdx';
import remarkGfm from 'remark-gfm';
import { remarkScopedMdx } from 'remark-scoped-mdx';
import { mdxTransformRegistry } from './nestedDocComponents';

const mdxOptions: CompileOptions = {
  remarkPlugins: [
    remarkGfm,
    [remarkScopedMdx, mdxTransformRegistry]
  ],
  providerImportSource: '@mdx-js/react'
};

const compiled = await compile(mdxSource, mdxOptions);
```

#### Option B: Using Next.js with `@next/mdx`

```ts
// next.config.mjs
import createMDX from '@next/mdx';
import { remarkScopedMdx } from 'remark-scoped-mdx';
import { mdxTransformRegistry } from './src/mdx/nestedDocComponents.js';

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx']
};

const withMDX = createMDX({
  options: {
    remarkPlugins: [[remarkScopedMdx, mdxTransformRegistry]]
  }
});

export default withMDX(nextConfig);
```

### Step 3: Build the Runtime Component Map (Simple)

For rendering, resolve the component map for the current MDX document using the
hydrated component names plus transform expansion.

Minimal runtime setup preview:

```ts
const resolveEntry = ((entry => {
  if ('loader' in entry && entry.loader) {
    return dynamic(entry.loader, { ...(entry.dynamicOptions ?? {}) });
  }
  return entry.component;
}) as LoaderResolver<{}>);

const { createComponentSet, getLoadableComponentsFromSet } =
  createLoaderUtils(resolveEntry);

const nestedComponentSet = createComponentSet(nestedDocComponents);
```

```tsx
import type { FC } from 'react';
import { MDXProvider } from '@mdx-js/react';
import type { MDXContentProps } from 'mdx/types';
import { expandHydratedComponentNames } from 'remark-scoped-mdx';

// Assumes the setup preview above already exists in this module:
// - getLoadableComponentsFromSet
// - nestedComponentSet
// - nestedDocComponents

export const withNestedComponents = (
  Component: FC<MDXContentProps>,
  hydratedComponents: Array<string>
) => {
  const hydratedSet = new Set(hydratedComponents);

  const expanded = expandHydratedComponentNames(
    hydratedSet,
    nestedDocComponents
  );

  const nestedLoadableComponents = getLoadableComponentsFromSet(
    nestedComponentSet,
    expanded
  );

  return (props: MDXContentProps) => (
    <MDXProvider components={nestedLoadableComponents} disableParentContext>
      <Component {...props} />
    </MDXProvider>
  );
};
```

## Configuration Reference

### Plugin Options

`remarkScopedMdx` takes one argument:

```ts
type ScopedMdxTransformRegistry = Record<string, MdxTransformRule>;
```

`MdxTransformRule` currently supports:

```ts
type MdxTransformRule = {
  renameFlow?: Record<
    string,
    {
      component: {
        name: string;
        props?: Record<string, unknown>;
      };
      transformOptions?: {
        childrenPolicy?: 'preserve' | 'clear';
      };
    }
  >;
};
```

Recommended practice: generate this object from your typed component registry
via `deriveMdxTransformRegistry(nestedDocComponents)` instead of hand-writing it.

## Advanced: Traversal and Limitations

### Transformation Model (Two-Phase Traversal)

1. Outer traversal discovers scope roots:
   MDX JSX **flow** elements whose `name` exists in the registry and declares
   `mdxTransform.renameFlow`.
2. Inner traversal runs within each discovered scope subtree:
   matching MDX JSX flow elements are renamed and target props are emitted.

### Scope Boundaries

Nested configured scopes are boundaries. Parent-scope rewrites do not cross into
nested scope subtrees.

### Flow vs Inline JSX

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

### Paragraph Caveat (`<p>` JSX vs Markdown paragraph)

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

## Dedicated Example: Behavior Context (Optional, Advanced)

This is a separate advanced pattern focused on runtime behavior control. It is
not required for the basic scoped rewrite flow above.

### 1. Define Runtime Flags and Demo Components

```tsx
import type { FC, ReactNode } from 'react';
import { createDefineEntry } from 'remark-scoped-mdx';

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
```

### 2. Define Behavior-Aware Entries and Transform Rules

```tsx
import { defineComponents } from 'remark-scoped-mdx';

export const behaviorDocComponents = defineComponents(
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

### 3. Create a Runtime Resolver that Reads `RuntimeConfig`

```tsx
import type { ComponentProps } from 'react';
import dynamic from 'next/dynamic';
import type {
  LoaderResolver,
  RuntimeEntryFor
} from 'remark-scoped-mdx';

function getBaseComponent(
  entry: RuntimeEntryFor<object, RuntimeConfig>
) {
  if ('loader' in entry && entry.loader) {
    const { loader, dynamicOptions } = entry;
    return dynamic(loader, { ...(dynamicOptions ?? {}) });
  }
  return entry.component;
}

const resolveEntry = ((entry => {
  const BaseComponent = getBaseComponent(entry);

  if (entry.injectSelection) {
    return (props: ComponentProps<typeof BaseComponent>) => (
      <SelectionBranch
        Base={BaseComponent}
        baseProps={props}
        requireWrapper={!!entry.requireWrapper}
      />
    );
  }

  if (entry.requireWrapper) {
    return (props: ComponentProps<typeof BaseComponent>) => {
      const Wrapper = pickWrapper(true);
      return (
        <Wrapper>
          <BaseComponent {...props} />
        </Wrapper>
      );
    };
  }

  return BaseComponent;
}) as LoaderResolver<RuntimeConfig>);
```

### 4. Bind Loader Utilities and Derive the Transform Registry

```ts
import {
  createLoaderUtils,
  deriveMdxTransformRegistry
} from 'remark-scoped-mdx';

export const {
  createComponentSet,
  getLoadableComponents,
  getLoadableComponentsFromSet
} = createLoaderUtils(resolveEntry);

export const behaviorComponentSet = createComponentSet(behaviorDocComponents);

export const behaviorTransformRegistry =
  deriveMdxTransformRegistry(behaviorDocComponents);
```

### 5. Wire Hydrated Expansion for Nested MDX Rendering

For rendering, resolve the component map for the current MDX document using the
hydrated component names plus transform expansion.

Minimal runtime setup preview:

```ts
// Assumes Step 4 already defined:
// - getLoadableComponentsFromSet
// - behaviorComponentSet
// - behaviorDocComponents
```

```tsx
import type { FC } from 'react';
import { MDXProvider } from '@mdx-js/react';
import type { MDXContentProps } from 'mdx/types';
import { expandHydratedComponentNames } from 'remark-scoped-mdx';

export const withCommonComponents = (
  Component: FC<MDXContentProps>,
  hydratedComponents: Array<string>
) => {
  const hydratedSet = new Set(hydratedComponents);

  const expandedNestedSet = expandHydratedComponentNames(
    hydratedSet,
    behaviorDocComponents
  );

  const nestedLoadableComponents = getLoadableComponentsFromSet(
    behaviorComponentSet,
    expandedNestedSet
  );

  return (props: MDXContentProps) => (
    <MDXProvider components={nestedLoadableComponents} disableParentContext>
      <Component {...props} />
    </MDXProvider>
  );
};
```

`SelectionBranch`, `pickWrapper`, `BehaviorScope`, and `BehaviorParagraph` are
application-specific helpers/components shown to demonstrate this pattern.

### Simpler Behavior-Context Variant

```tsx
import type { ComponentProps } from 'react';
import dynamic from 'next/dynamic';
import {
  createDefineEntry,
  createLoaderUtils,
  type LoaderResolver
} from 'remark-scoped-mdx';

type RuntimeConfig = {
  injectSelection?: boolean;
};

const defineEntry = createDefineEntry<RuntimeConfig>();

const resolveEntry = ((entry => {
  const Base =
    'loader' in entry && entry.loader
      ? dynamic(entry.loader, { ...(entry.dynamicOptions ?? {}) })
      : entry.component;

  if (!entry.injectSelection) return Base;

  return (props: ComponentProps<typeof Base>) => (
    <SelectionBranch Base={Base} baseProps={props} requireWrapper={false} />
  );
}) as LoaderResolver<RuntimeConfig>);

export const { createComponentSet, getLoadableComponentsFromSet } =
  createLoaderUtils(resolveEntry);
```
