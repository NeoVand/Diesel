import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { AIAccessStatus } from '$lib/ai/access';
import { localServerKeyAvailable } from './local-ai';
import { ApiProblem } from './validation';

export const DEMO_COOKIE = 'diesel_demo';
export const DEMO_SESSION_MS = 2 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const MAX_BUCKETS = 2_048;
const PER_VISIT = { agent: 30, audio: 30 };
const PER_MINUTE = { agent: 4, audio: 6 };
const PER_ADDRESS_DAY = { agent: 60, audio: 60 };
const GLOBAL_DAY = { agent: 200, audio: 200 };
type Kind = 'agent' | 'audio';
type Counts = Record<Kind, number>;
type Bucket = { start: number; counts: Counts };
type Visit = {
	id: string;
	issuedAt: number;
	expiresAt: number;
	used: Counts;
	minute: Bucket;
	active: Set<AbortController>;
};
export type DemoConfiguration = {
	development: boolean;
	localOptIn?: string;
	key?: string;
	password?: string;
	secret?: string;
};
export type AccessContext = {
	request: Request;
	url: URL;
	clientAddress: string;
	cookie?: string;
};
export type RequestCredential = {
	key: unknown;
	source: 'byok' | 'local' | 'invite';
	visit: Visit | null;
};
const emptyCounts = (): Counts => ({ agent: 0, audio: 0 });
const hash = (value: string) => createHash('sha256').update(value).digest();
const equal = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

export function requireAccessOrigin(request: Request, url: URL): void {
	if (
		request.headers.get('origin') !== url.origin ||
		request.headers.get('sec-fetch-site') === 'cross-site'
	)
		throw new ApiProblem(403, 'Demo access must come from this application.');
}

/** Network provenance is never inferred from a visitor-supplied forwarded header. */
export function localOwnerAvailable(configuration: DemoConfiguration, context: AccessContext) {
	if (
		['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip'].some(
			(name) => context.request.headers.has(name)
		) ||
		context.request.headers.get('sec-fetch-site') === 'cross-site'
	)
		return false;
	return localServerKeyAvailable(
		{
			development: configuration.development,
			optIn: configuration.localOptIn ?? 'true',
			key: configuration.key
		},
		context.url,
		context.clientAddress
	);
}

/** Process-local, bounded invite ledger. Restart invalidates cookies and resets capacity counters. */
export class DemoAccessManager {
	private visits = new Map<string, Visit>();
	private addressUsage = new Map<string, Bucket>();
	private loginAttempts = new Map<string, { start: number; count: number }>();
	private globalAttempts = { start: 0, count: 0 };
	private globalUsage: Bucket = { start: 0, counts: emptyCounts() };
	private configurationId = '';

	constructor(private now = () => Date.now()) {}

	private synchronize(configuration: DemoConfiguration) {
		const id = hash(
			`${configuration.password ?? ''}\0${configuration.secret ?? ''}\0${configuration.key ?? ''}`
		).toString('hex');
		if (id !== this.configurationId) {
			for (const visit of this.visits.values()) this.abortVisit(visit);
			this.visits.clear();
			this.configurationId = id;
		}
		const now = this.now();
		for (const [id, visit] of this.visits) {
			if (visit.expiresAt <= now) {
				this.abortVisit(visit);
				this.visits.delete(id);
			}
		}
		for (const [id, usage] of this.addressUsage)
			if (now - usage.start >= DAY_MS) this.addressUsage.delete(id);
		for (const [id, attempts] of this.loginAttempts)
			if (now - attempts.start >= 15 * 60_000) this.loginAttempts.delete(id);
	}

	private configured(configuration: DemoConfiguration, context: AccessContext): boolean {
		return (
			Boolean(configuration.key?.trim()) &&
			(configuration.password?.length ?? 0) >= 12 &&
			(configuration.secret?.length ?? 0) >= 32 &&
			context.url.protocol === 'https:'
		);
	}

	private abortVisit(visit: Visit) {
		for (const controller of visit.active) controller.abort();
	}

	private cookieVisit(configuration: DemoConfiguration, context: AccessContext): Visit | null {
		if (
			!this.configured(configuration, context) ||
			!context.cookie ||
			context.cookie.length > 1_024
		)
			return null;
		const [payload, signature, extra] = context.cookie.split('.');
		if (!payload || !signature || extra || !/^[A-Za-z0-9_-]+$/.test(payload + signature))
			return null;
		const expected = createHmac('sha256', configuration.secret!).update(payload).digest();
		const received = Buffer.from(signature, 'base64url');
		if (!equal(expected, received)) return null;
		let value: unknown;
		try {
			value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
		} catch {
			return null;
		}
		if (typeof value !== 'object' || value === null) return null;
		const claims = value as Record<string, unknown>;
		if (
			Object.keys(claims).length !== 4 ||
			claims.v !== 1 ||
			typeof claims.sub !== 'string' ||
			!Number.isSafeInteger(claims.iat) ||
			!Number.isSafeInteger(claims.exp)
		)
			return null;
		const visit = this.visits.get(claims.sub);
		if (
			!visit ||
			visit.issuedAt !== claims.iat ||
			visit.expiresAt !== claims.exp ||
			visit.issuedAt > this.now() ||
			visit.expiresAt <= this.now()
		)
			return null;
		return visit;
	}

	private localVisit(context: AccessContext): Visit {
		const id = `local:${context.clientAddress}`;
		let visit = this.visits.get(id);
		if (!visit) {
			visit = this.newVisit(id);
			this.visits.set(id, visit);
		}
		return visit;
	}

	private newVisit(id: string = randomUUID()): Visit {
		const now = this.now();
		return {
			id,
			issuedAt: now,
			expiresAt: now + DEMO_SESSION_MS,
			used: emptyCounts(),
			minute: { start: now, counts: emptyCounts() },
			active: new Set()
		};
	}

	status(configuration: DemoConfiguration, context: AccessContext): AIAccessStatus {
		this.synchronize(configuration);
		const local = localOwnerAvailable(configuration, context);
		const available = local || this.configured(configuration, context);
		const visit = local ? this.localVisit(context) : this.cookieVisit(configuration, context);
		return {
			mode: local ? 'local' : available ? 'invite' : 'unavailable',
			authenticated: Boolean(visit),
			aiAvailable: available && Boolean(visit),
			expiresAt: local ? null : (visit?.expiresAt ?? null),
			limits: {
				guideRemaining: Math.max(0, PER_VISIT.agent - (visit?.used.agent ?? 0)),
				audioRemaining: Math.max(0, PER_VISIT.audio - (visit?.used.audio ?? 0))
			}
		};
	}

	unlock(configuration: DemoConfiguration, context: AccessContext, password: unknown) {
		requireAccessOrigin(context.request, context.url);
		this.synchronize(configuration);
		if (!this.configured(configuration, context))
			throw new ApiProblem(503, 'Invited AI access is not configured on this server.');
		const now = this.now();
		const address = hash(context.clientAddress).toString('hex');
		let attempts = this.loginAttempts.get(address);
		if (!attempts) {
			if (this.loginAttempts.size >= MAX_BUCKETS)
				throw new ApiProblem(429, 'Demo access is busy. Please try again later.');
			attempts = { start: now, count: 0 };
			this.loginAttempts.set(address, attempts);
		}
		if (now - this.globalAttempts.start >= 15 * 60_000)
			this.globalAttempts = { start: now, count: 0 };
		if (attempts.count >= 5 || this.globalAttempts.count >= 100)
			throw new ApiProblem(429, 'Too many password attempts. Please wait 15 minutes.');
		attempts.count += 1;
		this.globalAttempts.count += 1;
		if (
			typeof password !== 'string' ||
			password.length > 256 ||
			!equal(hash(password), hash(configuration.password!))
		)
			throw new ApiProblem(401, 'That demo password was not accepted.');
		let visit = this.cookieVisit(configuration, context);
		if (!visit) {
			if (this.visits.size >= 256)
				throw new ApiProblem(429, 'Too many demo visits are open. Please try again later.');
			visit = this.newVisit();
			this.visits.set(visit.id, visit);
		}
		const payload = Buffer.from(
			JSON.stringify({ v: 1, sub: visit.id, iat: visit.issuedAt, exp: visit.expiresAt })
		).toString('base64url');
		const signature = createHmac('sha256', configuration.secret!)
			.update(payload)
			.digest('base64url');
		const cookie = `${payload}.${signature}`;
		return {
			cookie,
			maxAge: Math.max(1, Math.floor((visit.expiresAt - now) / 1_000)),
			status: this.status(configuration, { ...context, cookie })
		};
	}

	logout(configuration: DemoConfiguration, context: AccessContext): AIAccessStatus {
		requireAccessOrigin(context.request, context.url);
		this.synchronize(configuration);
		const visit = this.cookieVisit(configuration, context);
		if (visit) {
			this.abortVisit(visit);
			this.visits.delete(visit.id);
		}
		return this.status(configuration, { ...context, cookie: undefined });
	}

	credential(
		configuration: DemoConfiguration,
		context: AccessContext,
		suppliedKey: unknown
	): RequestCredential {
		if (suppliedKey !== undefined && suppliedKey !== null && suppliedKey !== '')
			return { key: suppliedKey, source: 'byok', visit: null };
		requireAccessOrigin(context.request, context.url);
		this.synchronize(configuration);
		if (localOwnerAvailable(configuration, context))
			return { key: configuration.key!.trim(), source: 'local', visit: this.localVisit(context) };
		const visit = this.cookieVisit(configuration, context);
		if (visit) return { key: configuration.key!.trim(), source: 'invite', visit };
		throw new ApiProblem(401, 'Unlock invited AI access to ask the engineering guide.');
	}

	/** Attempts consume quota even if upstream fails or the visitor cancels; retries are never free. */
	reserve(credential: RequestCredential, context: AccessContext, kind: Kind) {
		if (!credential.visit) return null;
		const visit = credential.visit;
		const now = this.now();
		if (visit.expiresAt <= now || !this.visits.has(visit.id))
			throw new ApiProblem(401, 'This demo visit expired. Unlock access again.');
		if (visit.active.size)
			throw new ApiProblem(429, 'Finish or stop the current AI request before starting another.');
		if (now - visit.minute.start >= 60_000) visit.minute = { start: now, counts: emptyCounts() };
		if (visit.used[kind] >= PER_VISIT[kind])
			throw new ApiProblem(429, 'This visit reached its AI allowance. Please contact your host.');
		if (visit.minute.counts[kind] >= PER_MINUTE[kind])
			throw new ApiProblem(429, 'Please wait a minute before another AI request.');
		const address = hash(context.clientAddress).toString('hex');
		let usage = this.addressUsage.get(address);
		if (!usage || now - usage.start >= DAY_MS) {
			if (!usage && this.addressUsage.size >= MAX_BUCKETS)
				throw new ApiProblem(429, 'The hosted AI allowance is busy. Please try again later.');
			usage = { start: now, counts: emptyCounts() };
			this.addressUsage.set(address, usage);
		}
		if (now - this.globalUsage.start >= DAY_MS)
			this.globalUsage = { start: now, counts: emptyCounts() };
		if (
			usage.counts[kind] >= PER_ADDRESS_DAY[kind] ||
			this.globalUsage.counts[kind] >= GLOBAL_DAY[kind]
		)
			throw new ApiProblem(429, 'The hosted AI allowance is exhausted for today. Try again later.');
		visit.used[kind] += 1;
		visit.minute.counts[kind] += 1;
		usage.counts[kind] += 1;
		this.globalUsage.counts[kind] += 1;
		const controller = new AbortController();
		visit.active.add(controller);
		const timer = setTimeout(() => controller.abort(), visit.expiresAt - now);
		return {
			signal: controller.signal,
			finish: () => {
				clearTimeout(timer);
				visit.active.delete(controller);
			}
		};
	}
}

export const demoAccess = new DemoAccessManager();
