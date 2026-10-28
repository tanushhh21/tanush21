/** Record types with a retention window, in days, and their defaults. */
export const RETENTION_KINDS = [
  { key: "applications", label: "Applications and CVs of people not hired", def: 730 },
  { key: "messages", label: "Messages with candidates", def: 730 },
  { key: "notes", label: "Notes and debriefs", def: 1095 },
  { key: "talent_pool", label: "Talent pool records with consent", def: 1095 },
];
