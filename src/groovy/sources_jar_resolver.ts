import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export function sourcesJarForMainJar(jarPath: string): string | undefined {
	const sameDir = sourcesJarBesideMainJar(jarPath);
	if (sameDir) {
		return sameDir;
	}
	return sourcesJarInGradleModuleCache(jarPath);
}

function sourcesJarBesideMainJar(jarPath: string): string | undefined {
	const dir = path.dirname(jarPath);
	const fileName = path.basename(jarPath);
	if (!fileName.endsWith('.jar') || fileName.endsWith('-sources.jar')) {
		return undefined;
	}
	const base = fileName.slice(0, -'.jar'.length);
	const candidates = [
		path.join(dir, `${base}-sources.jar`),
		path.join(dir, fileName.replace('.jar', '-sources.jar'))
	];
	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}
	return undefined;
}

/** Gradle stores main and sources JARs in different content-hash subfolders. */
function sourcesJarInGradleModuleCache(jarPath: string): string | undefined {
	const normalized = jarPath.replace(/\\/g, '/');
	const match = normalized.match(
		/\.gradle\/caches\/modules-2\/files-2\.1\/([^/]+)\/([^/]+)\/([^/]+)\//
	);
	if (!match) {
		return undefined;
	}
	const [, group, artifact, version] = match;
	const moduleDir = path.join(
		os.homedir(),
		'.gradle/caches/modules-2/files-2.1',
		group,
		artifact,
		version
	);
	if (!fs.existsSync(moduleDir)) {
		return undefined;
	}
	const wanted = `${artifact}-${version}-sources.jar`;
	try {
		for (const entry of fs.readdirSync(moduleDir, { withFileTypes: true })) {
			if (!entry.isDirectory()) {
				continue;
			}
			const candidate = path.join(moduleDir, entry.name, wanted);
			if (fs.existsSync(candidate)) {
				return candidate;
			}
		}
	} catch {
		return undefined;
	}
	return undefined;
}

export function sourceEntryPathForFqn(fqn: string, extension: 'java' | 'groovy'): string {
	return `${fqn.replace(/\./g, '/')}.${extension}`;
}

export function findSourceEntryInJar(sourcesJarPath: string, fqn: string): string | undefined {
	if (!fs.existsSync(sourcesJarPath)) {
		return undefined;
	}
	const buf = fs.readFileSync(sourcesJarPath);
	const entries = listEntriesFromZip(buf);
	for (const ext of ['java', 'groovy'] as const) {
		const wanted = sourceEntryPathForFqn(fqn, ext);
		if (entries.has(wanted)) {
			return wanted;
		}
	}
	return undefined;
}

export function findClassEntryInJar(jarPath: string, fqn: string): string | undefined {
	if (!fs.existsSync(jarPath)) {
		return undefined;
	}
	const buf = fs.readFileSync(jarPath);
	const entries = listEntriesFromZip(buf);
	const wanted = `${fqn.replace(/\./g, '/')}.class`;
	return entries.has(wanted) ? wanted : undefined;
}

export function resolveJarTypeDefinition(jarPath: string, fqn: string): { uri: string; entryPath: string } | undefined {
	const sourcesJar = sourcesJarForMainJar(jarPath);
	if (sourcesJar) {
		const sourceEntry = findSourceEntryInJar(sourcesJar, fqn);
		if (sourceEntry) {
			return { uri: buildJarSourceUri(sourcesJar, sourceEntry), entryPath: sourceEntry };
		}
	}
	const classEntry = findClassEntryInJar(jarPath, fqn);
	if (classEntry) {
		return { uri: buildJarSourceUri(jarPath, classEntry), entryPath: classEntry };
	}
	return undefined;
}

function listEntriesFromZip(buf: Buffer): Set<string> {
	const entries = new Set<string>();
	const eocd = findEndOfCentralDirectory(buf);
	if (!eocd) {
		return entries;
	}
	const totalEntries = buf.readUInt16LE(eocd + 10);
	let offset = buf.readUInt32LE(eocd + 16);
	for (let i = 0; i < totalEntries; i++) {
		if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== 0x02014b50) {
			break;
		}
		const fileNameLength = buf.readUInt16LE(offset + 28);
		const extraLength = buf.readUInt16LE(offset + 30);
		const commentLength = buf.readUInt16LE(offset + 32);
		const fileName = buf.toString('utf8', offset + 46, offset + 46 + fileNameLength);
		offset += 46 + fileNameLength + extraLength + commentLength;
		entries.add(fileName);
	}
	return entries;
}

function findEndOfCentralDirectory(buf: Buffer): number | undefined {
	const min = Math.max(0, buf.length - (0xffff + 22));
	for (let i = buf.length - 22; i >= min; i--) {
		if (buf.readUInt32LE(i) === 0x06054b50) {
			return i;
		}
	}
	return undefined;
}

export function buildJarSourceUri(jarPath: string, entryPath: string): string {
	const normalized = path.resolve(jarPath).replace(/\\/g, '/');
	return `jar:file:///${normalized}!/${entryPath}`;
}
