// Minimal type shims to allow TypeScript compilation in environments where
// @types packages are not installed. These shims are intentionally lightweight
// and do not affect runtime behavior.

declare module "express" {
  export interface Request {
    headers: any;
    body: any;
    params: any;
    query: any;
    [key: string]: any;
  }

  export interface Response {
    status(code: number): Response;
    json(body: any): any;
    send(body: any): any;
    [key: string]: any;
  }

  export type NextFunction = (err?: any) => void;

  // Common exports used by Express apps
  const e: any;
  export default e;

  export function Router(...args: any[]): any;
}

declare module "jsonwebtoken" {
  const jwt: any;
  export default jwt;

  export function sign(...args: any[]): string;
  export function verify(...args: any[]): any;
}
