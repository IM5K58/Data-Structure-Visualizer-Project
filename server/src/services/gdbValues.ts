/**
 * GDB Machine Interface (MI): reading GDB's value and type strings.
 *
 * Pure predicates, shared by the driver and the mapper.
 */

import type { STLKind } from './gdbTypes.js';

/**
 * GDB often annotates pointer values with symbol names, e.g.:
 *   "0x70ba40 <Node::Node()>"  or  "0x7ff7313d7040 <__native_startup_lock>"
 * Strip everything after the first space to get the raw hex address.
 */
export function stripGDBAnnotation(val: string): string {
    return val.split(' ')[0].trim();
}

export function isNullPointer(val: string): boolean {
    const raw = stripGDBAnnotation(val);
    return raw === '0x0' || raw === '0' || raw === '(null)' || raw === 'NULL' || raw === '';
}

export function isPointerType(type: string): boolean {
    return type.trimEnd().endsWith('*');
}

/**
 * Returns true if the type looks like a user-defined struct/class
 * (not a primitive, not a pointer, not an array, not a std:: type).
 */
export function isStructType(type: string): boolean {
    if (isPointerType(type)) return false;
    if (type.includes('[')) return false;
    if (type.includes('&')) return false;
    if (type.includes('std::')) return false;
    const clean = type
        .replace(/\b(const|volatile|unsigned|long|short|signed|struct|class)\b/g, '')
        .trim();
    return !/^(int|char|bool|float|double|void|size_t|ptrdiff_t|wchar_t|auto)$/.test(clean)
        && clean.length > 0;
}

/** True if the type is a plain integer-like scalar (used to detect index fields). */
export function isIntegralType(type: string): boolean {
    const clean = type
        .replace(/\b(const|volatile|unsigned|long|short|signed)\b/g, '')
        .trim();
    return /^(int|char|size_t|ptrdiff_t)$/.test(clean);
}

/**
 * Detect supported STL container types by GDB type string.
 * Returns the kind (stack/queue/...) or null if not a supported STL container.
 *
 * Type strings come back from GDB with full template params, e.g.:
 *   "std::stack<int, std::deque<int, std::allocator<int> > >"
 *   "std::vector<int, std::allocator<int> >"
 *
 * We match the leading "std::<name><" prefix.
 */
export function detectSTL(type: string): STLKind | null {
    const t = type.trimStart();
    if (/^std::stack\s*</.test(t))           return 'stack';
    if (/^std::priority_queue\s*</.test(t))  return 'priority_queue';
    if (/^std::queue\s*</.test(t))           return 'queue';
    if (/^std::vector\s*</.test(t))          return 'vector';
    if (/^std::deque\s*</.test(t))           return 'deque';
    if (/^std::unordered_map\s*</.test(t))   return 'unordered_map';
    if (/^std::map\s*</.test(t))             return 'map';
    return null;
}

export function strOf(v: unknown): string {
    return v == null ? '' : String(v);
}
