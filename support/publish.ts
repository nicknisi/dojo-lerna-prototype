import { join, resolve } from 'path';
import { awaitProcess, isProcessError, runAsPromise, spawnCommand } from './utils/process';
import { prepackage } from './prepackage';
import Set from '../packages/shim/src/Set';

const binDir = join(__dirname, '..', 'node_modules', '.bin');
const packageDir = join(__dirname, '..', 'packages');
const lernaBin = resolve(binDir, 'lerna');

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
	forcePublish: string;
	pushGit: boolean;
	releaseVersion: string;
	skipTest: boolean;
}

/**
 * Publish flow
 */
export async function publish(options: Options) {
	const doGitPush = options.pushGit && !options.dryRun;

	try {
		const updatedPackages = await (options.forcePublish ? getPackages(options.forcePublish) : getUpdatedPackages());

		if (!updatedPackages.length) {
			console.log("No packages to publish.");
			process.exitCode = 1;
			return;
		}

		// TODO add check to see if they're logged in to npm before we do this long process
		await lernaPublish(options);

		const releaseVersion = assertReleaseVersion(updatedPackages);
		if (!options.dryRun) {
			await assertGitTag(`v${ releaseVersion }`);
		}
		await buildDist(updatedPackages, options.skipTest);
		for (let { name } of updatedPackages) {
			await prepackage(getPackageDirectory(name));
		}
		if (options.dryRun) {
			await buildArtifacts(updatedPackages);
		}
		else {
			await release(updatedPackages, releaseVersion, options);
			if (doGitPush) {
				await pushGit();
			}
		}
		printSummary(updatedPackages, options, releaseVersion);
	}
	catch(e) {
		console.log('error', e);
		throw e;
	}
}

function printSummary(packs: Updated[], options: Options, version: string) {
	console.log('You did great. Just the best. <3');
	if (options.dryRun) {
		console.log(`You did a dry run of ${ packs.length } packages:`);
	}
	else {
		console.log(`You published ${ packs.length } packages at v${ version }:`);
	}
	for (let pack of packs) {
		console.log(pack.name);
	}
	console.log(' ');
	if (!options.dryRun && !options.pushGit) {
		console.log(`Don't forget to push to git`);
		console.log('git push');
		console.log('git push tags');
	}
}

async function getPackages(packageList: string): Promise<Updated[]> {
	const result = (await runAsPromise(lernaBin, [ 'ls', '--json'])).getOutput();
	const allPackages: Updated[] = JSON.parse(result);

	if (packageList === '*') {
		return allPackages;
	}

	const packageNames = new Set(packageList.split(','));
	return allPackages.filter(pack => packageNames.has(pack.name));
}

async function getUpdatedPackages(): Promise<Updated[]> {
	try {
		const updatedPackagesResult = (await runAsPromise(lernaBin, [ 'updated', '--json'])).getOutput();
		return JSON.parse(updatedPackagesResult);
	}
	catch (e) {
		if (isProcessError(e)) {
			// lerna returns a code of `1` if there's no packages to be updated.
			if (e.stdErr.indexOf('No packages need updating')) {
				return [];
			}
		}
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
async function lernaPublish(options: Options) {
	const { releaseVersion, dryRun } = options;

	const passthru = getPassthruOptions(['force-publish'], options);
	const args = [ 'publish', '--skip-npm', '--message', '"Release %s"', ... passthru];
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

function getPassthruOptions(allowed: String[], options: object): string[] {
	const args: string[] = [];
	const passthruOptions = new Set(allowed);
	for (let key in options) {
		if (passthruOptions.has(key)) {
			args.push(`--${ key }`, String((<any> options)[key]));
		}
	}
	return args;
}

/**
 * Builds all of the packages to be published
 */
async function buildDist(packages: Updated[], skipTest: boolean = false) {
	const scope = packages.map(pack => pack.name).join('|');
	// TODO it would be nice to also build and test upstream dependencies
	await runAsPromise(lernaBin, [ 'run', 'clean', '--scope', scope], runToTerminalOptions);
	if (!skipTest) {
		await runAsPromise(lernaBin, [ 'run', 'test', '--scope', scope], runToTerminalOptions);
	}
	await runAsPromise(lernaBin, [ 'run', 'dist', '--scope', scope], runToTerminalOptions);
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
async function release(updatedPackages: Updated[], releaseVersion: string, options: Options) {
	const passthru = getPassthruOptions(['registry'], options);
	for (let { name } of updatedPackages) {
		const sourcePath = join(packageDir, getPackageDirectory(name), 'dist', 'release');
		const args = ['publish', sourcePath, '--access', 'public', ... passthru];

		console.log(`Publishing artifact in ${ sourcePath }`);
		await runAsPromise('npm', args, {
			... runToTerminalOptions
		});
	}
}

async function pushGit() {
	await runAsPromise('git', [ 'push' ], runToTerminalOptions);
	await runAsPromise('git', [ 'push', '--tags' ], runToTerminalOptions);
}
