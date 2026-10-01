import { labActionSchema } from './scene-contract';
const queryObject = (properties: Record<string, unknown> = {}, required: string[] = []) => ({
	type: 'object',
	additionalProperties: false,
	properties,
	required
});
export const sceneTools = [
	{
		name: 'get_state',
		description:
			'Read actual sampled working-engine state, presentation/display meaning, common-scale Parts-layout spacing qualification, whole-engine clipping plane and global source-rest mechanical phase, discrete revision, lesson/audio state and saved checkpoints. Query before a scene change and again after your last operation before the final answer. Describe this verified display, not the intended request.',
		inputSchema: queryObject(),
		annotations: { readOnlyHint: true }
	},
	{
		name: 'get_components',
		description:
			'Search the registered engine component catalog. Only these exact IDs may be used; source mesh names do not imply authenticated OEM part identities. Optional cadProduct is a recovered vendor CAD label, not verified OEM identity or function. Source appearance and function labels retain audit qualifications.',
		inputSchema: queryObject({
			search: { type: 'string', maxLength: 180 },
			limit: { type: 'integer', minimum: 1, maximum: 40 }
		}),
		annotations: { readOnlyHint: true }
	},
	{
		name: 'get_evidence',
		description:
			'Read a known primary-source citation by ID. This returns the curated citation, not licensed manual text.',
		inputSchema: queryObject({ id: { type: 'string' } }, ['id']),
		annotations: { readOnlyHint: true }
	},
	{
		name: 'execute_action',
		description:
			'Execute one scene command and await actual browser acknowledgement. Views: exterior assembly, whole-engine section, focused source cylinder, rotating mechanism, ghosted X-ray, and common-scale static parts atlas. Run and pause do not change the camera or display; running from the exterior is supported. Named reveal presets preserve registered identities. Section rotation is optional [pitch,yaw] degrees. Atlas and mechanically separated parts pause motion. Seek is global crank rotation from source rest, not calibrated cylinder combustion phase. Use current expectedRevision; never claim success without applied status.',
		inputSchema: queryObject(
			{ expectedRevision: { type: 'integer', minimum: 0 }, action: labActionSchema },
			['expectedRevision', 'action']
		),
		annotations: { readOnlyHint: false, destructiveHint: false }
	},
	{
		name: 'save_checkpoint',
		description: 'Save exact sampled view/cycle state for later restoration.',
		inputSchema: queryObject({ label: { type: 'string', maxLength: 100 } }, ['label']),
		annotations: { readOnlyHint: false, destructiveHint: false }
	},
	{
		name: 'restore_checkpoint',
		description:
			'Restore a saved exact checkpoint, with acknowledged browser execution. Do not invent snapshot coordinates or IDs.',
		inputSchema: queryObject(
			{ id: { type: 'string' }, expectedRevision: { type: 'integer', minimum: 0 } },
			['id', 'expectedRevision']
		),
		annotations: { readOnlyHint: false, destructiveHint: false }
	}
];
