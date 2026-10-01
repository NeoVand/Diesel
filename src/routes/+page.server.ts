import { accessContext, demoConfiguration } from '$lib/server/access-http';
import { demoAccess } from '$lib/server/demo-access';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	event.setHeaders({ 'Cache-Control': 'no-store' });
	const aiAccess = demoAccess.status(demoConfiguration(), accessContext(event));
	return { aiAccess, localAIAvailable: aiAccess.mode === 'local' && aiAccess.aiAvailable };
};
