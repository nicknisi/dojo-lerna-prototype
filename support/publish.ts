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
	'skip-test': {
		boolean: true,
		describe: 'skip running tests as part of the release'
	},
	'release-version': {
		string: true,
		describe: 'release version'
	}
}).argv;
const baseBranch = 'master';

interface runAsPromise {
	(command: string, args: string[], options: any): Promise<any>;
}

interface Updated {
	name: string;
	version: string;
	private: boolean;
}

async function publish() {
	const updatedPackages: Updated[] = JSON.parse(await runAsPromise(lernaBin, [ 'updated', '--json']));
	await lernaPublish();

	await build();
	await publishToNpm();
	await updateWorkingVersion();
	await pushGit();
	console.log(updatedPackages);
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

async function build() {
	await runAsPromise(lernaBin, [ 'run', 'clean', '--since', baseBranch]);
	if (!argv.skipTest) {
		await runAsPromise(lernaBin, [ 'run', 'test', '--since', baseBranch]);
	}
	await runAsPromise(lernaBin, [ 'run', 'dist', '--since', baseBranch]);
}

async function publishToNpm() {
	// TODO publish package
}

async function updateWorkingVersion() {
	if (baseBranch === 'master') {
		// TODO update package.json to x.x.(x+1)-pre,
	}
}

async function pushGit() {
	// TODO commit this change
	// TODO git push && git push --tags
}

publish();
