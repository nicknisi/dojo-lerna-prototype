import * as yargs from 'yargs';
import { publish } from '../publish';

interface Arguments {
	dryRun: boolean;
	forcePublish: string;
	pushGit: boolean;
	skipTest: boolean;
	releaseVersion: string;
}

const yargsDefinition = {
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
	},
	'push-git': {
		boolean: true,
		describe: 'automatically push to git after npm publish'
	}
};

const argv: Arguments = yargs.option(yargsDefinition).argv as any;
publish(argv);
