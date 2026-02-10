/**
 *                                          SOURCE OF TRUTH
 *                                      (Entry Definitions)
 *                                                 │
 *                       ┌───────────────────────────────────────────────────┐
 *                       │ defineEntry(...) + defineComponents(...)          │
 *                       │ -----------------------------------------         │
 *                       │ 1. Load Strategy: StaticVariant | DynamicVariant  │
 *                       │ 2. Runtime Config: flattened config flags         │
 *                       │ 3. Phantom Protocol: PhantomProps<Props>          │
 *                       │ 4. MDX Metadata: mdxTransform                     │
 *                       └───────────────────────────────────────────────────┘
 *                                                 │
 * ┌───────────────────────────────────────────────┴───────────────────────────────────────────────┐
 *       [ LEFT GATE: TRANSFORM ADAPTER ]                  [ RIGHT GATE: LOADER UTILS ]
 *            (Build-Time Interface)                            (Runtime Interface)
 *                       │                                               │
 *         Type: TransformAwareRegistry                Type: RuntimeEntryFor<object, Config>
 *                       │                                               │
 * ┌─────────────────────────────────────────────┐   ┌─────────────────────────────────────────────┐
 * │  Visible Fields:                            │   │  Visible Fields:                            │
 * │  - mdxTransform     (KEEP)                  │   │  - loader/component (KEEP)                  │
 * │  - loader/component (IGNORE)                │   │  - Config flags     (KEEP)                  │
 * │  - Config flags     (IGNORE)                │   │  - mdxTransform     (IGNORE)                │
 * │  - PhantomProps     (IGNORE)                │   │  - PhantomProps     (IGNORE)                │
 * └─────────────────────────────────────────────┘   └─────────────────────────────────────────────┘
 *                       │                                               │
 *                 Consumed By:                                    Consumed By:
 *         deriveMdxTransformRegistry()             createLoaderUtils(...).createComponentSet()
 *                       ▼                                               ▼
 *         [ REMARK SCOPED MDX PLUGIN ]                     [ REACT / NEXT.JS RUNTIME ]
 */

/**
 * Architecture Summary (text companion to the diagram above)
 *
 * 1) Source definition layer
 * - `defineEntry(...)` defines load strategy (`component` vs `loader`), runtime
 *   config flags, and phantom props typing.
 * - `defineComponents(...)` optionally attaches `mdxTransform` metadata.
 *
 * 2) Build-time projection (transform adapter view)
 * - Input shape: `TransformAwareRegistry`.
 * - Relevant field: `mdxTransform`.
 * - Consumer: `deriveMdxTransformRegistry(...)` (remark plugin config derivation).
 *
 * 3) Runtime projection (loader view)
 * - Input shape: runtime-entry registry
 *   (`Record<string, RuntimeEntryFor<object, Config>>`).
 * - Relevant fields: `loader` / `component` + config flags.
 * - Consumer: `createLoaderUtils(...).createComponentSet()` and related loader helpers.
 *
 * 4) Intentional separation
 * - Build-time path ignores runtime loading fields.
 * - Runtime path ignores transform metadata.
 * - Phantom props are compile-time typing metadata, not runtime behavior.
 */
