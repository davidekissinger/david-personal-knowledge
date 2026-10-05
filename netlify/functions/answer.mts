import type { Config } from '@netlify/functions';
import { connect } from '../../lib/backend.mts';
import { AppError, bearer, json, readJson } from '../../lib/http.mts';
import { aiAvailability, generateAnswer, prepareEvidence } from '../../lib/answers.mts';

export async function handleAnswer(request: Request, read: (name: string) => string | undefined, fetcher: typeof fetch = fetch) {
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
  try {
    bearer(request);
    const body = request.method === 'POST' ? await readJson(request) : null;
    const deadline = AbortSignal.timeout(50000);
    const boundedFetch: typeof fetch = (url, options = {}) => fetcher(url, { ...options, signal: AbortSignal.any([deadline, ...(options.signal ? [options.signal] : [])]) });
    const client = await connect(request, read, boundedFetch);
    const settings = aiAvailability(read);
    if (!body) return json(settings);
    if (!['answer-preview', 'answer-generate'].includes(String(body.action))) throw new AppError(400, 'Unsupported answer action.');
    if (body.action === 'answer-generate') {
      if (!settings.ready) throw new AppError(503, settings.message);
      if (body.approveExternalProcessing !== true || typeof body.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(body.fingerprint)) throw new AppError(400, 'Preview and approve the evidence for this question before requesting an AI answer.');
    }
    const preview = await prepareEvidence(client.call, body, settings);
    if (body.action === 'answer-preview') return json({ ...preview, ai: settings });
    if (body.fingerprint !== preview.fingerprint) throw new AppError(409, 'The evidence or model configuration changed. Preview and approve the updated request.');
    if (!preview.evidence.length) return json({ status: 'insufficient', claims: [], gaps: ['No supporting passages were retrieved. Try a more specific question or import relevant material.'], providerCalled: false });
    const answer = await generateAnswer(preview, read, boundedFetch);
    // Reauthorize and recheck the exact evidence before returning any generated content.
    const currentClient = await connect(request, read, boundedFetch);
    const current = await prepareEvidence(currentClient.call, body, aiAvailability(read));
    if (current.fingerprint !== preview.fingerprint) throw new AppError(409, 'Archive access or evidence changed during generation. The answer was withheld. Preview again.');
    return json({ ...answer, citations: preview.citations, providerCalled: true });
  } catch (error) {
    return json({ error: error instanceof AppError ? error.message : 'The answer request could not be completed.' }, error instanceof AppError ? error.status : 500);
  }
}
export default async (request: Request) => handleAnswer(request, name => Netlify.env.get(name));
export const config: Config = { path: '/api/answer', rateLimit: { windowLimit: 6, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
