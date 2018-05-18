import { join, resolve } from 'path';
import * as yargs from 'yargs';

const runAsPromise = require('@dojo/scripts/utils/process').runAsPromise;

const binDir = join(__dirname, '..', 'node_modules', '.bin');
const lernaBin = resolve(binDir, 'lerna');
const argv: any = yargs.option({
	'dry-run': {
		boolean: true,
		describe: 'do not publish to NPM or push git'
	},
	'release-version': {
		string: true,
		describe: 'release version'
	}
}).argv;

interface runAsPromise {
	(command: string, args: string[], options: any): Promise<any>;
}

interface Updated {
	name: string;
	version: string;
	private: boolean;
}

async function publish() {
	const updatedPackages: Updated = JSON.parse(await runAsPromise(lernaBin, [ 'updated', '--json']));
	await lernaPublish();

	for (let updatedPackage in updatedPackages) {
		await publishToNpm(updatedPackage);
	}
}

function lernaPublish() {
	const args = [ 'publish', '--skip-npm', '--message', '"Release %s"'];
	if (argv.releaseVersion) {
		args.push(`--repo-version=${ argv.releaseVersion }`);
	}
	return runAsPromise(lernaBin, args, {
		stdio: [ process.stdin, process.stdout, process.stderr ]
	});
}

async function publishToNpm(packageName: string) {
	await runAsPromise(lernaBin, [ 'test' ])
	// TODO clean package
	// TODO build package
	// TODO test package
	// TODO publish package
	// TODO update package.json to x.x.x-pre,
	// TODO commit this change
	// TODO git push && git push --tags
}

publish();
