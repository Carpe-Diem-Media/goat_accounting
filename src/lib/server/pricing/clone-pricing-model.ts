import { z } from 'zod';

const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
export const cloneInput = z.tuple([z.uuid(), z.string().max(80).regex(semver), z.uuid()]);

/** The caller must first establish active admin status and current AAL2. */
export async function clonePricingModel(
 repository: { clone(source: string, version: string, actor: string): Promise<string> },
 source: string, version: string, actor: string
): Promise<string> {
 const args = cloneInput.parse([source, version, actor]);
 return z.uuid().parse(await repository.clone(...args));
}
