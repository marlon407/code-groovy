export type IndexPhase = 'idle' | 'source' | 'classpath-resolve' | 'classpath-jars' | 'ready' | 'warning' | 'error';

const SOURCE_WEIGHT = 35;
const RESOLVE_WEIGHT = 10;
const JAR_WEIGHT = 55;

export function formatIndexCount(value: number): string {
	if (value >= 10_000) {
		return `${Math.round(value / 1000)}k`;
	}
	if (value >= 1000) {
		return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
	}
	return String(value);
}

export function computeIndexPercent(
	phase: IndexPhase,
	sourceDone: number,
	sourceTotal: number,
	jarDone: number,
	jarTotal: number
): number {
	if (phase === 'source' && sourceTotal > 0) {
		return Math.min(SOURCE_WEIGHT, Math.round((sourceDone / sourceTotal) * SOURCE_WEIGHT));
	}
	if (phase === 'classpath-resolve') {
		return SOURCE_WEIGHT + Math.floor(RESOLVE_WEIGHT / 2);
	}
	if (phase === 'classpath-jars' && jarTotal > 0) {
		const jarPart = Math.round((jarDone / jarTotal) * JAR_WEIGHT);
		return Math.min(100, SOURCE_WEIGHT + RESOLVE_WEIGHT + jarPart);
	}
	if (phase === 'ready') {
		return 100;
	}
	return 0;
}
