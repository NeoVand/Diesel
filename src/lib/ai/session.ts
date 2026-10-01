import { get, writable } from 'svelte/store';
import { BrowserAIError } from './errors';

// Deliberately memory-only: no cookies, localStorage, sessionStorage or build-time secrets.
// SvelteKit client navigation retains this store; a reload or closing the tab clears it.
export const browserAI = writable({ key: '', model: 'gpt-6-sol' });

export function connectBrowserAI(key: string, model: string) {
	key = key.trim();
	model = model.trim();
	if (!/^sk-[A-Za-z0-9_-]{17,509}$/.test(key))
		throw new BrowserAIError(400, 'Enter a valid OpenAI API key.');
	if (!/^gpt-[a-zA-Z0-9.-]{1,80}$/.test(model))
		throw new BrowserAIError(400, 'Enter a valid OpenAI model name.');
	browserAI.set({ key, model });
}

export function disconnectBrowserAI() {
	browserAI.update(({ model }) => ({ key: '', model }));
}

export function browserCredentials() {
	const session = get(browserAI);
	if (!session.key)
		throw new BrowserAIError(401, 'Connect your OpenAI API key to use the assistant.');
	return session;
}
