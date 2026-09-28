import { CallSiteRecord } from './call_site_extractor';

export class CallSiteIndexStore {
	private readonly byMethodName = new Map<string, CallSiteRecord[]>();
	private ready = false;

	add(records: CallSiteRecord[]): void {
		for (const record of records) {
			const list = this.byMethodName.get(record.methodName) ?? [];
			list.push(record);
			this.byMethodName.set(record.methodName, list);
		}
		this.ready = true;
	}

	clear(): void {
		this.byMethodName.clear();
	}

	lookup(methodName: string, receiverName?: string): CallSiteRecord[] {
		const all = this.byMethodName.get(methodName) ?? [];
		if (!receiverName) {
			return all;
		}
		return all.filter(record => record.receiverName === receiverName);
	}

	isReady(): boolean {
		return this.ready;
	}
}
