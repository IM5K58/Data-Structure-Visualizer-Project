let idCounter = 0;

/**
 * Generates a unique ID for visualization items.
 */
export const nextId = () => `item-${++idCounter}`;

/**
 * Resets the ID counter, usually called when replaying steps.
 */
export function resetParserIds() {
    idCounter = 0;
}
