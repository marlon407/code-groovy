import * as assert from 'assert';
import * as zlib from 'zlib';
import { classEntryToFqn, listClassFqnsFromZipBuffer } from '../../groovy/jar_class_scanner';

suite('jar_class_scanner', () => {
	test('converts class entries to FQNs and skips inner/META-INF types', () => {
		assert.strictEqual(classEntryToFqn('grails/validation/Validateable.class'), 'grails.validation.Validateable');
		assert.strictEqual(classEntryToFqn('grails/validation/Validateable$1.class'), undefined);
		assert.strictEqual(classEntryToFqn('META-INF/versions/11/Foo.class'), undefined);
		assert.strictEqual(classEntryToFqn('module-info.class'), undefined);
		assert.strictEqual(classEntryToFqn('README.txt'), undefined);
	});

	test('reads top-level class names from a minimal JAR buffer', () => {
		const jar = buildZip([
			'grails/validation/Validateable.class',
			'grails/validation/Validateable$Inner.class',
			'com/demo/Person.class',
			'META-INF/MANIFEST.MF'
		]);
		assert.deepStrictEqual(listClassFqnsFromZipBuffer(jar).sort(), [
			'com.demo.Person',
			'grails.validation.Validateable'
		]);
	});
});

function buildZip(entryNames: string[]): Buffer {
	const locals: Buffer[] = [];
	const centrals: Buffer[] = [];
	let offset = 0;

	for (const name of entryNames) {
		const nameBuf = Buffer.from(name, 'utf8');
		const data = Buffer.alloc(0);
		const crc = zlib.crc32(data);
		const local = Buffer.alloc(30 + nameBuf.length);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(nameBuf.length, 26);
		nameBuf.copy(local, 30);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(data.length, 18);
		local.writeUInt32LE(data.length, 22);

		const central = Buffer.alloc(46 + nameBuf.length);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(nameBuf.length, 28);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(data.length, 20);
		central.writeUInt32LE(data.length, 24);
		central.writeUInt32LE(offset, 42);
		nameBuf.copy(central, 46);

		locals.push(Buffer.concat([local, data]));
		centrals.push(central);
		offset += local.length + data.length;
	}

	const localPart = Buffer.concat(locals);
	const centralPart = Buffer.concat(centrals);
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt16LE(entryNames.length, 8);
	eocd.writeUInt16LE(entryNames.length, 10);
	eocd.writeUInt32LE(centralPart.length, 12);
	eocd.writeUInt32LE(localPart.length, 16);
	return Buffer.concat([localPart, centralPart, eocd]);
}

export { buildZip };
