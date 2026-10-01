import { sceneToolNames } from './scene-mcp';
import { stateForGuide, type SceneSession } from './scene-broker';
import { Codex, type CodexOptions } from '@openai/codex-sdk';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { knowledgePack, sources } from '$lib/engine/data';
import { engineDefinition } from '$lib/engine/definition';
import {
	ApiProblem,
	agentOutputSchema,
	parseAgentReply,
	type AgentReply,
	type AgentRequest
} from './validation';

const instruction = `You are the engineering guide in Diesel, a brand-neutral V12 engine explorer.
Explain visible components and mechanical relationships concisely. Only use the curated engine-specific evidence for dimensions and claims. Cite allowed source IDs.
The purchased concept contains actual modeled internals. Its measured geometry is 85 mm bore, 100 mm stroke, 125 mm connecting-rod centers, 60-degree banks and approximately 6.81 litres. It is not an identified production engine.
No matched rated speed, power, fuel, boost, heat, emissions or cylinder-pressure calibration exists. Do not infer these from appearance or reuse another engine's performance table. Global crank phase zero is the supplied source pose, not compression TDC. The corrected timing drive and source cam profiles define a documented teaching sequence; production firing order and injection calibration remain unknown. Source defects required explicit geometric and mounting corrections.
The Analysis inspector includes a numerically verified air-standard cylinder case with declared assumptions. Its calculated pressure, temperature, signed gas exchange and indicated work are case results, never measured engine ratings. Use the live referenceCycleStudy data when provided, including its selected cylinder, local angle, assumptions and qualification. Never silently transfer its results into the independent structural operating scenarios or the separate steady passage fields.
Distinguish measured design geometry, purchased appearances, general engineering explanations, educational timing and unknowns. Native solid validation is not a full-cycle interference or performance validation.
Respond with the requested JSON schema. Keep the answer concise, using source IDs instead of markdown links.
You can control this visual scene using the action schema. Use only registered subsystem IDs for legacy actions. Do not invent individual source IDs. Select a part before isolating it. Actions only change the demonstration. Do not output load actions: numerical performance is unavailable.`;

export type SceneBridge = { url: string; token: string; session: SceneSession };
const toolInstruction = `LIVE TOOL MODE: The browser is connected through the engine MCP server. Tools are get_state, get_components, get_evidence, execute_action, save_checkpoint and restore_checkpoint. The harness may expose deferred tools through functions.exec; use tools.mcp__engine__get_state({}) and the corresponding engine tools.
Query current state and exact registered components before changing the scene. Execute one action at a time and await its result. Only applied browser acknowledgements establish success. After your last operation, call get_state again and describe its actual display and visibility. Final JSON must have actions:[] because the acknowledged operations already ran. If stopped, do not retry. If revision changes, reread state. At most 24 scene operations per request.
Use source v12- identifiers returned by get_components; names and parent paths are vendor geometry metadata, not certified part identities. Do not invent legacy Frame_ or mech: parts.
Actions include display assembly/section/cylinder/mechanism/xray/layout; section value {axis:x|y|z,offset:0..1,flipped:boolean,visible:boolean,rotation?:[pitch,yaw]}; reveal complete/covers/rotating/valvetrain; mode inspect/operate/learn; running boolean; seek global 0..720; playback .002..1; explosion0..1; select/focus exact id; isolate; hide/remove; view; fit/reset. Rotation angles are degrees -180..180. Plane visible only shows its guide; display section activates clipping.
Assembly shows the actual purchased geometry. Section is a movable clipping plane through the whole purchased engine. Cylinder is a focused study of actual source machinery; mechanism reveals the rotating assembly. Named reveals remove documented classes: complete restores the full source assembly, covers opens covers, rotating reveals crank/rods/pistons, valvetrain reveals cam/valve hardware. Query visible state: a registered part may still be hidden, isolated out, obstructed or clipped.
X-ray keeps the exterior ghosted around the actual internals; it is an inspection aid, not a radiographic simulation. Playback is independent of inspection views. For a request to run or pause, change only running: never also reveal internals, change display, focus a component or move the camera unless the user explicitly asks. An exterior view can run. Changing between exterior, section, mechanism and X-ray preserves playback. The measured geometric analysis reports piston travel and rod inclination; it does not establish power, pressure or combustion timing.
Use display layout for requests to arrange all parts. The static atlas preserves common physical scale, with presentation spacing. It pauses motion and flows without changing stored phase. Return to an operating display, set explosion to zero and return all removed parts before running. A separated engine cannot acknowledge running playback. Explosion amount remains normalized 0–1 and preserves component scale; it is not a validated service disassembly sequence. Save a checkpoint before substantially changing a view and restore that checkpoint on request.
Mechanical phase is global crank rotation relative to source rest. Use referenceCycleStudy.current.angleDeg for the tracked cylinder's compression-TDC-relative cycle; do not confuse it with global mechanical phase or authenticated production timing. Intake/exhaust flow actions now show valve-gated particles from offline steady potential-flow fields in native passages. Fuel shows reduced spray parcels at measured nozzle tips; combustion shows a bounded illustrative mixing/heat volume. The visible speed and assumed injection/heat laws are not calibrated, and no spatial temperature or reacting-CFD claim is supported. Oil and coolant still use hardware highlighting only. Check active flow channels and the visible presentation before describing an effect. The cylinder reference case is independent of the passage fields, turbo maps and structural-load study. Moving-source geometry does not establish all possible clearances, durability or manufacturing feasibility.
Never promise complete accurate cut caps purely from native solid validity; describe only the verified presentation. Lesson and narration states are observable; the current tools do not start lessons or speech. Explain unavailable capabilities honestly.`;
export function harnessOptions(
	key: string,
	stateDirectory: string,
	bridge?: SceneBridge
): CodexOptions {
	// A per-child environment prevents desktop credentials, plugins and unrelated secrets from leaking into the harness.
	const childEnvironment: Record<string, string> = { CODEX_HOME: stateDirectory };
	for (const name of ['PATH', 'TMPDIR', 'SystemRoot', 'WINDIR']) {
		if (process.env[name]) childEnvironment[name] = process.env[name]!;
	}
	const developerInstruction = bridge
		? `${instruction.slice(0, instruction.indexOf('You can control this visual scene'))}\n${toolInstruction}`
		: instruction;
	return {
		apiKey: key,
		baseUrl: 'https://api.openai.com/v1',
		env: childEnvironment,
		...(process.env.DIESEL_CODEX_PATH ? { codexPathOverride: process.env.DIESEL_CODEX_PATH } : {}),
		config: {
			forced_login_method: 'api',
			cli_auth_credentials_store: 'ephemeral',
			developer_instructions: `${developerInstruction}\n\nCURATED ENGINE KNOWLEDGE\n${knowledgePack}\n\nALLOWED SOURCES\n${JSON.stringify(sources)}`,
			project_doc_max_bytes: 0,
			history: { persistence: 'none' },
			analytics: { enabled: false },
			feedback: { enabled: false },
			features: {
				shell_tool: false,
				unified_exec: false,
				shell_snapshot: false,
				apps: false,
				multi_agent: false,
				hooks: false,
				memories: false
			},
			...(bridge
				? {
						mcp_servers: {
							engine: {
								url: bridge.url,
								http_headers: { Authorization: `Bearer ${bridge.token}` },
								required: true,
								enabled_tools: sceneToolNames,
								startup_timeout_sec: 8,
								tool_timeout_sec: 15,
								default_tools_approval_mode: 'approve'
							}
						}
					}
				: {}),
			check_for_update_on_startup: false
		}
	};
}

export async function runEngineAgent(
	request: AgentRequest,
	signal: AbortSignal,
	bridge?: SceneBridge
): Promise<AgentReply> {
	const requestDirectory = await mkdtemp(join(tmpdir(), 'diesel-agent-'));
	try {
		const stateDirectory = join(requestDirectory, 'state');
		const workingDirectory = join(requestDirectory, 'workspace');
		await mkdir(stateDirectory, { mode: 0o700 });
		await mkdir(workingDirectory, { mode: 0o700 });
		const codex = new Codex(harnessOptions(request.key, stateDirectory, bridge));
		const thread = codex.startThread({
			model: request.model,
			workingDirectory,
			skipGitRepoCheck: true,
			sandboxMode: 'read-only',
			approvalPolicy: 'never',
			networkAccessEnabled: false,
			webSearchMode: 'disabled',
			modelReasoningEffort: 'low'
		});
		const prompt = JSON.stringify({
			question: request.message,
			conversation: request.history,
			scene: bridge ? stateForGuide(bridge.session) : request.scene,
			engine: {
				assetId: engineDefinition.assetId,
				version: engineDefinition.version,
				geometry: engineDefinition.geometry
			},
			performance: {
				available: false,
				reason: 'No matched performance calibration is supplied for this concept.'
			}
		});
		const result = await thread.run(prompt, { outputSchema: agentOutputSchema, signal });
		const reply = parseAgentReply(result.finalResponse);
		if (bridge && reply.actions.length)
			throw new ApiProblem(502, 'The guide returned unacknowledged operations. Please try again.');
		return reply;
	} finally {
		// Codex can write runtime state outside its model sandbox; remove this request's state after completion or cancellation.
		await rm(requestDirectory, { recursive: true, force: true });
	}
}
