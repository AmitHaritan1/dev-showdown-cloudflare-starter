import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';

const INTERACTION_ID_HEADER = 'X-Interaction-Id';
const PRODUCT_EXTRACTION_SCHEMA = z.object({
	name: z.string(),
	price: z.number(),
	currency: z.string(),
	inStock: z.boolean(),
	dimensions: z.object({
		length: z.number(),
		width: z.number(),
		height: z.number(),
		unit: z.string(),
	}),
	manufacturer: z.object({
		name: z.string(),
		country: z.string(),
		website: z.string().url(),
	}),
	specifications: z.object({
		weight: z.number(),
		weightUnit: z.string(),
		warrantyMonths: z.number().int(),
	}),
});

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method !== 'POST' || url.pathname !== '/api') {
			return new Response('Not Found', { status: 404 });
		}

		const challengeType = url.searchParams.get('challengeType');
		if (!challengeType) {
			return new Response('Missing challengeType query parameter', {
				status: 400,
			});
		}

		const interactionId = request.headers.get(INTERACTION_ID_HEADER);
		if (!interactionId) {
			return new Response(`Missing ${INTERACTION_ID_HEADER} header`, {
				status: 400,
			});
		}

		const payload = await request.json<any>();

		switch (challengeType) {
			case 'HELLO_WORLD':
				return Response.json({
					greeting: `Hello ${payload.name}`,
				});
			case 'BASIC_LLM': {
				if (!env.DEV_SHOWDOWN_API_KEY) {
					throw new Error('DEV_SHOWDOWN_API_KEY is required');
				}

				if (typeof payload.question !== 'string' || !payload.question.trim()) {
					return new Response('Missing question in request body', {
						status: 400,
					});
				}

				const workshopLlm = createWorkshopLlm(env.DEV_SHOWDOWN_API_KEY, interactionId);
				const result = await generateText({
					model: workshopLlm.chatModel('deli-4'),
					system:
						'You will be given a trivia question, and you need to answer it correctly. Keep the response concise and factual.',
					prompt: payload.question.trim(),
				});

				return Response.json({
					answer: result.text || 'N/A',
				});
			}
			case 'JSON_MODE': {
				if (typeof payload.description !== 'string' || !payload.description.trim()) {
					return new Response('Missing description in request body', {
						status: 400,
					});
				}

				if (!env.DEV_SHOWDOWN_API_KEY) {
					throw new Error('DEV_SHOWDOWN_API_KEY is required');
				}

				const workshopLlm = createWorkshopLlm(env.DEV_SHOWDOWN_API_KEY, interactionId);
				const result = await generateObject({
					model: workshopLlm.chatModel('deli-4'),
					schema: PRODUCT_EXTRACTION_SCHEMA,
					system:
						'Extract structured product details from the provided description. Return only facts stated in the text. Normalize numeric fields to numbers and keep unit/currency fields exactly as stated.',
					prompt: payload.description.trim(),
				});

				return Response.json(result.object);
			}
				default:
					return new Response('Solver not found', { status: 404 });
			}
		},
	} satisfies ExportedHandler<Env>;

function createWorkshopLlm(apiKey: string, interactionId: string) {
	return createOpenAICompatible({
		name: 'dev-showdown',
		baseURL: 'https://devshowdown.com/v1',
		supportsStructuredOutputs: true,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			[INTERACTION_ID_HEADER]: interactionId,
		},
	});
}
