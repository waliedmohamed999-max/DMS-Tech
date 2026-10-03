export type HeaderRule = { source: string; headers: { key: string; value: string }[] };
export function securityHeaders(production: boolean): { key: string; value: string }[];
export function headerRules(production: boolean): HeaderRule[];
export declare const NON_PAGE_CSP: string;
