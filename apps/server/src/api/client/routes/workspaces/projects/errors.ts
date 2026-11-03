import { FastifyReply } from 'fastify';
import { z } from 'zod/v4';

import { toProjectError } from '@colanode/server/lib/projects/projects';

// The project routes answer with their own error codes ("code_taken",
// "plane_project_not_found"...), which the dialog turns into a message next
// to the field concerned. Same { code, message } shape as every API error.
export const projectErrorOutputSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const projectErrorResponses = {
  400: projectErrorOutputSchema,
  403: projectErrorOutputSchema,
  404: projectErrorOutputSchema,
  409: projectErrorOutputSchema,
  502: projectErrorOutputSchema,
};

export const sendProjectError = (
  reply: FastifyReply,
  error: unknown
): FastifyReply => {
  const known = toProjectError(error);
  if (!known) {
    throw error;
  }
  return reply.code(known.status).send({
    code: known.code,
    message: known.message,
  });
};
