/**
 * Session context tracker for telemetry.
 * Manages session context and enriches event properties with session data.
 */

import type { SessionContext } from "./SessionContext";

/**
 * Session context tracker for telemetry
 */
export class SessionTracker {
  private sessionContext?: SessionContext;

  /**
   * Start a new session with context
   */
  startSession(context: SessionContext): void {
    this.sessionContext = context;
  }

  /**
   * End current session and return duration
   */
  endSession(): { duration: number; interface?: string } | null {
    if (!this.sessionContext) return null;

    const duration = Date.now() - this.sessionContext.startTime.getTime();
    const sessionInterface = this.sessionContext.interface;

    // Clear session context
    this.sessionContext = undefined;

    return { duration, interface: sessionInterface };
  }

  /**
   * Get current session context
   */
  getSessionContext(): SessionContext | undefined {
    return this.sessionContext;
  }

  /**
   * Get enriched properties with session context
   */
  getEnrichedProperties(
    properties: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      ...this.sessionContext,
      ...properties,
      timestamp: new Date().toISOString(),
    };
  }
}
