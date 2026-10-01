export class BrowserAIError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
		this.name = 'BrowserAIError';
	}
}

/** Keep provider errors useful without echoing request bodies or credentials. */
export function aiErrorMessage(error: unknown): string {
	if (error instanceof BrowserAIError) return error.message;
	const status =
		typeof error === 'object' && error !== null && 'status' in error ? error.status : null;
	if (status === 401) return 'OpenAI rejected this key. Check your API key in connection settings.';
	if (status === 403 || status === 404)
		return 'This key cannot access the selected OpenAI model. Choose a model available to your project.';
	if (status === 429)
		return 'OpenAI rate or billing limit reached. Check your project usage and retry.';
	if (status === 400)
		return 'OpenAI could not accept this request. Check the selected model and retry.';
	return 'The OpenAI request could not complete. Check your connection and try again.';
}
