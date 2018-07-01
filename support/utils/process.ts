import { spawn, ChildProcess } from 'child_process';

export class ProcessError extends Error {
	constructor(
		public readonly code: number,
		public readonly stdErr = '',
		public readonly stdOut = ''
	) {
		super(`Error exit code ${ code }`);
	}
}

export function isProcessError(value: any): value is ProcessError {
	return typeof value === "object" && value.stdErr != null && value.stdOut != null && value.hasOwnProperty('code');
}

export function spawnCommand(command: string, args: string[], options: any = {}): ChildProcess {
	return spawn(command, args, {
		shell: true,
		... options
	});
}

export async function awaitProcess(childProcess: ChildProcess) {
	return new Promise<number>((resolve, reject) => {
		childProcess.once('close', (code: number) => {
			if (code <= 0) {
				resolve(code);
			}
			else {
				reject(new ProcessError(code));
			}
		});
	});
}

export function collectOutput(childProcess: ChildProcess) {
	let stderr = '';
	let stdout = '';

	if (childProcess.stdout) {
		childProcess.stdout.setEncoding('utf8');
		childProcess.stdout.on('data', (chunk) => {
			stdout += chunk;
		});
	}

	if (childProcess.stderr) {
		childProcess.stderr.setEncoding('utf8');
		childProcess.stderr.on('data', (chunk) => {
			stderr += chunk;
		});

	}

	return {
		getOutput() {
			return stdout;
		},
		getError() {
			return stderr;
		}
	}
}

export async function runAsPromise(command: string, args: string[], options: any = {}) {
	const process = spawnCommand(command, args, options);
	const output = collectOutput(process);
	let code: number;

	try {
		code = await awaitProcess(process);
	}
	catch (e) {
		const code = 'code' in e ? e.code : 1;
		throw new ProcessError(code, output.getError(), output.getOutput());
	}

	return {
		code,
		... output
	};
}
