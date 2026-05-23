import { drainWorkflow, enqueueRunWorkflow } from "@/workflow/runner";

export async function processRun(runId: string) {
  await enqueueRunWorkflow(runId);
  await drainWorkflow();
}
