/**
 * Determines how a feature's consumption is measured.
 *
 * - boolean:  gated access, no quantity tracking (e.g., "has SSO enabled")
 * - quantity:  discrete countable units (e.g., "number of reports")
 * - seats:     concurrent or assigned user slots (e.g., "team members")
 * - storage:   bytes consumed (e.g., "file storage in GB")
 * - usage:     high-frequency event-level metering (e.g., "API calls")
 */
export enum MeterType {
  Boolean = 'boolean',
  Quantity = 'quantity',
  Seats = 'seats',
  Storage = 'storage',
  Usage = 'usage',
}
