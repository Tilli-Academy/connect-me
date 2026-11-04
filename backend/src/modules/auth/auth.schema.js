// JSON Schemas for the auth routes. Fastify validates request bodies against these
// and rejects unknown/invalid fields with 400 before any service logic runs.

const email = { type: 'string', format: 'email', maxLength: 254 };
const password = { type: 'string', minLength: 8, maxLength: 128 };

export const registerSchema = {
  body: {
    type: 'object',
    required: ['email', 'password', 'name'],
    additionalProperties: false,
    properties: {
      email,
      password,
      name: { type: 'string', minLength: 1, maxLength: 100 },
      phone: { type: 'string', maxLength: 30 },
    },
  },
};

export const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    additionalProperties: false,
    properties: {
      email,
      password: { type: 'string', minLength: 1, maxLength: 128 },
    },
  },
};

export const changePasswordSchema = {
  body: {
    type: 'object',
    required: ['currentPassword', 'newPassword'],
    additionalProperties: false,
    properties: {
      currentPassword: { type: 'string', minLength: 1, maxLength: 128 },
      newPassword: password,
    },
  },
};
