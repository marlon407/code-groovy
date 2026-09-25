import { CallSiteRecord } from './call_site_extractor';

export class CallSiteIndexStore {
	private readonly byMethodName = new Map<string, CallSiteRecord[]>();

	add(records: CallSiteRecord[]): void {
		for (const record of records) {
			const list = this.byMethodName.get(record.methodName) ?? [];
			list.push(record);
			this.byMethodName.set(record.methodName, list);
		}
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
}
