import type { Plugin, Transformer } from 'unified';
import type { Parent, Node } from 'unist';
import type {
  MdxJsxFlowElement,
  MdxJsxAttribute,
  MdxJsxAttributeValueExpression
} from 'mdast-util-mdx-jsx';

import { is } from 'unist-util-is';
import { visit, SKIP } from 'unist-util-visit';
import { valueToEstree } from 'estree-util-value-to-estree';

import type {
  ScopedMdxTransformRegistry,
  MdxRenameTarget,
  MdxPropValue
} from './types';

type NamedMdxJsxFlowElement = MdxJsxFlowElement & { name: string };

/**
 * Type guard: narrows to an MDX JSX flow element with the fields we rely on.
 */
const isNamedMdxJsxFlowElement = (
  node: Node
): node is NamedMdxJsxFlowElement => {
  if (!is(node, { type: 'mdxJsxFlowElement' })) return false;

  const el = node as MdxJsxFlowElement;
  return typeof el.name === 'string';
};

/**
 * Build an `mdxJsxAttributeValueExpression` backed by `data.estree`.
 *
 * The MDX ecosystem has two “channels” for attribute value expressions:
 *
 * 1) `value` (string)
 *    - Historically used to store raw JavaScript source for the expression.
 *    - Set to the empty string here to avoid relying on string parsing/printing.
 *
 * 2) `data.estree` (ESTree Program)
 *    - Treated as the source of truth by unified/MDX tooling when present.
 *    - Encoding the expression as an ESTree Program avoids cases where compilation
 *      can degrade into `prop={}` / `JSXEmptyExpression`.
 *
 * Implementation notes:
 * - `valueToEstree(value)` returns an ESTree *Expression*.
 * - MDX tooling expects `data.estree` to be a *Program*, so the expression is wrapped
 *   in a `Program` containing an `ExpressionStatement`.
 */
function createAttributeValueExpression(
  value: MdxPropValue
): MdxJsxAttributeValueExpression {
  // (2) Serialize the runtime value into a structural ESTree Expression.
  const expression = valueToEstree(value);

  return {
    type: 'mdxJsxAttributeValueExpression',

    // (1) Intentionally empty: `data.estree` is the authoritative representation.
    value: '',

    data: {
      // (2) Unified/MDX expects a Program, so the Expression is wrapped accordingly.
      estree: {
        type: 'Program',
        sourceType: 'module',
        body: [{ type: 'ExpressionStatement', expression }]
      }
    }
  };
}

/**
 * Convert one prop entry (`name` + `value`) into an `mdxJsxAttribute` node.
 *
 * This function decides how the attribute value is represented in the MDX AST:
 *
 * 1) Boolean attribute presence (`true`)
 *    - MDX encodes “present boolean attributes” by setting `attribute.value = null`.
 *      That AST shape prints as `<X enabled />`.
 *    - This preserves presence semantics instead of emitting an explicit expression
 *      like `enabled={true}`.
 *
 * 2) Everything else (strings, numbers, objects, arrays, Map/Set, etc.)
 *    - Emitted as an `mdxJsxAttributeValueExpression` and backed by a `data.estree`
 *      Program so the MDX toolchain can compile it reliably.
 *
 * Failure mode:
 * - `createAttributeValueExpression` (via `valueToEstree`) can reject values that
 *   cannot be represented as an ESTree expression. In that case, the thrown error
 *   is wrapped to include the prop name for actionable build-time feedback.
 */
export function toMdxAttribute(
  propName: string,
  propValue: MdxPropValue
): MdxJsxAttribute {
  // Case 1: `true` is encoded as boolean attribute presence (`value: null`).
  if (propValue === true) {
    return { type: 'mdxJsxAttribute', name: propName, value: null };
  }

  try {
    // Case 2: non-`true` values are encoded as an expression (`prop={...}`),
    // backed by `data.estree` for the MDX compiler.
    return {
      type: 'mdxJsxAttribute',
      name: propName,
      value: createAttributeValueExpression(propValue)
    };
  } catch (error) {
    // Serializer failures become actionable by including the failing prop name
    // while preserving the original message (when available).
    const message =
      error instanceof Error ? error.message : 'Unknown serialization error';

    throw new Error(
      `Failed to serialize MDX prop "${propName}" into an attribute expression: ${message}`
    );
  }
}

/**
 * Builds an MDX JSX attribute list from a props object.
 *
 * Purpose:
 * - Convert a plain `{ [propName]: propValue }` map into an array of `mdxJsxAttribute` nodes.
 * - Apply the one piece of list-level policy we need here:
 *   - `undefined` means “no attribute” (the key is skipped).
 *
 * All per-value encoding rules (boolean presence vs expression-backed values, etc.)
 * are handled by `toMdxAttribute`.
 */
export function buildAttributes(
  props: Record<string, MdxPropValue | undefined> | undefined
): MdxJsxAttribute[] {
  if (!props) return [];

  const entries = Object.entries(props);

  const attributes: MdxJsxAttribute[] = [];
  for (const [propName, propValue] of entries) {
    // `undefined` means “do not emit this attribute at all”.
    if (propValue === undefined) continue;

    attributes.push(toMdxAttribute(propName, propValue));
  }

  return attributes;
}

/**
 * Applies a `renameFlow` rule to a single MDX JSX flow element in-place.
 *
 * What it does:
 * - Renames the JSX tag (e.g. `<br />` → `<MessageBlankLine />`).
 * - Replaces attributes (e.g. `variant="timeline"`).
 *
 * IMPORTANT: marker/void vs container replacements
 * - Some replacements are “marker-style” and should be treated as void at the
 *   flow JSX level (no children).
 * - Others are container replacements and must preserve children.
 *
 * Examples:
 *
 * 1) Marker-style (void) replacement:
 *    - Input:  <br />
 *    - Rule:   { component: { name: "MessageBlankLine", props: { variant: "timeline" } }, transformOptions: { childrenPolicy: "clear" } }
 *    - Result: <MessageBlankLine variant="timeline" />
 *
 * 2) Container replacement (preserve children):
 *    - Input:  <p>Hello</p>
 *    - Rule:   { component: { name: "MessageParagraph", props: { variant: "timeline" } } }
 *    - Result: <MessageParagraph variant="timeline">Hello</MessageParagraph>
 *
 * Note:
 * - This only applies to MDX JSX flow elements (`MdxJsxFlowElement`).
 * - It does not affect Markdown paragraph nodes (`type: "paragraph"`).
 */
function applyFlowRename(
  element: MdxJsxFlowElement,
  target: MdxRenameTarget
): void {
  element.name = target.component.name;
  element.attributes = buildAttributes(target.component.props);

  // Marker-style replacements are treated as void at the flow JSX level.
  // Container replacements keep children intact.
  if (target.transformOptions?.childrenPolicy === 'clear') {
    element.children = [];
  }
}

/**
 * Predicate factory: selects *scope* nodes for `unist-util-visit`.
 *
 * What it does:
 * - Produces the `test` function passed to `visit(tree, test, visitor)`.
 * - A node is considered a *scope* when:
 *   1) it is an MDX JSX **flow** element (`mdxJsxFlowElement`),
 *   2) it has a **named** tag (fragments have `name: null`),
 *   3) its tag name is present in the transform registry **and** that registry
 *      entry explicitly declares a `renameFlow` property.
 *
 * Example:
 * ```ts
 * const registry = {
 *   TimelineIngestor: {
 *     // presence of `renameFlow` activates TimelineIngestor as a "scope"
 *     renameFlow: {
 *       br: {
 *         component: { name: 'MessageBlankLine', props: { variant: 'timeline' } },
 *         transformOptions: { childrenPolicy: 'clear' }
 *       }
 *     }
 *   }
 * };
 * ```
 *
 * In an MDX AST, this causes the outer `visit(tree, test, visitor)` to call `visitor`
 * only for `<TimelineIngestor />` flow nodes. The visitor can then traverse that
 * subtree and apply the configured renames.
 *
 * Explicit configuration semantics:
 * - `renameFlow` is treated as enabled by *presence* (an own property), not by
 *   truthiness:
 *   - `{ renameFlow: { br: ... } }` → configured
 *   - `{ renameFlow: {} }`          → configured (scope boundary still applies)
 *   - `{}`                          → not configured
 *
 * Why this exists:
 * - Performance: the registry is static configuration. The set of active scope
 *   names is computed once per plugin instance, so the per-node predicate becomes
 *   a cheap set membership check.
 * - Correctness: restricting scope selection to flow elements keeps list-level /
 *   block-level rewrites in the correct part of the MDX model.
 * - Type safety: the returned function is a TS type guard, so the outer `visit`
 *   can pass a correctly narrowed node type into the visitor.
 *
 * Execution model:
 * - `visit` evaluates the `test` predicate for each candidate node.
 * - The `visitor` runs only for nodes that pass the predicate.
 *
 * @param registry - Mapping of scope component name → transform rule.
 * @returns A `visit` test predicate that matches only configured scope elements.
 */
const shouldProcessScope = (
  registry: ScopedMdxTransformRegistry
): ((node: Node) => node is NamedMdxJsxFlowElement) => {
  // Capture registry entries once (static config); avoids re-enumerating per node.
  const registryEntries = Object.entries(registry);

  // Precompute: which component names act as scopes for this compilation run?
  const activeScopeNames = new Set<string>();

  for (const [scopeComponentName, rule] of registryEntries) {
    // Presence-based enablement:
    // - true if `renameFlow` is explicitly declared on the rule object.
    // - false if the rule does not declare `renameFlow` at all.
    const isRenameFlowConfigured = Object.hasOwn(rule, 'renameFlow');

    if (isRenameFlowConfigured) {
      activeScopeNames.add(scopeComponentName);
    }
  }

  // This returned function is the `test` callback used by `visit(...)`.
  return (node: Node): node is NamedMdxJsxFlowElement => {
    // Abort #1: not an MDX JSX flow element with a string `name`.
    // - Fragments are `mdxJsxFlowElement` with `name: null` and are excluded here.
    if (!isNamedMdxJsxFlowElement(node)) return false;

    // Abort #2: named flow element, but not a configured scope component.
    // - Only these names will trigger the outer `visitor(...)`.
    return activeScopeNames.has(node.name);
  };
};

type ScopeComponentNames = ReadonlySet<string>;

/**
 * Visitor factory: applies a scope rule to descendants of a matched scope element.
 *
 * Stages:
 * 1) Resolve the scope rule (`renameFlow`) for the current scope node.
 * 2) Walk the scope subtree and consider only named MDX JSX flow elements.
 * 3) Treat nested scopes as boundaries (do not traverse into their subtrees).
 * 4) If a node name matches a configured rename key, rewrite it in-place.
 *
 * @param registry - Scope name → transform rule mapping.
 * @param scopeComponentNames - Set of all scope component names (used for boundary checks).
 * @returns A `visit`-compatible visitor callback.
 */
const createScopeVisitor =
  (
    registry: ScopedMdxTransformRegistry,
    scopeComponentNames: ScopeComponentNames
  ) =>
  (
    scopeElement: NamedMdxJsxFlowElement
    // _index: number | null,
    // _parent: Parent | null
  ): void => {
    // Step 1: Read the rule for this scope instance.
    // Note: a scope can be "active" (selected by the predicate) but still have
    // `renameFlow` undefined (e.g. future rule types); guard cheaply here.
    const scopeRule = registry[scopeElement.name];
    const renameFlow = scopeRule?.renameFlow;
    if (!renameFlow) return;

    // Step 2: Traverse *within* this scope node.
    // The inner traversal is scoped to `scopeElement`, so `_parent` is not needed.
    visit(scopeElement, isNamedMdxJsxFlowElement, element => {
      // Step 2a: Skip the scope root itself; only process descendants.
      if (element === scopeElement) return;

      // Step 3: Nested scopes are boundaries.
      // Encountering any other configured scope stops traversal into its subtree.
      if (scopeComponentNames.has(element.name)) {
        return SKIP;
      }

      // Step 4: Apply renames only for configured tag names.
      // Example: `renameFlow.br` rewrites `<br />` flow nodes.
      const renameTarget = renameFlow[element.name];
      if (!renameTarget) return;

      applyFlowRename(element, renameTarget);
    });
  };

/**
 * Registry-driven, component-scoped MDX JSX rewrites.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Transformation model: two-phase traversal (scope discovery + in-scope rewrites)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1) Outer traversal (tree-level scope discovery)
 * - `visit(tree, shouldProcessScope(registry), visitor)` walks the full tree to
 *   locate *scope roots*: MDX JSX **flow** elements whose `name` appears in the
 *   registry and declares `mdxTransform.renameFlow`.
 *
 * 2) Inner traversal (scope-local rewrites)
 * - For each scope root, a second `visit(scopeElement, ...)` walks only that
 *   scope’s subtree and applies the configured rewrites:
 *   - rename matching MDX JSX **flow** elements
 *   - replace/emit props on the renamed element
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Scope boundaries (no cross-scope traversal)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Nested configured scopes are treated as boundaries:
 * - If the inner traversal encounters another configured scope element, it returns
 *   `SKIP` so that rewrites do not cross into the nested scope subtree.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Flow vs Text (Inline) in MDX
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Summary:
 * 1) Rewrites MDX JSX **flow** elements (`MdxJsxFlowElement`) inside configured
 *    scope components.
 * 2) Does **not** rewrite MDX JSX **text/inline** elements (`MdxJsxTextElement`).
 *
 * MDX represents JSX in two distinct node kinds:
 *
 * 1) `MdxJsxFlowElement` (block / flow JSX)
 *    - Occurs where a block node is valid (top-level in a paragraph stream).
 *    - Examples:
 *
 *      // Standalone flow JSX:
 *      <br />
 *
 *      // Flow JSX among other flow content:
 *      <div>
 *        <br />
 *        Some text
 *      </div>
 *
 *    ✅ Handled by this plugin (subject to scope + registry rules).
 *
 * 2) `MdxJsxTextElement` (inline JSX)
 *    - Occurs inside phrasing content (within a paragraph / inline context).
 *    - Examples:
 *
 *      // Inline JSX within text:
 *      Hello <br /> world
 *
 *      // Inline JSX inside a paragraph tag:
 *      <p>Hello<br />world</p>
 *
 *    ❌ Not handled by this plugin (intentionally).
 *
 * Rationale for flow-only:
 * - These transforms are intended for list-level / block-level rewrites (e.g.
 *   turning standalone `<br />` blocks into a normalized blank-line component).
 * - Inline `<br />` participates in phrasing layout and should remain untouched.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Paragraphs in MDX: JSX `<p>` vs Markdown paragraph nodes
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * MDX can produce “paragraphs” from two different sources, and they show up as
 * different AST node kinds:
 *
 * 1) Explicit JSX tag in MDX (JSX flow element)
 *
 *    <TimelineIngestor>
 *      <p>Hello</p>
 *    </TimelineIngestor>
 *
 *    - The `<p>` above is an MDX JSX **flow** element:
 *      `MdxJsxFlowElement` with `name: "p"`.
 *    - `renameFlow` can rename it (e.g. `p → MessageParagraph`) because it is
 *      literally a JSX tag in the MDX AST.
 *
 * 2) Plain Markdown paragraph (mdast paragraph node)
 *
 *    <TimelineIngestor>
 *      Hello world
 *    </TimelineIngestor>
 *
 *    - “Hello world” becomes an mdast `paragraph` node (`type: "paragraph"`).
 *    - This is NOT an `MdxJsxFlowElement` named `"p"`.
 *
 * ⚠️ Limitation (by design):
 * - `renameFlow` rewrites only MDX JSX **flow** elements (`MdxJsxFlowElement`).
 * - It does not rewrite Markdown paragraph nodes (`type: "paragraph"`), even
 *   though they eventually render to `<p>` at HTML/React output time.
 */
export const remarkScopedMdx: Plugin<[ScopedMdxTransformRegistry], Parent> = (
  registry: ScopedMdxTransformRegistry
) => {
  const scopeComponentNames = new Set(Object.keys(registry));

  const visitor = createScopeVisitor(registry, scopeComponentNames);

  const transformer: Transformer<Parent> = tree => {
    visit(tree, shouldProcessScope(registry), visitor);
  };

  return transformer;
};
