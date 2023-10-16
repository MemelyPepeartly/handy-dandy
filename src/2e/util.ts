type SetElement<TSet extends Set<unknown>> = TSet extends Set<infer TElement> ? TElement : never;

export {
    SetElement
}