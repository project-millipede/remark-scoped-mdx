import { PhantomRegistry } from '../mdx/entry-protocol';
import { getMdxOperations } from './operations';

/**
 * Binds an operation to a nested authoring context.
 *
 * Key idea (the core of the adapter):
 *
 * 1) Authoring hook (why there is a callback)
 *    - Transform authors (i.e. the library user configuring these transforms)
 *      provide a callback to *author the config* for this layer.
 *
 * 2) Scoped authoring (why we inject a context)
 *    - We invoke the callback with the context available at this callsite
 *      (`nextContext`), so the caller can only use the APIs intended for this
 *      layer (enforcing the hierarchy).
 *
 * 3) Single transformation point (where adaptation happens)
 *    - The callback's return value is `Input`.
 *    - `operation(Input)` is the only place that turns the authored `Input`
 *      into `Output`.
 *
 * @template NextContext - Context injected into the callback (API for this callsite).
 * @template Input - Value returned by the callback (layer config).
 * @template Output - Result of `operation(Input)`.
 *
 * @param nextContext - Context passed into the callback.
 * @param operation - Operation applied to the callback result.
 * @returns A function that returns `operation(callback(nextContext))`.
 */
function bindLayer<NextContext, Input, Output>(
  nextContext: NextContext,
  operation: (input: Input) => Output
) {
  // Returns the layer function transform authors call (e.g. `ctx.transform(...)`).
  return (defineLayer: (context: NextContext) => Input): Output => {
    // Step 1:
    // Run the transform-author callback with the context available at this callsite.
    // Execution Flow: nextContext -> [author callback] -> input
    const input = defineLayer(nextContext);
    // Step 2:
    // Apply the operation to turn the authored config into the final result.
    // Execution Flow: input -> [operation] -> output
    return operation(input);
  };
}

/**
 * Transform context type used by the `buildTransforms` configuration callback.
 *
 * This context is registry-scoped, ensuring that authored targets are strictly
 * validated against the specific component definitions:
 * - Component names must be valid registry keys.
 * - `component.props` are inferred from the target component’s React props (MDX-literal subset).
 *
 * Derived from the return type of the context factory, effectively exposing
 * the "Root Level" operations (e.g., `transform`).
 */
export type TransformContextFor<Registry extends PhantomRegistry> = ReturnType<
  typeof createTransformContext<Registry>
>;

/**
 * Creates the transform context passed to the configuration callback.
 *
 * It wires the pure MDX operations (`transform`, `flow`, `to`) into a nested,
 * callback-driven authoring API using `bindLayer`:
 *
 *   ctx.transform(rule =>
 *     rule.flow(target => ({
 *       br: target.to(renameTarget)
 *     }))
 *   )
 *
 * This enforces strong typing at each nesting level:
 * - `transform(...)` can only use `flow(...)`
 * - `flow(...)` can only use `to(...)`
 * - `to(...)` constructs a single rename target
 *
 * Editor feedback (intentional):
 * - Component name typos are caught.
 * - Missing required props are caught.
 * - Invalid prop values error at the offending property.
 *
 * @template Registry - Component registry this context is scoped to.
 * @returns Root context exposing `transform`.
 */
export function createTransformContext<Registry extends PhantomRegistry>() {
  const ops = getMdxOperations<Registry>();

  // Level 3 (inner): `to(...)`
  // Builds a single rename target.
  const toContext = { to: ops.to };

  // Level 2 (middle): `flow(...)`
  // Callback authors a `renameFlow` map (source tag -> rename target) using Level 3,
  // then `ops.flow` adapts it into the rule shape the transformer consumes.
  const flowContext = {
    flow: bindLayer(toContext, ops.flow)
  };

  // Level 1 (root): `transform(...)`
  // Callback authors a rule using Level 2, then `ops.transform` finalizes it.
  const transformContext = {
    transform: bindLayer(flowContext, ops.transform)
  };

  return transformContext;
}
