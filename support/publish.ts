import { join, resolve } from 'path';
import { awaitProcess, runAsPromise, spawnCommand } from './utils/process';
import { prepackage } from './prepackage';

const binDir = join(__dirname, '..', 'node_modules', '.bin');
const packageDir = join(__dirname, '..', 'packages');
const lernaBin = resolve(binDir, 'lerna');

const baseBranch = 'master';

interface Updated {
	name: string;
	version: string;
	private: boolean;
}

const runToTerminalOptions = Object.freeze({
	stdio: [ null, process.stdout, process.stdin ]
});

export interface Options {
	dryRun: boolean;
	releaseVersion: string;
	skipTest: boolean;
}

/**
 * Publish flow
 */
export async function publish(options: Options) {
	const updatedPackagesResult = (await runAsPromise(lernaBin, [ 'updated', '--json'])).getOutput();
	const updatedPackages: Updated[] = JSON.parse(updatedPackagesResult);

	try {
		// TODO add check to see if they're logged in to npm
		await lernaPublish(options);
		const releaseVersion = assertReleaseVersion(updatedPackages);
		if (!options.dryRun) {
			await assertGitTag(`v${ releaseVersion }`);
		}
		await buildDist(options.skipTest);
		for (let { name } of updatedPackages) {
			await prepackage(getPackageDirectory(name));
		}
		if (options.dryRun) {
			await buildArtifacts(updatedPackages);
		}
		else {
			await release(updatedPackages, releaseVersion);
			await pushGit();
		}
		console.log(`published ${ updatedPackages.map((pack) => pack.name ).join(', ')}`)
	}
	catch(e) {
		console.log('error', e);
		throw e;
	}
}

function getPackageDirectory(packageName: string) {
	return packageName.substr(packageName.indexOf('/'));
}

/**
 * Asserts that all package versions match
 * @return the release version
 */
function assertReleaseVersion(updatedPackages: Updated[]): string {
	const versions = updatedPackages.map((pack) => {
		const name = getPackageDirectory(pack.name);
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
	return releaseVersion;
}

/**
 * Resolves a promise if the provided git tag exists locally
 */
function assertGitTag(tag: string) {
	return runAsPromise('git', [ 'describe', '--tags', tag ], runToTerminalOptions);
}

/**
 * Use lerna to publish a new release
 *
 * 1. Prompts the user for a version
 * 2. Updates package.json version
 * 3. Creates a git commit (if not a dry run)
 * 4. tags the commit (if not a dry run)
 */
async function lernaPublish({ releaseVersion, dryRun }: Options) {
	const args = [ 'publish', '--skip-npm', '--message', '"Release %s"'];
	if (releaseVersion) {
		args.push(`--repo-version=${ releaseVersion }`);
	}
	if (dryRun) {
		args.push('--skip-git');
	}
	const command = spawnCommand(lernaBin, args, {
		stdio: [ process.stdin, process.stdout, process.stderr ]
	});

	return await awaitProcess(command);
}

/**
 * Builds all of the packages to be published
 */
async function buildDist(skipTest: boolean = false) {
	await runAsPromise(lernaBin, [ 'run', 'clean', '--since', baseBranch], runToTerminalOptions);
	if (!skipTest) {
		await runAsPromise(lernaBin, [ 'run', 'test', '--since', baseBranch], runToTerminalOptions);
	}
	await runAsPromise(lernaBin, [ 'run', 'dist', '--since', baseBranch], runToTerminalOptions);
}

/**
 * Builds artifacts of the updated packages
 */
async function buildArtifacts(updatedPackages: Updated[]) {
	for (let { name } of updatedPackages) {
		const destination = join(packageDir, getPackageDirectory(name), 'dist');
		const sourcePath = join(packageDir, getPackageDirectory(name), 'dist', 'release');
		console.log(`Building artifact in ${ sourcePath }`);
		await runAsPromise('npm', [ 'pack', sourcePath ], {
			cwd: destination,
			... runToTerminalOptions
		});
	}
}

/**
 * Publishes to npm
 *
 * TODO make more robust like https://github.com/dojo/scripts/blob/master/src/release.ts
 * TODO test release against a private repository
 */
async function release(updatedPackages: Updated[], releaseVersion: string) {
	for (let { name } of updatedPackages) {
		const sourcePath = join(packageDir, getPackageDirectory(name), 'dist', 'release');
		console.log(`Building artifact in ${ sourcePath }`);
		await runAsPromise('npm', ['publish', sourcePath, '--tag', releaseVersion, '--access', 'public'], {
			... runToTerminalOptions
		});
	}
}

async function pushGit() {
	await runAsPromise('git', [ 'push' ], runToTerminalOptions);
	await runAsPromise('git', [ 'push', '--tags' ], runToTerminalOptions);
}
