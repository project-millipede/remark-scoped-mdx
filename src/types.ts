/**
 * Compile-time MDX transform metadata.
 *
 * These types describe scoped rewrites in the MDX AST (remark stage).
 *
 * Prop values are attached to MDX JSX attributes:
 * - For `true`, we **skip** the expression route and emit boolean attribute presence
 *   (`value: null` → `<X enabled />`).
 *
 *   Why this special-case matters:
 *   - In the MDX JSX AST, boolean attribute *presence* is encoded as `value: null`.
 *     That is how `<X enabled />` is represented.
 *   - Emitting the presence form keeps output idiomatic and avoids generating
 *     unnecessary `{true}` expressions for common boolean flags.
 *
 * - For everything else, we emit an attribute value expression
 *   (`mdxJsxAttributeValueExpression`) backed by `data.estree`.
 *
 * Important:
 * - `MdxPropValue` is intentionally `unknown` to keep the transformer “dumb” and avoid
 *   duplicating a “serializable value” spec in types.
 * - The transform step will *attempt* to convert values to ESTree when building
 *   attribute value expressions. Unsupported values will throw during the transform.
 */
export type MdxPropValue = unknown;

/**
 * MDX AST rewrite options (transformer directives).
 *
 * These settings do not represent React props. They control how the transformer
 * rewrites the MDX AST node (e.g. whether children are preserved or cleared).
 */
export type MdxRewriteOptions = {
  /**
   * Controls whether the replacement is treated as a marker-style (void)
   * element at the MDX JSX flow level (i.e. whether children are cleared).
   *
   * - `"clear"`: children are cleared and the node becomes “self-closing” in intent.
   *             This is appropriate for replacements of void-like flow nodes
   *             (e.g. `<br /> → <MessageBlankLine />`).
   *
   * - `"preserve"` / `undefined`: children are preserved.
   *             This is required for container replacements
   *             (e.g. `<p>...</p> → <MessageParagraph>...</MessageParagraph>`).
   */
  childrenPolicy?: 'preserve' | 'clear';
};

/**
 * Rename target:
 * Always an explicit object so call sites can uniformly attach props and
 * transform options.
 *
 * Example:
 *   renameFlow: {
 *     br: {
 *       component: { name: 'MessageBlankLine', props: { variant: 'timeline', enabled: true } },
 *       transformOptions: { childrenPolicy: 'clear' }
 *     }
 *   }
 */
export type MdxRenameTarget = {
  component: {
    /**
     * Target JSX tag / component identifier to rename to.
     *
     * Note:
     * - This is a plain `string` in the transformer types.
     * - The authoring side (registry-scoped transform builder) further narrows this to
     *   known registry keys so typos are caught at compile time.
     */
    name: string;
    /**
     * JSX props emitted onto the renamed tag.
     *
     * Emission behavior:
     * - `true` is emitted as boolean attribute presence (`enabled`), i.e. `value: null`
     *   → `<X enabled />` (we skip the expression route for this case).
     * - Other values are emitted as attribute value expressions backed by `data.estree`.
     *
     * Example:
     *   props: { variant: "timeline", enabled: true }
     * becomes:
     *   <X variant={"timeline"} enabled />
     */
    props?: Record<string, MdxPropValue>;
  };
  /**
   * Transformer directives that control how the MDX AST node is rewritten.
   * (Not React props.)
   */
  transformOptions?: MdxRewriteOptions;
};

export type MdxTransformRule = {
  /**
   * Rename JSX *flow* elements inside the scope subtree.
   * Example:
   *   renameFlow: {
   *     br: {
   *       component: { name: 'BlankLine', props: { variant: 'timeline' } },
   *       transformOptions: { childrenPolicy: 'clear' }
   *     }
   *   }
   */
  renameFlow?: Record<string, MdxRenameTarget>;
};

/**
 * Map of scope component name -> transform rule.
 */
export type ScopedMdxTransformRegistry = Record<string, MdxTransformRule>;
