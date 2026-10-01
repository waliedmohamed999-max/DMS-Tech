import "server-only";
/**
 * Server entry point for the Business OS. Importing this module registers
 * event subscribers and approval handlers exactly once per process.
 */
import { registerSubscribers } from "./events/subscribers";
import "./admin/users"; // registers the ROLE_GRANT approval handler
import "./commercial/quotations"; // registers the QUOTATION approval handler
import "./projects/time"; // registers the TIMESHEET approval handler
import "./finance/expenses"; // registers the EXPENSE approval handler

registerSubscribers();

export * from "./context";
export * from "./errors";
