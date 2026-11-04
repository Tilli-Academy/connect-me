// JSON Schemas for the users (profile) routes.
// PATCH is a partial update of editable fields only — email (login identity) and
// password (see /auth/change-password) are intentionally not editable here.
// Nullable fields may be cleared by sending null.

export const updateProfileSchema = {
  body: {
    type: 'object',
    minProperties: 1,
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 100 },
      phone: { type: ['string', 'null'], maxLength: 30 },
      bio: { type: ['string', 'null'], maxLength: 500 },
      avatarUrl: { type: ['string', 'null'], maxLength: 2048 },
    },
  },
};
