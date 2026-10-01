import * as THREE from 'three';

export interface FlowBoundaryLabel {
	id: string;
	text: string;
	color: string;
	anchors: readonly THREE.Vector3[];
	visible: boolean;
}

/** Three boundary annotations, anchored to the model rather than floating in a fixed corner. */
export class V12FlowLabels {
	private readonly elements = new Map<string, HTMLDivElement>();
	private readonly point = new THREE.Vector3();
	constructor(private readonly host: HTMLDivElement) {}
	update(
		labels: readonly FlowBoundaryLabel[],
		camera: THREE.Camera,
		width: number,
		height: number,
		visible: boolean
	) {
		for (const element of this.elements.values()) element.style.display = 'none';
		if (!visible) return;
		const occupied: { x: number; y: number }[] = [];
		for (const label of labels) {
			if (!label.visible) continue;
			const anchors = [...label.anchors].sort(
				(a, b) => a.distanceToSquared(camera.position) - b.distanceToSquared(camera.position)
			);
			for (const anchor of anchors) {
				this.point.copy(anchor).project(camera);
				const x = ((this.point.x + 1) * width) / 2 + 10;
				const y = ((1 - this.point.y) * height) / 2 - 26;
				if (
					this.point.z < -1 ||
					this.point.z > 1 ||
					x < 76 ||
					x > width - 150 ||
					y < 62 ||
					y > height - 180
				)
					continue;
				if (occupied.some((p) => Math.abs(x - p.x) < 140 && Math.abs(y - p.y) < 28)) continue;
				let element = this.elements.get(label.id);
				if (!element) {
					element = document.createElement('div');
					element.className = 'flow-boundary-label';
					element.dataset.flowBoundary = label.id;
					element.style.cssText =
						'position:absolute;left:0;top:0;z-index:3;pointer-events:none;white-space:nowrap;font-family:inherit;font-size:12px;font-weight:500;line-height:20px;padding:0 5px 4px 8px;border-left:1px solid;border-bottom:1px solid;border-color:currentColor;text-shadow:0 1px 3px #10161c,0 0 6px #10161c;background:linear-gradient(90deg,#10161cc4,transparent);';
					this.host.append(element);
					this.elements.set(label.id, element);
				}
				element.textContent = label.text;
				element.style.color = label.color;
				element.style.display = 'block';
				element.style.transform = `translate(${x}px,${y}px)`;
				occupied.push({ x, y });
				break;
			}
		}
	}
	dispose() {
		for (const element of this.elements.values()) element.remove();
		this.elements.clear();
	}
}
