import global from './global';
import { Handle } from './interfaces';
import has, { add as hasAdd } from './has';

hasAdd('postmessage', typeof postMessage === 'function');
hasAdd('raf', typeof requestAnimationFrame === 'function');

function executeTask(item: QueueItem): void {
	if (item.isActive) {
		item.callback();
	}
}

function getQueueHandle(item: QueueItem, destructor?: (...args: any[]) => any): Handle {
	return {
		destroy: function () {
			this.destroy = function () {};
			item.isActive = false;
			item.callback = null;

			if (destructor) {
				destructor();
			}
		}
	};
}

interface PostMessageEvent extends Event {
	source: any;
	data: string;
}

export interface QueueItem {
	isActive: boolean;
	callback: (...args: any[]) => any;
}

export let queueTask = (function() {
	let enqueue: (item: QueueItem) => void;
	let destructor: (...args: any[]) => any;

	// Since the IE implementation of `setImmediate` is not flawless, we will test for
	// `postMessage` first.
	if (has('postmessage')) {
		let queue: QueueItem[] = [];

		global.addEventListener('message', function (event: PostMessageEvent): void {
			// Confirm that the event was triggered by the current window and by this particular implementation.
			if (event.source === global && event.data === 'dojo-queue-message') {
				event.stopPropagation();

				if (queue.length) {
					executeTask(queue.shift());
				}
			}
		});

		enqueue = function (item: QueueItem): void {
			queue.push(item);
			global.postMessage('dojo-queue-message', '*');
		};
	}
	else if (has('setimmediate')) {
		destructor = global.clearImmediate;
		enqueue = function (item: QueueItem): any {
			return setImmediate(executeTask.bind(null, item));
		};
	}
	else {
		destructor = global.clearTimeout;
		enqueue = function (item: QueueItem): any {
			return setTimeout(executeTask.bind(null, item), 0);
		};
	}

	return function (callback: (...args: any[]) => any): Handle {
		let item: QueueItem = {
			isActive: true,
			callback: callback
		};

		let id: any = enqueue(item);

		return getQueueHandle(item, destructor && function () {
			destructor(id);
		});
	};
})();

/**
 * Since requestAnimationFrame's behavior does not match that expected from `queueTask`, it is not used there.
 * However, at times it makes more sense to delegate to requestAnimationFrame; hence the following method.
 */
export let queueDomTask = (function () {
	if (!has('raf')) {
		return queueTask;
	}

	return function (callback: (...args: any[]) => any): Handle {
		let item: QueueItem = {
			isActive: true,
			callback: callback
		};

		let rafId: number = requestAnimationFrame(executeTask.bind(null, item));

		return getQueueHandle(item, function () {
			cancelAnimationFrame(rafId);
		});
	};
})();

export let queueMicroTask = (function () {
	let enqueue: (item: QueueItem) => void;

	if (has('promise')) {
		enqueue = function (item: QueueItem): void {
			global.Promise.resolve(item).then(executeTask);
		};
	}
	else if (has('host-node')) {
		enqueue = function (item: QueueItem): void {
			global.process.nextTick(executeTask.bind(null, item));
		};
	}
	else if (has('dom-mutationobserver')) {
		let HostMutationObserver = global.MutationObserver || global.WebKitMutationObserver;
		let queue: QueueItem[] = [];
		let node = document.createElement('div');
		let observer = new HostMutationObserver(function (): void {
			var item: QueueItem = queue.length && queue.shift();

			if (item && item.isActive) {
				item.callback();
			}
		});

		observer.observe(node, { attributes: true });

		enqueue = function (item: QueueItem): void {
			queue.push(item);
			node.setAttribute('queueStatus', '1');
		};
	}
	else {
		return queueTask;
	}

	return function (callback: (...args: any[]) => any): Handle {
		let item: QueueItem = {
			isActive: true,
			callback: callback
		};

		enqueue(item);

		return getQueueHandle(item);
	};
})();
