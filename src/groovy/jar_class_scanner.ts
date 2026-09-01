import * as fs from 'fs';

/**
 * Lists top-level class FQNs from a JAR/ZIP by reading the central directory.
 * Skips inner classes (`Foo$Bar`), directories, and non-.class entries.
 */
export function listClassFqnsFromJar(jarPath: string): string[] {
	const buf = fs.readFileSync(jarPath);
	return listClassFqnsFromZipBuffer(buf);
}

export function listClassFqnsFromZipBuffer(buf: Buffer): string[] {
	const eocd = findEndOfCentralDirectory(buf);
	if (!eocd) {
		return [];
	}

	const totalEntries = buf.readUInt16LE(eocd + 10);
	let offset = buf.readUInt32LE(eocd + 16);
	const fqns: string[] = [];

	for (let i = 0; i < totalEntries; i++) {
		if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== 0x02014b50) {
			break;
		}
		const fileNameLength = buf.readUInt16LE(offset + 28);
		const extraLength = buf.readUInt16LE(offset + 30);
		const commentLength = buf.readUInt16LE(offset + 32);
		const fileName = buf.toString('utf8', offset + 46, offset + 46 + fileNameLength);
		offset += 46 + fileNameLength + extraLength + commentLength;

		const fqn = classEntryToFqn(fileName);
		if (fqn) {
			fqns.push(fqn);
		}
	}

	return fqns;
}

/** Pure helper for tests — converts a zip entry path to FQN. */
export function classEntryToFqn(entryName: string): string | undefined {
	if (!entryName.endsWith('.class')) {
		return undefined;
	}
	if (entryName.startsWith('META-INF/') || entryName === 'module-info.class') {
		return undefined;
	}
	const withoutExt = entryName.slice(0, -'.class'.length);
	if (withoutExt.includes('$')) {
		return undefined;
	}
	if (!/^[A-Za-z_]\w*(?:\/[A-Za-z_]\w*)*$/.test(withoutExt)) {
		return undefined;
	}
	return withoutExt.replace(/\//g, '.');
}

function findEndOfCentralDirectory(buf: Buffer): number | undefined {
	// EOCD is at least 22 bytes; comment can make it longer. Search backwards.
	const min = Math.max(0, buf.length - (0xffff + 22));
	for (let i = buf.length - 22; i >= min; i--) {
		if (buf.readUInt32LE(i) === 0x06054b50) {
			return i;
		}
	}
	return undefined;
}
