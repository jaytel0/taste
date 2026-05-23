import {
  blobPathnamesForRun,
  deleteRunRecord,
  purgeExpiredCredentialSessions,
  purgeOldRateLimits,
  purgeRunCredentials,
  runsNeedingCleanup,
} from "@/db/repository";
import { deleteBlobPathnames } from "@/storage/blob";

export async function cleanupExpiredData(now = new Date()) {
  await purgeExpiredCredentialSessions(now);
  await purgeOldRateLimits(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  const runs = await runsNeedingCleanup(now);
  let deletedRuns = 0;
  let deletedBlobs = 0;
  for (const run of runs) {
    await purgeRunCredentials(run.id);
    const pathnames = await blobPathnamesForRun(run.id);
    await deleteBlobPathnames(pathnames).catch(() => {});
    deletedBlobs += pathnames.length;
    await deleteRunRecord(run.id);
    deletedRuns += 1;
  }

  return { deletedRuns, deletedBlobs };
}
