import { CallSiteRecord } from './call_site_extractor';

export class CallSiteIndexStore {
	private readonly byMethodName = new Map<string, CallSiteRecord[]>();
	private readonly byReceiverName = new Map<string, CallSiteRecord[]>();
	private readonly filesByTypeMention = new Map<string, number[]>();
	private readonly filePaths: string[] = [];
	private ready = false;

	add(records: CallSiteRecord[]): void {
		for (const record of records) {
			const list = this.byMethodName.get(record.methodName) ?? [];
			list.push(record);
			this.byMethodName.set(record.methodName, list);

			if (record.receiverName) {
				const byReceiver = this.byReceiverName.get(record.receiverName) ?? [];
				byReceiver.push(record);
				this.byReceiverName.set(record.receiverName, byReceiver);
			}
		}
		this.ready = true;
	}

	addTypeMentions(sourcePath: string, typeNames: string[]): void {
		const fileId = this.filePaths.push(sourcePath) - 1;
		for (const typeName of typeNames) {
			const files = this.filesByTypeMention.get(typeName) ?? [];
			files.push(fileId);
			this.filesByTypeMention.set(typeName, files);
		}
	}

	clear(): void {
		this.byMethodName.clear();
		this.byReceiverName.clear();
		this.filesByTypeMention.clear();
		this.filePaths.length = 0;
	}

	lookup(methodName: string): CallSiteRecord[] {
		return this.byMethodName.get(methodName) ?? [];
	}

	lookupByReceiver(receiverName: string): CallSiteRecord[] {
		return this.byReceiverName.get(receiverName) ?? [];
	}

	filesMentioning(typeName: string): string[] {
		return (this.filesByTypeMention.get(typeName) ?? []).map(fileId => this.filePaths[fileId]);
	}

	isReady(): boolean {
		return this.ready;
	}
}
