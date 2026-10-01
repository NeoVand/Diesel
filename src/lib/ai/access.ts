/** Public access state only. Credentials and cookie signatures never enter this contract. */
export type AIAccessStatus = {
	mode: 'local' | 'invite' | 'unavailable';
	authenticated: boolean;
	aiAvailable: boolean;
	expiresAt: number | null;
	limits: { guideRemaining: number; audioRemaining: number };
};
