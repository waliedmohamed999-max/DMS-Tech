import "server-only";
/**
 * Server entry point for the Business OS. Importing this module registers
 * event subscribers and approval handlers exactly once per process.
 */
import { registerSubscribers } from "./events/subscribers";
import "./handlers"; // approval + outbox handlers (shared with the worker scripts)

registerSubscribers();

export * from "./context";
export * from "./errors";
