import { join, resolve } from 'path';
import * as yargs from 'yargs';
import { awaitProcess, runAsPromise, spawnCommand } from './process';

const binDir = join(__dirname, '..', 'node_modules', '.bin');
const packageDir = join(__dirname, '..', 'packages');
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

interface Updated {
	name: string;
	version: string;
	private: boolean;
}

const runToTerminalOptions = Object.freeze({
	stdio: [ null, process.stdout, process.stdin ]
});

async function publish() {
	const updatedPackagesResult = (await runAsPromise(lernaBin, [ 'updated', '--json'])).getOutput();
	const updatedPackages: Updated[] = JSON.parse(updatedPackagesResult);

	try {
		await lernaPublish();
		await prebuildChecks(updatedPackages);
		await build();
		await publishToNpm();
		await pushGit();
		console.log(`published ${ updatedPackages.map((pack) => pack.name ).join(', ')}`)
	}
	catch(e) {
		console.log('error', e);
		throw e;
	}
}

/**
 * Use lerna to publish a new release
 *
 * 1. Prompts the user for a version
 * 2. Updates package.json version
 * 3. Creates a git commit
 * 4. tags the commit
 */
async function lernaPublish() {
	const args = [ 'publish', '--skip-npm', '--message', '"Release %s"'];
	if (argv.releaseVersion) {
		args.push(`--repo-version=${ argv.releaseVersion }`);
	}
	const command = spawnCommand(lernaBin, args, {
		stdio: [ process.stdin, process.stdout, process.stderr ]
	});

	return await awaitProcess(command);
}

/**
 * Ensure all packages being released have
 *
 * 1. Had their package.json versions updated to match
 * 2. There is a matching git tag (--dry-run on the command line will skip this check)
 */
async function prebuildChecks(updatedPackages: Updated[]) {
	const versions = updatedPackages.map((pack) => {
		const name = pack.name.substr(pack.name.indexOf('/'));
		const packageJsonPath = join(packageDir, name, 'package.json');
		const packagejson = require(packageJsonPath);
		return packagejson.version;
	});

	const releaseVersion = versions[0];
	for (let version of versions) {
		if (version !== releaseVersion) {
			throw new Error(`Version mismatch. Expected ${ releaseVersion }. Saw ${ version }.`);
		}
	}

	if (!argv.dryRun) {
		await runAsPromise('git', [ 'describe', '--tags', `v${ releaseVersion }` ], runToTerminalOptions);
	}
}

/**
 * Builds all of the packages to be published
 */
async function build() {
	await runAsPromise(lernaBin, [ 'run', 'clean', '--since', baseBranch], runToTerminalOptions);
	if (!argv.skipTest) {
		await runAsPromise(lernaBin, [ 'run', 'test', '--since', baseBranch], runToTerminalOptions);
	}
	await runAsPromise(lernaBin, [ 'run', 'dist', '--since', baseBranch], runToTerminalOptions);
}

async function publishToNpm() {
	// TODO publish package
}

async function pushGit() {
	// TODO commit this change
	// TODO git push && git push --tags
}

publish();
