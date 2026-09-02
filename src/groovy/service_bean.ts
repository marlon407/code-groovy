export function serviceBeanToClassName(beanName: string): string | undefined {
	if (!/^[a-z]\w*Service$/.test(beanName)) {
		return undefined;
	}
	return beanName.charAt(0).toUpperCase() + beanName.slice(1);
}

export function candidateClassNamesForReceiver(receiver: string): string[] {
	const names: string[] = [];
	const asService = serviceBeanToClassName(receiver);
	if (asService) {
		names.push(asService);
	}
	if (/^[A-Z]/.test(receiver)) {
		names.push(receiver);
	} else if (/^[a-z]\w*$/.test(receiver)) {
		names.push(receiver.charAt(0).toUpperCase() + receiver.slice(1));
	}
	return [...new Set(names)];
}
