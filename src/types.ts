import * as z from 'zod/v4';

export const envelopeSchema = z.object({
  ErrorCode: z.number(),
  ErrorStatus: z.string(),
  Message: z.string(),
  Response: z.unknown()
});

export const manifestSchema = z.object({
  version: z.string(),
  mobileWorldContentPaths: z.object({ en: z.string() })
});

export type Manifest = z.infer<typeof manifestSchema>;