import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ContentTransform, copy, glob, parseWithFullExtension } from './utils/file';

interface Profile {
	dest: string;
	flat: boolean;
	packageJson: boolean;
}

const licensePath = join(__dirname, '..', 'LICENSE');

const profiles: { [ key: string ]: Profile } = {
	dev: {
		dest: 'dev',
		flat: false,
		packageJson: false
	},
	release: {
		dest: 'release',
		flat: false,
		packageJson: true
	}
};

const extensionMapByDir: { [key: string]: { [key: string]: string } } = {
	esm: {
		'.js': '.mjs',
		'.js.map': '.mjs.map'
	}
};

const contentTransformsByDir: { [key: string]: { [key: string]: ContentTransform } } = {
	esm: {
		['.mjs'](contents: string): string {
			return contents.replace(/(\/\/.*sourceMappingURL=.*?)(\.js\.map)/g, '$1.mjs.map');
		},
		['.mjs.map'](contents: string): string {
			const json = JSON.parse(contents);

			if (json.file) {
				json.file = json.file.replace(/\.js$/g, '.mjs');
			}

			return JSON.stringify(json);
		}
	}
};

export async function prepackage(packageName: string, profileName: string = 'release') {
	const { dest: destDir, flat, packageJson } = profiles[profileName];
	const packagePath = join(__dirname, '..', 'packages', packageName);
	const distPath = join(packagePath, 'dist');
	const sources = findDistSubDirectories(distPath);

	console.log(`Running prepackage scripts for "${ packageName }"`);

	const destDirFullPath = join(distPath, destDir);
	console.log(`processing ${ destDirFullPath }`);

	for (let sourceDir of sources) {
		const sourceDirFullPath = flat ? join(packagePath, 'dist', sourceDir, 'src') : join(packagePath, 'dist', sourceDir);
		const extensionMap = extensionMapByDir[sourceDir] || {};
		const transformMap = contentTransformsByDir[sourceDir] || {};

		for (let file of glob(sourceDirFullPath)) {
			const sourceFile = join(sourceDirFullPath, file);
			const parsed = parseWithFullExtension(file);

			if (extensionMap[parsed.extension]) {
				parsed.extension = extensionMap[parsed.extension];
			}

			const destFile = join(destDirFullPath, parsed.path, parsed.file + parsed.extension);

			copy(sourceFile, destFile, transformMap[parsed.extension]);
		}
	}

	if (packageJson) {
		copyDistroFiles(destDirFullPath, packagePath);
	}
}

function copyDistroFiles(destDirFullPath: string, packagePath: string) {
	const packageJsonPath = join(packagePath, 'package.json');
	const packageJson = JSON.parse(readFileSync(packageJsonPath).toString());
	['private', 'scripts', 'files'].forEach((k) => delete packageJson[k]);

	writeFileSync(join(destDirFullPath, 'package.json'), JSON.stringify(packageJson, undefined, 4));

	copyFile(licensePath, join(destDirFullPath, 'LICENSE'));
	copyFile(join(packagePath, 'README.md'), join(destDirFullPath, 'README.md'));
}

function copyFile(filePath: string, destination: string) {
	if (existsSync(filePath)) {
		writeFileSync(destination, readFileSync(filePath));
	}
}

/**
 * Find all directories in dist
 */
function findDistSubDirectories(distPath: string) {
	return readdirSync(distPath)
		.filter((file) => {
			for (let key in profiles) {
				const dir = profiles[key].dest;
				if (file.indexOf(dir)) {
					return false;
				}
			}

			return statSync(join(distPath, file)).isDirectory();
		});
}
