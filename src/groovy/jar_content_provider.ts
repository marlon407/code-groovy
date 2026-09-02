import * as fs from 'fs';
import { inflateRawSync } from 'zlib';
import * as vscode from 'vscode';

/**
 * Lets the editor open jar:file://...!/entry locations returned by go-to-definition.
 */
export function registerJarContentProvider(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider('jar', {
			provideTextDocumentContent(uri: vscode.Uri): string {
				const parsed = parseJarDocumentUri(uri);
				if (!parsed) {
					return '// Could not parse JAR URI.\n';
				}

				if (parsed.entryPath.endsWith('.java') || parsed.entryPath.endsWith('.groovy')) {
					const bytes = readZipEntry(parsed.jarPath, parsed.entryPath);
					if (bytes) {
						return Buffer.from(bytes).toString('utf8');
					}
					return [
						`// ${parsed.entryPath}`,
						'// Source entry could not be read from the JAR.',
						`// JAR: ${parsed.jarPath}`
					].join('\n');
				}

				if (parsed.entryPath.endsWith('.class')) {
					const bytes = readZipEntry(parsed.jarPath, parsed.entryPath);
					const fqn = parsed.entryPath.slice(0, -'.class'.length).replace(/\//g, '.');
					const lines = [
						`// ${fqn}`,
						`// JAR: ${parsed.jarPath}`,
						'//',
						'// No -sources.jar in local Gradle cache for this dependency.',
						'// Install the "Extension Pack for Java" for decompiled .class view,',
						'// or download sources in the project:',
						'//   ./gradlew :web:dependencies --configuration compileClasspath',
						'//',
						bytes
							? `// Class file size: ${bytes.length} bytes (bytecode only).`
							: '// Class entry could not be read from the JAR.'
					];
					return lines.join('\n');
				}

				const bytes = readZipEntry(parsed.jarPath, parsed.entryPath);
				return bytes ? Buffer.from(bytes).toString('utf8') : '';
			}
		})
	);
}

export function parseJarDocumentUri(uri: vscode.Uri): { jarPath: string; entryPath: string } | undefined {
	const fromPath = parseJarPath(uri.path);
	if (fromPath) {
		return fromPath;
	}
	return parseJarPath(uri.toString().replace(/^jar:/, ''));
}

function parseJarPath(raw: string): { jarPath: string; entryPath: string } | undefined {
	const decoded = decodeURIComponent(raw);
	const bang = decoded.indexOf('!');
	if (bang < 0) {
		return undefined;
	}
	let jarPath = decoded.slice(0, bang);
	let entryPath = decoded.slice(bang + 1);
	if (entryPath.startsWith('/')) {
		entryPath = entryPath.slice(1);
	}
	if (jarPath.startsWith('file://')) {
		jarPath = jarPath.slice('file://'.length);
	}
	if (jarPath.startsWith('//')) {
		jarPath = jarPath.slice(1);
	}
	if (!jarPath || !entryPath) {
		return undefined;
	}
	return { jarPath, entryPath };
}

function readZipEntry(jarPath: string, entryPath: string): Buffer | undefined {
	if (!fs.existsSync(jarPath)) {
		return undefined;
	}
	const buf = fs.readFileSync(jarPath);
	const eocd = findEndOfCentralDirectory(buf);
	if (!eocd) {
		return undefined;
	}
	const totalEntries = buf.readUInt16LE(eocd + 10);
	let offset = buf.readUInt32LE(eocd + 16);
	for (let i = 0; i < totalEntries; i++) {
		if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== 0x02014b50) {
			break;
		}
		const compression = buf.readUInt16LE(offset + 10);
		const compressedSize = buf.readUInt32LE(offset + 20);
		const uncompressedSize = buf.readUInt32LE(offset + 24);
		const fileNameLength = buf.readUInt16LE(offset + 28);
		const extraLength = buf.readUInt16LE(offset + 30);
		const commentLength = buf.readUInt16LE(offset + 32);
		const localHeaderOffset = buf.readUInt32LE(offset + 42);
		const fileName = buf.toString('utf8', offset + 46, offset + 46 + fileNameLength);
		offset += 46 + fileNameLength + extraLength + commentLength;
		if (fileName !== entryPath) {
			continue;
		}
		const localNameLength = buf.readUInt16LE(localHeaderOffset + 26);
		const localExtraLength = buf.readUInt16LE(localHeaderOffset + 28);
		const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
		if (compression === 0) {
			return buf.subarray(dataStart, dataStart + uncompressedSize);
		}
		if (compression === 8) {
			try {
				return inflateRawSync(buf.subarray(dataStart, dataStart + compressedSize));
			} catch {
				return undefined;
			}
		}
		return undefined;
	}
	return undefined;
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
