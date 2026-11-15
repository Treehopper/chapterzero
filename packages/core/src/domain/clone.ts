/** Deep copy of plain JSON data (core has no structuredClone: it is not part of ES2022). */
export const deepClone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
