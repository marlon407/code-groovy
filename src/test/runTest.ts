import * as path from 'path';

import { runTests } from '@vscode/test-electron';

async function main() {
	try {
		// Cursor/VS Code set this when the integrated terminal is an Electron child.
		// If inherited, the downloaded Code binary runs as Node and rejects Electron flags.
		delete process.env.ELECTRON_RUN_AS_NODE;

		const extensionDevelopmentPath = path.resolve(__dirname, '../../');
		const extensionTestsPath = path.resolve(__dirname, './suite/index');

		await runTests({ extensionDevelopmentPath, extensionTestsPath });
	} catch (err) {
		console.error('Failed to run tests');
		process.exit(1);
	}
}

main();
